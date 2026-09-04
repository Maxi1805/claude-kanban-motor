/**
 * Z1 (Ola Z) — medición ad hoc, NO producción, no la importa ningún detector.
 *
 * Corre `analyzeRepo` UNA vez sobre un repo y evalúa
 * `buildCouplingWithoutAbstractionFindings` con VARIAS configuraciones de
 * `minSharedOperations` sobre EXACTAMENTE el mismo grafo. Así el A/B no puede
 * contaminarse con la deriva de otros frentes que editan el mismo árbol.
 *
 * Uso: npx tsx scripts/z1-probe.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { buildCouplingWithoutAbstractionFindings, detector } from "../src/server/services/detect/inter-file/coupling-without-abstraction.js";
import { testContext } from "../src/server/services/detect/testing.js";
import { pisoDeclarado } from "../src/server/services/detect/thresholds.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
import type { RepoUnit } from "../src/server/services/detect/types.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/z1-probe.mts <dir> <salida.json>");
  process.exit(1);
}

function thresholdWith(value: number) {
  return testContext({ thresholds: { k: pisoDeclarado(value, { rationale: "sonda Z1, no productivo" }) } }, "typescript").threshold("k");
}

const ctx = testContext(detector, "typescript");

let graph: CodeGraph | null = null;
const analysis = await analyzeRepo({
  dir,
  repoName: "z1",
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    graph = r.graph;
  },
});
if (!graph) {
  console.error("sin grafo");
  process.exit(1);
}

const repo: RepoUnit = {
  repoName: "z1",
  files: analysis.files,
  functions: [],
  clones: [],
  graph,
};

const SHARED_RE = /con el mismo nombre \(([^)]*)\)/;

function run(minShared: number, minShare = 0.5) {
  const findings = buildCouplingWithoutAbstractionFindings(
    repo,
    ctx.threshold("minClients"),
    ctx.threshold("maxUbiquitousFanInRatio"),
    ctx.threshold("maxFanoutConsidered"),
    ctx.threshold("minClientShareOfFanIn"),
    thresholdWith(minShared),
    thresholdWith(minShare),
    ctx.threshold("maxOperationUbiquity"),
    ctx.threshold("minAbstractionProtocol"),
  );
  return findings.map((f) => {
    const m = SHARED_RE.exec(f.detail);
    const ops = m ? m[1]!.split(", ").map((s) => s.replace(/^"|"$/g, "")) : [];
    return {
      title: f.title,
      a: f.locations[0]!.file,
      b: f.locations[1]!.file,
      clients: f.locations.slice(2).map((l) => l.file),
      clientCount: f.trigger[0]!.value,
      sharedOps: ops,
      sharedCount: f.trigger[1]!.value,
      protocolShare: f.trigger[2]?.value ?? null,
      severity: f.severity,
    };
  });
}

// Los ids ESTABLES de la corrida de produccion de este mismo repo, para poder cruzar
// contra `tests/golden/precision/*.verdicts.csv` sin volver a analizar.
const produccion = analysis.findings
  .filter((f) => f.kind === "coupling-without-abstraction")
  .map((f) => ({ id: f.id ?? stableFindingId(f), title: f.title, where: f.locations.map((l) => l.file) }));

const result = {
  dir,
  files: analysis.files.length,
  produccion,
  variants: {
    // ANTES de la Ola Z: piso de presencia (>=1 operación compartida). La excepción de
    // protocolo no puede cambiar nada con este piso, así que reproduce la producción vieja.
    "min1": run(1),
    // DESPUÉS, sin la excepción (piso de participación imposible de alcanzar).
    "min2": run(2, 1.01),
    // DESPUÉS, tal como queda en producción.
    "min2-escape": run(2, 0.5),
  },
};

writeFileSync(out, JSON.stringify(result, null, 2));
console.error(
  `z1-probe ${dir}: min1=${result.variants.min1.length} min2=${result.variants.min2.length} min2-escape=${result.variants["min2-escape"].length}`,
);
