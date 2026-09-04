/**
 * Sonda de juicio (frente "cuatro patrones mudos") — independiente de lo que
 * ya declaró la ola anterior para Abstract Factory. Corre `analyzeRepo` real
 * sobre un directorio, capturando el `CodeGraph` real vía `onGraph`, y llama
 * a `buildParallelHierarchiesFindings` (la función exportada, no reescrita)
 * con `minGroupSize=1` para volcar TODAS las componentes conexas del grafo
 * `extends`/`implements`, agrupadas por firma de forma — no sólo las que ya
 * pasan el piso de `minGroupSize=2` en producción. Objetivo: verificar a
 * mano si "cero grupos de >=2 con la misma firma" es cierto porque las
 * componentes reales tienen firmas DISTINTAS (verificación fuerte, lo que
 * reclama la tarea) o porque el grafo no tiene componentes en absoluto
 * (silencio por falta de insumo, un resultado muy distinto).
 *
 * Uso: npx tsx scripts/probe-abstract-factory-raw-shapes.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { buildParallelHierarchiesFindings } from "../src/server/services/detect/inter-file/parallel-hierarchies.js";
import { pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
import type { RepoUnit } from "../src/server/services/detect/types.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/probe-abstract-factory-raw-shapes.mts <dir> <slug>");
    process.exit(1);
  }

  let capturedGraph: CodeGraph | null = null;
  await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: ({ graph }) => {
      capturedGraph = graph;
    },
  });

  if (!capturedGraph) {
    console.log(`[${slug}] onGraph nunca se llamó — sin grafo en esta corrida.`);
    return;
  }
  const graph: CodeGraph = capturedGraph;

  const extendsImplementsCount = graph.edges.filter((e) => e.kind === "extends" || e.kind === "implements").length;
  console.log(`[${slug}] aristas extends+implements en el grafo real: ${extendsImplementsCount}`);

  const dummyRepo: RepoUnit = { repoName: slug, files: [], functions: [], clones: [], graph };
  const minHierarchySize = resolveThreshold(pisoDeclarado(3, { rationale: "sonda" }), { language: "*", sampleSize: () => 0, corpusP95: () => null });
  const minGroupSizeOne = resolveThreshold(pisoDeclarado(1, { rationale: "sonda: quiero ver TODAS las componentes, agrupadas por firma, no sólo las que ya matchean con otra." }), {
    language: "*",
    sampleSize: () => 0,
    corpusP95: () => null,
  });

  const allShapesFindings = buildParallelHierarchiesFindings(dummyRepo, graph, minHierarchySize, minGroupSizeOne);
  console.log(`[${slug}] componentes de tamaño >=3 agrupadas por firma (minGroupSize=1, para ver TODO): ${allShapesFindings.length} grupo(s) de firma distinta`);
  for (const f of allShapesFindings) {
    const sizeMatch = /(\d+) jerarquías con la misma forma \((\d+) miembros/.exec(f.title);
    console.log(`  firma con ${f.trigger[0]!.value} componente(s) — ${f.evidence![0]!.value} miembros/raíces ${f.evidence![1]!.value} — ejemplo: ${f.locations[0]!.file}#${f.locations[0]!.symbol}`);
  }

  const minGroupSizeTwo = resolveThreshold(pisoDeclarado(2, { rationale: "sonda: comportamiento real de producción." }), {
    language: "*",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
  const realFindings = buildParallelHierarchiesFindings(dummyRepo, graph, minHierarchySize, minGroupSizeTwo);
  console.log(`[${slug}] Findings reales (minGroupSize=2, producción): ${realFindings.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
