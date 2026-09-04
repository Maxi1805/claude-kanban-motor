/**
 * SONDA T3 (Ola Q) — DE QUÉ ESTÁ HECHO EL VOLUMEN de `orphan-file`.
 *
 * Corre el pipeline real UNA vez por repo (`analyzeRepo`, `onGraph`) y, para
 * CADA archivo que el detector real (`buildOrphanFileFindings`, importado
 * SIN TOCAR — sólo se llama, no se edita) marca huérfano HOY, mide contra el
 * MISMO grafo si existe alguna arista cross-archivo de CUALQUIER kind/
 * provenance (incluida `ambiguous`, que el detector excluye por diseño).
 *
 * Clasifica cada hallazgo en una de tres formas ESTRUCTURALES (no por texto
 * de título):
 *   A) "arista-ambigua-escondida": existe >=1 arista cross-archivo de
 *      CUALQUIER kind cuya única razón de no contar es `provenance:
 *      "ambiguous"` — el archivo SÍ tiene un consumidor real, el detector no
 *      lo ve por el filtro de confianza.
 *   B) "cero-aristas-total": no existe NINGUNA arista cross-archivo, ni
 *      siquiera ambigua — candidato genuino a "cargado por convención" o
 *      "código muerto real" (hay que leer el archivo para distinguir, pero
 *      el grafo no tiene NADA que decir).
 *   C) "otro" (no debería ocurrir: si hay una arista confidente el propio
 *      detector no lo habría emitido).
 *
 * Uso: npx tsx scripts/q-t3-orphan-classify.mts <dir> <slug>
 */
import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { buildOrphanFileFindings } from "../src/server/services/detect/inter-file/orphan-file.js";
import { presencia, pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import { edgeIsAmbiguous, type CodeGraph } from "../src/server/services/graph/types.js";
import type { FileSummary } from "../src/server/services/detect/types.js";

const [, , dir, slug] = process.argv;
if (!dir || !slug) {
  console.error("uso: npx tsx scripts/q-t3-orphan-classify.mts <dir> <slug>");
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
const files = analysis.files as unknown as FileSummary[];
if (!graph) {
  console.error(`[${slug}] sin grafo.`);
  process.exit(1);
}
const g: CodeGraph = graph;

const resolveInput = { language: slug, sampleSize: () => 0, corpusP95: () => null };
const presence = resolveThreshold(presencia({ rationale: "sonda" }), resolveInput);
const mirrorMin = resolveThreshold(pisoDeclarado(0.5, { rationale: "sonda" }), resolveInput);
const mirrorMax = resolveThreshold(pisoDeclarado(0.3, { rationale: "sonda" }), resolveInput);

const findings = buildOrphanFileFindings(files, g, presence, mirrorMin, mirrorMax);

const fileOf = new Map(g.nodes.map((n) => [n.id, n.file] as const));

for (const f of findings) {
  const target = f.locations[0]!.file;
  let ambiguousCrossFile = 0;
  let confidentCrossFile = 0;
  const kinds = new Map<string, number>();
  for (const e of g.edges) {
    if (e.kind === "contains") continue;
    const ff = fileOf.get(e.from);
    const ft = fileOf.get(e.to);
    if (ff === undefined || ft === undefined || ff === ft) continue;
    if (ff !== target && ft !== target) continue;
    if (edgeIsAmbiguous(e)) ambiguousCrossFile++;
    else confidentCrossFile++;
    kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  }
  const forma =
    confidentCrossFile > 0
      ? "C-otro(bug-sonda)"
      : ambiguousCrossFile > 0
        ? "A-arista-ambigua-escondida"
        : "B-cero-aristas-total";
  console.log(
    `${slug}\t${target}\t${forma}\tambiguas=${ambiguousCrossFile}\tconfidentes=${confidentCrossFile}\tkinds=${JSON.stringify(Object.fromEntries(kinds))}`,
  );
}
console.log(`# ${slug}: total orphan-file findings HOY = ${findings.length}`);
