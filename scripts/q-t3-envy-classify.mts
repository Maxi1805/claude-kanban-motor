/**
 * SONDA T3 (Ola Q) — DE QUÉ ESTÁ HECHO EL VOLUMEN de `feature-envy-inter`.
 *
 * Corre el pipeline real, usa el detector real (`buildFeatureEnvyInterFindings`,
 * importado sin editar) para los hallazgos de HOY, y para cada uno vuelve a
 * mirar el grafo para clasificar la forma: ¿el archivo dominante es del MISMO
 * directorio (mismo paquete/carpeta de dominio)? ¿los símbolos referenciados
 * son mayormente `family` no-operacional (interface/type/enum, no sólo
 * "other")? ¿el nombre del propio archivo es un patrón de envoltorio
 * (`component.*`/`directive.*`/`adapter.*` junto a `index.*` en la misma
 * carpeta)?
 *
 * Uso: npx tsx scripts/q-t3-envy-classify.mts <dir> <slug>
 */
import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { buildFeatureEnvyInterFindings } from "../src/server/services/detect/inter-file/feature-envy-inter.js";
import { citado, pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
import type { FileSummary } from "../src/server/services/detect/types.js";

const [, , dir, slug] = process.argv;
if (!dir || !slug) {
  console.error("uso: npx tsx scripts/q-t3-envy-classify.mts <dir> <slug>");
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
if (!graph) {
  console.error(`[${slug}] sin grafo.`);
  process.exit(1);
}
const g: CodeGraph = graph;
const files = analysis.files as unknown as FileSummary[];

const ri = { language: slug, sampleSize: () => 0, corpusP95: () => null };
const atfd = resolveThreshold(citado(2, { work: "sonda", rule: "sonda" }), ri);
const laa = resolveThreshold(citado(1 / 3, { work: "sonda", rule: "sonda" }), ri);
const dominance = resolveThreshold(pisoDeclarado(0.5, { rationale: "sonda" }), ri);
const maxUbi = resolveThreshold(pisoDeclarado(0.1, { rationale: "sonda" }), ri);
const mMin = resolveThreshold(pisoDeclarado(0.5, { rationale: "sonda" }), ri);
const mMax = resolveThreshold(pisoDeclarado(0.3, { rationale: "sonda" }), ri);

const findings = buildFeatureEnvyInterFindings(files, g, atfd, laa, dominance, maxUbi, mMin, mMax);
console.log(`# ${slug}: total feature-envy-inter findings HOY = ${findings.length}`);

const nodeById = new Map(g.nodes.map((n) => [n.id, n] as const));
const fileOf = new Map(g.nodes.map((n) => [n.id, n.file] as const));

for (const f of findings) {
  const own = f.locations[0]!.file;
  const titleMatch = /referencia más símbolos de "(.+?)" que de sí mismo/.exec(f.title);
  const dom = titleMatch ? titleMatch[1]! : "?";
  // familias de los símbolos DISTINTOS referenciados en el archivo dominante, recalculado
  const distinct = new Set<string>();
  for (const e of g.edges) {
    if (e.kind !== "references") continue;
    if (e.provenance !== "declared" && e.provenance !== "resolved") continue;
    if (fileOf.get(e.from) !== own || fileOf.get(e.to) !== dom) continue;
    distinct.add(e.to);
  }
  const families = [...distinct].map((id) => nodeById.get(id)?.family ?? "?");
  const famCounts = new Map<string, number>();
  for (const fam of families) famCounts.set(fam, (famCounts.get(fam) ?? 0) + 1);
  const sameFolder = path.dirname(own) === path.dirname(dom);
  const ownBase = path.basename(own).toLowerCase();
  const domBase = path.basename(dom).toLowerCase();
  const wrapperShape = /^(component|directive|adapter|wrapper)\./.test(ownBase) && domBase.startsWith("index.");
  const bothDts = own.endsWith(".d.ts") && dom.endsWith(".d.ts");
  console.log(
    `  ${own} -> ${dom} | sameFolder=${sameFolder} wrapperShape=${wrapperShape} bothDts=${bothDts} familias=${JSON.stringify(Object.fromEntries(famCounts))}`,
  );
}
