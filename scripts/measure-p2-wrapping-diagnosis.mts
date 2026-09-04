/**
 * Ola 11a, P2 — diagnóstico previo a tocar nada (hipótesis a vs b del
 * encargo). Corre `analyzeRepo` real sobre UNA fixture canónica
 * (`tests/fixtures/patterns/decorator` o `.../template_method`) y mide:
 *   1. Findings por kind y archivo — ¿nace algún ancla de decorator.ts /
 *      template-method.ts en la fixture?
 *   2. De las aristas `calls` reales del grafo: cuántas traen `roles !=
 *      undefined` y cuántas traen el bit `receiver-member` puesto
 *      (`EDGE_ROLE_RECEIVER_MEMBER`, vía `edgeHasRole`).
 *   3. `findWrappingChains(graph)` — matches de la Terna de Envoltura.
 *
 * UN proceso a la vez (regla de memoria de la ola). Uso:
 *   npx tsx scripts/measure-p2-wrapping-diagnosis.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { edgeHasRole, type CodeGraph } from "../src/server/services/graph/types.js";
import { findWrappingChains } from "../src/server/services/hypotheses/wrapping-chain.js";
import type { CodeFinding } from "../src/shared/types.js";

// Actualizado tras el arreglo de esta ola: `homonymous-delegation`
// (Decorator) e `inheritance-family` (Template Method) son los anclas
// NUEVOS que este paquete agregó — ver detect/intra-file/*.
const DECORATOR_ANCHORS = new Set(["flag-accumulator", "boolean-flag-param", "boolean-complexity", "long-parameter-list", "large-class", "refused-bequest", "homonymous-delegation"]);
const TEMPLATE_METHOD_ANCHORS = new Set(["distributed-duplication", "parallel-hierarchies", "large-class", "refused-bequest", "inheritance-family"]);

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-p2-wrapping-diagnosis.mts <dir> <slug>");
    process.exit(1);
  }

  let graph: CodeGraph | null = null;
  const analysis = await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      graph = r.graph;
    },
  });
  const findings: readonly CodeFinding[] = analysis.findings;

  const byKindFile = new Map<string, Set<string>>();
  for (const f of findings) {
    const set = byKindFile.get(f.kind) ?? new Set<string>();
    for (const loc of f.locations) set.add(loc.file);
    byKindFile.set(f.kind, set);
  }

  console.log(`\n=== ${slug} — findings por kind (${findings.length} total) ===`);
  for (const [kind, files] of [...byKindFile.entries()].sort()) {
    console.log(`  ${kind}: ${files.size} archivo(s) — ${[...files].join(", ")}`);
  }

  const decoratorAnchorsHit = [...byKindFile.keys()].filter((k) => DECORATOR_ANCHORS.has(k));
  const templateAnchorsHit = [...byKindFile.keys()].filter((k) => TEMPLATE_METHOD_ANCHORS.has(k));
  console.log(`\n  anclas decorator.ts presentes: ${decoratorAnchorsHit.length ? decoratorAnchorsHit.join(", ") : "NINGUNA"}`);
  console.log(`  anclas template-method.ts presentes: ${templateAnchorsHit.length ? templateAnchorsHit.join(", ") : "NINGUNA"}`);

  if (!graph) {
    console.log("\n  graph === null — no se pudo medir aristas.");
    return;
  }
  const g = graph as CodeGraph;

  const callsEdges = g.edges.filter((e) => e.kind === "calls");
  const referencesEdges = g.edges.filter((e) => e.kind === "references");
  const callsWithRoles = callsEdges.filter((e) => e.roles !== undefined);
  const callsWithReceiverMember = callsEdges.filter((e) => edgeHasRole(e, "receiver-member"));
  const refsWithReceiverMember = referencesEdges.filter((e) => edgeHasRole(e, "receiver-member"));

  console.log(`\n=== ${slug} — aristas ===`);
  console.log(`  calls: ${callsEdges.length} total, ${callsWithRoles.length} con roles!=undefined, ${callsWithReceiverMember.length} con bit receiver-member`);
  console.log(`  references: ${referencesEdges.length} total, ${refsWithReceiverMember.length} con bit receiver-member`);

  const extendsEdges = g.edges.filter((e) => e.kind === "extends");
  const implementsEdges = g.edges.filter((e) => e.kind === "implements");
  const satisfiesEdges = g.edges.filter((e) => e.kind === "satisfies");
  console.log(`  extends: ${extendsEdges.length}, implements: ${implementsEdges.length}, satisfies: ${satisfiesEdges.length}`);
  for (const e of [...extendsEdges, ...implementsEdges, ...satisfiesEdges]) {
    console.log(`    ${e.kind}: ${e.from} -> ${e.to}`);
  }

  const matches = findWrappingChains(g);
  console.log(`\n  findWrappingChains: ${matches.length} matches`);
  for (const m of matches.slice(0, 10)) {
    console.log(`    ${m.wrapperId} --calls(${m.memberName}/${m.memberArity})--> ${m.wrappedId} (interfaz: ${m.interfaceId}, satisfies: ${m.viaSatisfies})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
