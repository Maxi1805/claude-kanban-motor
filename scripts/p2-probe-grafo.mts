/**
 * SONDA DEL FRENTE P2 (Ola P) — el grafo crudo de un repo, resumido en los
 * números que los cuatro cambios de este frente mueven, para poder verificar
 * cada uno por separado sin leer 300 MB de JSON:
 *
 *   1. `memberOfClassLike`/`exported` en el nodo (¿llegaron? ¿en qué proporción?).
 *   2. Los especificadores de import NO resueltos (cuántos, y cuántos de ésos
 *      no resuelven en NINGÚN archivo del repo — el discriminador de N9).
 *   3. `callArities` en la arista (¿cuántas aristas lo traen?).
 *   4. La auto-referencia mismo archivo/símbolo: cuántas aristas
 *      `references`/`calls` quedan DENTRO del mismo archivo, y el fan-in de
 *      un símbolo nombrado por `--simbolo`.
 *
 * Pipeline de producción real (`analyzeRepo` + `onGraph`), nunca un atajo.
 *
 * Uso: npx tsx scripts/p2-probe-grafo.mts <dir> <slug> [salida.json]
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug) {
  console.error("uso: npx tsx scripts/p2-probe-grafo.mts <dir> <slug> [salida.json]");
  process.exit(1);
}

const state: { graph: CodeGraph | null; files: Map<string, { readonly path: string; readonly edges?: readonly { kind: string; toName: string }[] }> } = {
  graph: null,
  files: new Map(),
};
const analysis = await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    state.graph = r.graph;
    state.files = r.cache.filesByPath as never;
  },
});
const graph = state.graph;
if (!graph) {
  console.error(`[p2] ${slug}: sin grafo.`);
  process.exit(1);
}

const languageByFile = new Map(analysis.files.map((f) => [f.path, f.language]));

const symbolNodes = graph.nodes.filter((n) => n.kind === "symbol");
const conMember = symbolNodes.filter((n) => n.memberOfClassLike === true).length;
const sinMember = symbolNodes.filter((n) => n.memberOfClassLike === undefined).length;
const conExported = symbolNodes.filter((n) => n.exported === true).length;
const noExported = symbolNodes.filter((n) => n.exported === false).length;

// `memberOfClassLike` con `symbolPath` de UN segmento — la brecha de Go que
// motivó el pedido: un método con receptor que la profundidad no distingue.
const memberDeUnSegmento = symbolNodes.filter((n) => n.memberOfClassLike === true && n.symbolPath.length === 1);
const porLenguajeMember = new Map<string, number>();
for (const n of memberDeUnSegmento) {
  const lang = languageByFile.get(n.file) ?? "?";
  porLenguajeMember.set(lang, (porLenguajeMember.get(lang) ?? 0) + 1);
}

const porKind = new Map<string, number>();
for (const e of graph.edges) porKind.set(e.kind, (porKind.get(e.kind) ?? 0) + 1);

const conAridad = graph.edges.filter((e) => e.callArities !== undefined);
const aridadesMultiples = conAridad.filter((e) => (e.callArities ?? []).length > 1).length;

const fileOf = (id: string): string => {
  if (id.startsWith("sym:")) return id.slice(4).split("#")[0] ?? "";
  if (id.startsWith("file:")) return id.slice(5);
  return "";
};
const refEdges = graph.edges.filter((e) => e.kind === "references" || e.kind === "calls");
const intraArchivo = refEdges.filter((e) => fileOf(e.from) === fileOf(e.to) && fileOf(e.from) !== "").length;

const fanIn = new Map<string, number>();
for (const e of refEdges) fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + e.weight);

// Los especificadores de import crudos, y cuántos NO resuelven a un archivo
// del repo. Se cuentan acá (y no vía `classifyImportSpecifiers`) para que el
// número valga igual con los archivos de ANTES del frente: `filesByPath` trae
// los `EdgeFacts` crudos y las aristas `imports` del grafo son las resueltas.
let importFactsTotal = 0;
const especificadores = new Set<string>();
for (const f of state.files.values()) {
  for (const ef of f.edges ?? []) {
    if (ef.kind !== "imports") continue;
    importFactsTotal++;
    especificadores.add(ef.toName);
  }
}
const importEdges = graph.edges.filter((e) => e.kind === "imports").length;

// La clasificación REAL (sólo disponible con los archivos de este frente):
// `CK_P2_CLASIFICAR=1` para pedirla — sin el flag el probe corre igual contra
// el árbol de ANTES, que no tiene la función.
let clasificacion: Record<string, number> | undefined;
if (process.env.CK_P2_CLASIFICAR === "1") {
  const { classifyImportSpecifiers } = await import("../src/server/services/graph/imports-target.js");
  const entrada = [...state.files.values()].map((f) => ({
    path: f.path,
    edges: ((f.edges ?? []) as never as { kind: string }[]).filter((ef) => ef.kind === "imports"),
  }));
  const c = classifyImportSpecifiers(entrada as never);
  let res = 0;
  let nores = 0;
  let noresNuncaResuelve = 0;
  for (const v of c.byFile.values()) {
    res += v.resolved.length;
    nores += v.unresolved.length;
    for (const spec of v.unresolved) if (!c.resolvedSomewhere.has(spec)) noresNuncaResuelve++;
  }
  clasificacion = { archivosConImports: c.byFile.size, resueltos: res, noResueltos: nores, noResueltosQueNuncaResuelven: noresNuncaResuelve };
}

const resumen = {
  slug,
  importFactsCrudos: importFactsTotal,
  importEspecificadoresDistintos: especificadores.size,
  importAristasResueltas: importEdges,
  clasificacion,
  archivos: analysis.files.length,
  nodos: graph.nodes.length,
  nodosSimbolo: symbolNodes.length,
  memberOfClassLike: { true: conMember, ausente: sinMember },
  memberDeUnSegmentoPorLenguaje: Object.fromEntries([...porLenguajeMember].sort()),
  exported: { true: conExported, false: noExported },
  aristas: graph.edges.length,
  aristasPorKind: Object.fromEntries([...porKind].sort()),
  aristasConCallArities: conAridad.length,
  aristasConMasDeUnaAridad: aridadesMultiples,
  refsIntraArchivo: intraArchivo,
  refsTotal: refEdges.length,
  hallazgos: analysis.findings.length,
  hallazgosUnusedSymbol: analysis.findings.filter((f) => f.kind === "unused-symbol").length,
  resolution: graph.resolution,
};

console.log(JSON.stringify(resumen, null, 2));

const simbolo = process.env.CK_P2_SIMBOLO;
if (simbolo) {
  const objetivo = graph.nodes.filter((n) => n.id.includes(simbolo));
  for (const n of objetivo) {
    console.log(
      `[simbolo] ${n.id} family=${n.family} member=${String(n.memberOfClassLike)} exported=${String(n.exported)} fanIn=${fanIn.get(n.id) ?? 0}`,
    );
  }
}

if (outFile) {
  await fs.writeFile(
    outFile,
    JSON.stringify(
      {
        ...resumen,
        nodos_: graph.nodes.map((n) => ({
          id: n.id,
          kind: n.kind,
          family: n.family,
          memberOfClassLike: n.memberOfClassLike,
          exported: n.exported,
        })),
        aristas_: graph.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, weight: e.weight, callArities: e.callArities })),
      },
      null,
      1,
    ),
  );
  console.error(`[p2] escrito ${outFile}`);
}
