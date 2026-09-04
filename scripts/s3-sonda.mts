/**
 * SONDA DEL FRENTE S3 (Ola S) — vuelca, de UNA corrida real de `analyzeRepo`,
 * lo que hace falta para diseñar y medir OFFLINE variantes del criterio de
 * "subárbol autocontenido" SIN re-pagar el análisis por cada variante.
 *
 * Es la sonda de `q-f2-sonda.mts` ENSANCHADA en un solo eje, el que el frente
 * necesita y aquélla no traía: además del grafo proyectado a archivo, vuelca
 * **el NOMBRE del símbolo de cada extremo de cada arista**. Sin eso no se puede
 * medir la hipótesis central de este frente —que las aristas ENTRANTES hacia
 * los árboles de demo/banco de pruebas están FABRICADAS por homonimia (F2 §3.5,
 * dos casos verificados)— porque la proyección a archivo borra justo el dato.
 *
 * HUELLA DEL GRAFO, a propósito (lección de método de la Ola P: un volcado SE
 * VENCE): `nodos`/`aristas`/`generadoEn` quedan en el JSON. Un volcado aísla un
 * DELTA; no publica un ABSOLUTO.
 *
 * Uso: npx tsx scripts/s3-sonda.mts <dir> <slug> <salida.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { edgeIsAmbiguous, type CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/s3-sonda.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const state: { graph: CodeGraph | null } = { graph: null };
const analysis = await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    state.graph = r.graph;
  },
});

const graph = state.graph;
const nodo = new Map(graph ? graph.nodes.map((n) => [n.id, n] as const) : []);

/** Aristas de código proyectadas a archivo, conservando el nombre de cada extremo. */
const aristas: {
  desde: string;
  hacia: string;
  kind: string;
  prov: string;
  peso: number;
  nombreDesde: string;
  nombreHacia: string;
  ambigua: boolean;
  /** Del nodo DESTINO: lo que el grafo sabe sobre su alcanzabilidad desde afuera. */
  destino: {
    kind: string;
    family?: string;
    ruta: readonly string[];
    exported?: boolean;
    visibility?: string;
    miembro?: boolean;
  };
  origen: { kind: string; family?: string; ruta: readonly string[] };
}[] = [];
if (graph) {
  for (const e of graph.edges) {
    if (e.kind === "contains") continue;
    const a = nodo.get(e.from);
    const b = nodo.get(e.to);
    if (!a || !b || a.file === b.file) continue;
    aristas.push({
      desde: a.file,
      hacia: b.file,
      kind: e.kind,
      prov: e.provenance,
      peso: e.weight,
      nombreDesde: a.symbolPath.at(-1) ?? "",
      nombreHacia: b.symbolPath.at(-1) ?? "",
      ambigua: edgeIsAmbiguous(e),
      destino: {
        kind: b.kind,
        family: b.family,
        ruta: b.symbolPath,
        exported: b.exported,
        visibility: b.visibility,
        miembro: b.memberOfClassLike,
      },
      origen: { kind: a.kind, family: a.family, ruta: a.symbolPath },
    });
  }
}

/** Todo nombre declarado (símbolo Y portador), con en qué archivos se declara. */
const declaraciones: Record<string, string[]> = {};
const declaracionesSoloSimbolo: Record<string, string[]> = {};
if (graph) {
  const porNombre = new Map<string, Set<string>>();
  const soloSim = new Map<string, Set<string>>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" && n.kind !== "carrier") continue;
    const nombre = n.symbolPath.at(-1);
    if (!nombre) continue;
    let set = porNombre.get(nombre);
    if (!set) porNombre.set(nombre, (set = new Set()));
    set.add(n.file);
    if (n.kind === "symbol") {
      let s2 = soloSim.get(nombre);
      if (!s2) soloSim.set(nombre, (s2 = new Set()));
      s2.add(n.file);
    }
  }
  for (const [nombre, files] of porNombre) declaraciones[nombre] = [...files].sort();
  for (const [nombre, files] of soloSim) declaracionesSoloSimbolo[nombre] = [...files].sort();
}

const hallazgos = analysis.findings
  .filter((f) => f.kind === "duplication" || f.kind === "distributed-duplication")
  .map((f) => ({
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    memberCount: f.memberCount ?? 1,
    archivos: [...new Set(f.locations.map((l) => l.file))].sort(),
  }));

writeFileSync(
  outFile,
  JSON.stringify({
    slug,
    generadoEn: new Date().toISOString(),
    grafo: { nodos: graph?.nodes.length ?? 0, aristas: graph?.edges.length ?? 0 },
    files: analysis.files.map((f) => ({ path: f.path, lines: f.lines, language: f.language })),
    aristas,
    declaraciones,
    declaracionesSoloSimbolo,
    hallazgos,
  }),
);
console.log(`${outFile}: ${analysis.files.length} archivos, ${aristas.length} aristas de archivo, ${hallazgos.length} hallazgos`);
