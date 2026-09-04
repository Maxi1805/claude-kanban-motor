/**
 * AO5 — SONDA DE SÓLO LECTURA. No toca producción, no escribe en `src/`.
 *
 * Cuenta, sobre el GRAFO REAL de un repo (el que `analyze-cache.ts` ya guarda
 * completo en `AnalyzeRepoCachedResult.graph`), la población de la FUERZA de
 * Singleton tal como quedó definida en `scratchpad-ao5/CRITERIO.md` ANTES de
 * medir, y en paralelo la población que su única ancla
 * (`scattered-instantiation`) mira.
 *
 * Uso: npx tsx scripts/ao5-sonda-singleton.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { CONSTRUCTOR_NAMES } from "../src/server/services/code-grammar.js";
import type { CodeGraph, CodeGraphNode } from "../src/server/services/graph/types.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/ao5-sonda-singleton.mts <dir> <salida.json>");
  process.exit(1);
}

const { graph, cache } = await analyzeRepoCached({ dir, repoName: "ao5", limits: { maxFindings: "unlimited" } });
console.error(`[cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)}`);
if (!graph) {
  writeFileSync(out, JSON.stringify({ dir, error: "sin grafo" }, null, 1));
  process.exit(0);
}
const g: CodeGraph = graph;

const nodeById = new Map<string, CodeGraphNode>();
for (const n of g.nodes) nodeById.set(n.id, n);

/** hijos `contains` por id de nodo padre */
const contains = new Map<string, CodeGraphNode[]>();
for (const e of g.edges) {
  if (e.kind !== "contains") continue;
  const child = nodeById.get(e.to);
  if (!child) continue;
  (contains.get(e.from) ?? contains.set(e.from, []).get(e.from)!).push(child);
}

/** `instantiates` con provenance confiable — MISMO criterio que `scattered-instantiation.ts`. */
const sitiosPorTipo = new Map<string, Set<string>>(); // idTipo -> archivos de origen
const ocurrenciasPorTipo = new Map<string, number>();
for (const e of g.edges) {
  if (e.kind !== "instantiates") continue;
  if (e.provenance !== "declared" && e.provenance !== "resolved") continue;
  const destino = nodeById.get(e.to);
  const origen = nodeById.get(e.from);
  if (!destino || !origen) continue;
  if (destino.family !== "class-like") continue;
  const s = sitiosPorTipo.get(e.to) ?? new Set<string>();
  s.add(origen.file);
  sitiosPorTipo.set(e.to, s);
  ocurrenciasPorTipo.set(e.to, (ocurrenciasPorTipo.get(e.to) ?? 0) + e.weight);
}

const ctorNames = new Set<string>([...CONSTRUCTOR_NAMES]);

function nombreCorto(n: CodeGraphNode): string {
  return n.symbolPath.length ? n.symbolPath[n.symbolPath.length - 1] : n.file;
}

/**
 * (b) del CRITERIO: el constructor de T tiene `arity === 0`, o T no declara
 * constructor. Mecanismo A de `singleton.ts`: el miembro se llama como la CLASE
 * (Java/C#) o es uno de los protocolos nativos (`CONSTRUCTOR_NAMES`).
 */
function ctorArity(tipo: CodeGraphNode): { tiene: boolean; arity: number | null | undefined } {
  const hijos = contains.get(tipo.id) ?? [];
  const nombreClase = nombreCorto(tipo);
  for (const h of hijos) {
    if (h.family !== "function-like") continue;
    const nm = nombreCorto(h);
    if (nm === nombreClase || ctorNames.has(nm)) return { tiene: true, arity: h.arity };
  }
  return { tiene: false, arity: undefined };
}

/** (c) del CRITERIO: >= 1 hijo `contains` de `family: "other"` — la ranura de estado. */
function tieneEstado(tipo: CodeGraphNode): number {
  return (contains.get(tipo.id) ?? []).filter((h) => h.family === "other").length;
}

const filas: Record<string, unknown>[] = [];
for (const [idTipo, archivos] of sitiosPorTipo) {
  const tipo = nodeById.get(idTipo)!;
  const ca = ctorArity(tipo);
  const estado = tieneEstado(tipo);
  filas.push({
    tipo: nombreCorto(tipo),
    file: tipo.file,
    line: tipo.startLine ?? 0,
    archivosDeOrigen: archivos.size,
    ocurrencias: ocurrenciasPorTipo.get(idTipo) ?? 0,
    ctorDeclarado: ca.tiene,
    ctorArity: ca.arity === undefined ? null : ca.arity,
    /** (b): construcción indistinguible — ctor de aridad 0, o sin ctor declarado. */
    b_indistinguible: ca.tiene ? ca.arity === 0 : true,
    campos: estado,
    c_conEstado: estado >= 1,
  });
}
filas.sort((x, y) => (y.archivosDeOrigen as number) - (x.archivosDeOrigen as number));

const dist: Record<string, number> = {};
for (const f of filas) {
  const k = String(f.archivosDeOrigen);
  dist[k] = (dist[k] ?? 0) + 1;
}

const conA2 = filas.filter((f) => (f.archivosDeOrigen as number) >= 2);
const conA3 = filas.filter((f) => (f.archivosDeOrigen as number) >= 3);
const fuerza = conA2.filter((f) => f.b_indistinguible && f.c_conEstado);

writeFileSync(
  out,
  JSON.stringify(
    {
      dir,
      nodos: g.nodes.length,
      aristas: g.edges.length,
      instantiatesTotal: g.edges.filter((e) => e.kind === "instantiates").length,
      instantiatesConfiables: g.edges.filter((e) => e.kind === "instantiates" && (e.provenance === "declared" || e.provenance === "resolved")).length,
      tiposDestino: filas.length,
      distribucionArchivosDeOrigen: dist,
      /** (a) sólo — lo único que mira el ancla */
      a2: conA2.length,
      a3_loQueVeElAncla: conA3.length,
      /** (a)+(b)+(c) — LA FUERZA DE SINGLETON */
      fuerza: fuerza.length,
      fuerzaDetalle: fuerza,
      a2Detalle: conA2,
    },
    null,
    1,
  ),
);
console.log(`${out}: tipos=${filas.length} a2=${conA2.length} a3=${conA3.length} FUERZA=${fuerza.length}`);
