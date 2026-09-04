/**
 * SONDA DEL FRENTE N1 (Ola O) — volumen de `unused-symbol` por LENGUAJE, ANTES
 * y DESPUÉS, sobre EL MISMO grafo y en la MISMA corrida.
 *
 * DOS COSAS QUE ESTA SONDA HACE A PROPÓSITO:
 *
 * 1. **Mide crudo Y emitido.** El detector declara `maxFindings:
 *    presupuesto(200)`, y hasta la Ola O ese tope estaba SATURADO en 12 de los
 *    13 repos del corpus (guava producía 21.587 candidatos para 200 emitidos).
 *    Un arreglo que baje el conjunto de candidatos a la mitad no mueve el
 *    número emitido ni un punto; hacen falta las dos cifras para saber qué
 *    pasó.
 *
 * 2. **Corre la selección VIEJA y la NUEVA contra el mismo `CodeGraph`.** Trece
 *    frentes editan el árbol a la vez y varios tocan `graph/`; medir "antes" y
 *    "después" en corridas separadas mezclaría el efecto de este frente con el
 *    de los otros. `candidatosAntes` de abajo es el port fiel de la selección
 *    previa a esta ola (sólo la parte que decide QUÉ es candidato, que es lo
 *    que fija el volumen), así que las dos columnas salen del mismo grafo.
 *
 * Uso: npx tsx scripts/n1-unused-symbol-probe.mts <dir> <slug> <salida.json>
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { CONSTRUCTOR_NAMES } from "../src/server/services/code-grammar.js";
import { detector } from "../src/server/services/detect/inter-file/unused-symbol.js";
import { testContext } from "../src/server/services/detect/testing.js";
import { edgeIsAmbiguous, type CodeGraph, type CodeGraphNode, type EdgeKind } from "../src/server/services/graph/types.js";

/* ─────────── Port fiel de la selección ANTERIOR a la Ola O ─────────── */

const CONSUMER_ANTES: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["references", "calls", "instantiates", "invokes-indirect", "carries"]);
const FAMILIAS = new Set(["function-like", "class-like"]);
const DUNDER = /^__\w+__$/;

function ultimo(n: CodeGraphNode): string {
  return n.symbolPath[n.symbolPath.length - 1] ?? "?";
}

function candidatosAntes(graph: CodeGraph, libraryThreshold: number): CodeGraphNode[] {
  const fanIn = new Map<string, number>();
  for (const e of graph.edges) {
    if (edgeIsAmbiguous(e) || !CONSUMER_ANTES.has(e.kind)) continue;
    fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + e.weight);
  }
  const porRuta = new Map<string, CodeGraphNode>();
  const topPorArchivo = new Map<string, CodeGraphNode[]>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol") continue;
    porRuta.set(`${n.file} ${n.symbolPath.join(" ")}`, n);
    if (n.symbolPath.length === 1) {
      const l = topPorArchivo.get(n.file);
      if (l) l.push(n);
      else topPorArchivo.set(n.file, [n]);
    }
  }
  const contenedores = (n: CodeGraphNode): CodeGraphNode[] => {
    const start = n.startLine ?? 1;
    const end = n.endLine ?? start;
    const out: CodeGraphNode[] = [];
    for (const o of topPorArchivo.get(n.file) ?? []) {
      if (o.id === n.id) continue;
      const os = o.startLine ?? 1;
      const oe = o.endLine ?? os;
      if (os <= start && oe >= end && (os < start || oe > end)) out.push(o);
    }
    return out;
  };
  const esCandidato = (n: CodeGraphNode): boolean =>
    n.kind === "symbol" && !!n.family && FAMILIAS.has(n.family) && !/@\d+$/.test(n.id);

  let total = 0;
  let sinUso = 0;
  for (const n of graph.nodes) {
    if (!esCandidato(n) || n.symbolPath.length !== 1 || contenedores(n).length > 0) continue;
    total++;
    if ((fanIn.get(n.id) ?? 0) === 0) sinUso++;
  }
  const pareceBiblioteca = (total > 0 ? sinUso / total : 0) >= libraryThreshold;

  const out: CodeGraphNode[] = [];
  for (const n of graph.nodes) {
    if (!esCandidato(n) || (fanIn.get(n.id) ?? 0) !== 0) continue;
    const nombre = ultimo(n);
    const top = n.symbolPath.length === 1;
    if (top && nombre.toLowerCase() === "main") continue;
    if (DUNDER.test(nombre)) continue;
    const dueno = n.symbolPath.length >= 2 ? (porRuta.get(`${n.file} ${n.symbolPath.slice(0, -1).join(" ")}`) ?? null) : null;
    const esCtor = !top && (CONSTRUCTOR_NAMES.has(nombre.toLowerCase()) || (dueno !== null && nombre === ultimo(dueno)));
    if (esCtor && dueno && (fanIn.get(dueno.id) ?? 0) > 0) continue;
    const conts = top ? contenedores(n) : [];
    if (conts.length > 0 && conts.some((c) => (fanIn.get(c.id) ?? 0) > 0)) continue;
    if (top && conts.length === 0 && pareceBiblioteca) continue;
    out.push(n);
  }
  return out;
}

