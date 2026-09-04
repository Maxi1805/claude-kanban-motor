/**
 * Diagnóstico de integración (Ola 10, integrador): confirma con un análisis
 * REAL (`analyzeRepo`, sin mocks) que `neighborhoodIndex` construido en
 * `code-analyzer.ts` NO es el índice vacío — usa la MISMA función exportada
 * (`buildNeighborhoodIndex`) con el MISMO grafo/findings reales que produce
 * `analyzeRepo` sobre un repo real (vía `onGraph`), igual que
 * `code-analyzer.ts:1900`.
 *
 * Uso: npx tsx scripts/verify-neighborhood-integrator.mts <dir> [repoName]
 */
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { buildNeighborhoodIndex, neighborhoodFor, EMPTY_NEIGHBORHOOD } from "../src/server/services/graph/neighborhood.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const dir = process.argv[2];
const repoName = process.argv[3] ?? "verify";

let graph: CodeGraph | null = null;
const analysis = await analyzeRepo({
  dir,
  repoName,
  limits: { maxFindings: "unlimited" },
  onGraph: (r: { graph: CodeGraph }) => (graph = r.graph),
});

const findings = analysis.findings as any[];
console.log(
  `analyzeRepo(${repoName}): ${findings.length} findings, graph nodes=${graph ? (graph as CodeGraph).nodes.length : "null"}, graph edges=${graph ? (graph as CodeGraph).edges.length : "null"}`,
);

const index = buildNeighborhoodIndex(graph, findings as any, null);
console.log(
  `NeighborhoodIndex real: nodeById.size=${index.nodeById.size}, findingsByFile.size=${index.findingsByFile.size}, findingsByKind.size=${index.findingsByKind.size}, findingsByAnchor.size=${index.findingsByAnchor.size}`,
);

const byFile = new Map<string, number>();
for (const f of findings) {
  for (const loc of f.locations) byFile.set(loc.file, (byFile.get(loc.file) ?? 0) + 1);
}
const busiest = [...byFile.entries()].sort((a, b) => b[1] - a[1])[0];
console.log(`archivo con más findings: ${busiest?.[0]} (${busiest?.[1]} findings)`);

if (findings.length > 0) {
  const someFinding = findings.find((f) => f.locations[0].file === busiest?.[0]) ?? findings[0];
  const nbEmpty = EMPTY_NEIGHBORHOOD.findingsInFile(someFinding.locations[0].file);
  const nb = neighborhoodFor(index, someFinding);
  const sameFile = nb.findingsInFile(someFinding.locations[0].file);
  console.log(`EMPTY_NEIGHBORHOOD.findingsInFile(mismo archivo): ${nbEmpty.length} (debe ser 0 siempre, por diseño)`);
  console.log(`neighborhoodFor(index REAL, finding real).findingsInFile(su propio archivo): ${sameFile.length} hallazgos`);
  const sameKind = nb.findingsOfKind(someFinding.kind);
  console.log(`neighborhoodFor(index REAL).findingsOfKind("${someFinding.kind}"): ${sameKind.length} hallazgos`);
}

console.log(
  index.nodeById.size > 0 && graph !== null
    ? "RESULTADO: neighborhoodIndex NO esta vacio (nodeById.size > 0) con grafo real."
    : "RESULTADO: sin grafo o vacio.",
);