/* ─────────────────────────────── sonda ─────────────────────────────── */

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/n1-unused-symbol-probe.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const rootDir = path.resolve(dir);
const t0 = performance.now();
const state: { graph: CodeGraph | null } = { graph: null };

const analysis = await analyzeRepo({
  dir: rootDir,
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (result) => {
    state.graph = result.graph;
  },
});

if (!state.graph) {
  console.error(`[n1] ${slug}: onGraph nunca se llamó — sin grafo, no hay nada que medir.`);
  process.exit(1);
}
const graph = state.graph;

const languageByFile = new Map(analysis.files.map((f) => [f.path, f.language]));
const ctx = testContext(detector, "*");

const despues = detector.run(
  {
    repoName: slug,
    files: analysis.files.map((f) => ({ path: f.path, lines: f.lines, language: f.language })),
    functions: [],
    clones: [],
    graph,
  },
  ctx,
);
const antes = candidatosAntes(graph, ctx.threshold("libraryRatio").value);

// `CodeAnalysis.findings` viene AGRUPADO (`memberCount` = cuántos hallazgos
// crudos entraron en el grupo). El censo golden — y por lo tanto el número de
// "volumen" del ranking de ruido — cuenta `memberCount ?? 1` por archivo
// (`census.ts:99`), así que la cifra comparable es la SUMA, no la cantidad de
// grupos.
const emitidos = analysis.findings.filter((f) => f.kind === "unused-symbol");
const emitidoTotal = emitidos.reduce((n, f) => n + (f.memberCount ?? 1), 0);
const emitidoPorLenguaje = new Map<string, number>();
for (const f of emitidos) {
  const lang = languageByFile.get(f.locations[0]!.file) ?? "?";
  emitidoPorLenguaje.set(lang, (emitidoPorLenguaje.get(lang) ?? 0) + (f.memberCount ?? 1));
}

function tally(entries: Iterable<string>): Record<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e, (m.get(e) ?? 0) + 1);
  const out: Record<string, number> = {};
  for (const k of [...m.keys()].sort()) out[k] = m.get(k)!;
  return out;
}

/** El tope propio del detector, simulado: top-N por severidad, igual que `run.ts#capDetectorFindings`. */
function conTope<T>(xs: readonly T[], cap = 200): readonly T[] {
  return xs.length <= cap ? xs : xs.slice(0, cap);
}

const filas = despues.map((f) => {
  const loc = f.locations[0]!;
  return {
    file: loc.file,
    language: languageByFile.get(loc.file) ?? "?",
    symbol: loc.symbol ?? "",
    symbolPath: loc.anchor?.symbolPath ?? [],
    startLine: loc.startLine,
    endLine: loc.endLine,
    role: loc.role ?? "",
    severity: f.severity,
  };
});

const despuesOrdenado = [...despues].sort((a, b) => b.severity - a.severity);

const out = {
  slug,
  languages: analysis.languages,
  analysedFiles: analysis.analysedFiles,
  totalLines: analysis.totalLines,
  antesCrudo: antes.length,
  antesEmitido: Math.min(antes.length, 200),
  despuesCrudo: despues.length,
  despuesEmitido: Math.min(despues.length, 200),
  emitidoRealDelPipeline: emitidoTotal,
  antesPorLenguaje: tally(antes.map((n) => languageByFile.get(n.file) ?? "?")),
  despuesPorLenguaje: tally(filas.map((r) => r.language)),
  despuesEmitidoPorLenguaje: tally(
    conTope(despuesOrdenado).map((f) => languageByFile.get(f.locations[0]!.file) ?? "?"),
  ),
  emitidoPorLenguajeDelPipeline: Object.fromEntries([...emitidoPorLenguaje.entries()].sort(([a], [b]) => a.localeCompare(b))),
  despuesPorRol: tally(filas.map((r) => r.role)),
  filas,
};

await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
await fs.writeFile(path.resolve(outFile), `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.error(
  `[n1] ${slug}: antes crudo=${antes.length} emitido=${Math.min(antes.length, 200)} | ` +
    `después crudo=${despues.length} emitido=${Math.min(despues.length, 200)} ` +
    `(${Math.round(performance.now() - t0)} ms de pared) -> ${outFile}`,
);
