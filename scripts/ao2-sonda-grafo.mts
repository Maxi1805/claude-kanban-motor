/**
 * OLA AO / AO2 — SONDA DEL GRAFO. Verifica LA CONDICIÓN 4 de la receta para dos hipótesis:
 *  (a) Builder · optional-construction-combinations: ¿existe `callArities` sobre aristas
 *      `instantiates`? (el hecho que haría visible la construcción con `new`).
 *  (b) Factory Method · conditional-chain: ¿existen aristas extends/implements/satisfies
 *      entre los tipos construidos por una misma función?
 * Corre el pipeline REAL (`analyzeRepo` + `onGraph`), como `dump-graph-census.mts`.
 *
 * Uso: npx tsx scripts/ao2-sonda-grafo.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: ao2-sonda-grafo.mts <dir> <out.json>"); process.exit(1); }

let g: CodeGraph | null = null;
await analyzeRepo({ dir, repoName: "ao2s", limits: { maxFindings: "unlimited" }, onGraph: (r) => { g = r.graph; } });
if (!g) { console.error("sin grafo"); process.exit(2); }
const graph = g as CodeGraph;

const porKind: Record<string, { n: number; conArities: number }> = {};
for (const e of graph.edges) {
  const k = porKind[e.kind] ??= { n: 0, conArities: 0 };
  k.n++;
  if (e.callArities && e.callArities.length > 0) k.conArities++;
}

// (a) PUERTAS por `instantiates`: tipo construido -> símbolos distintos que lo construyen.
const nodeById = new Map(graph.nodes.filter((n) => n.kind === "symbol").map((n) => [n.id, n] as const));
const sitiosPorTipo = new Map<string, Set<string>>();
for (const e of graph.edges) {
  if (e.kind !== "instantiates") continue;
  let s = sitiosPorTipo.get(e.to);
  if (!s) { s = new Set(); sitiosPorTipo.set(e.to, s); }
  s.add(e.from);
}
const puertas3 = [...sitiosPorTipo.entries()].filter(([, s]) => s.size >= 3);

// (b) FAMILIA: ¿cuántos nodos class-like tienen arista extends/implements/satisfies saliente?
const herencia: Record<string, number> = {};
const conAncestro = new Set<string>();
for (const e of graph.edges) {
  if (e.kind !== "extends" && e.kind !== "implements" && e.kind !== "satisfies" && e.kind !== "mixes-in") continue;
  herencia[e.kind] = (herencia[e.kind] ?? 0) + 1;
  conAncestro.add(e.from);
}
const classLike = graph.nodes.filter((n) => n.kind === "symbol" && n.family === "class-like");

// (b2) por FUNCIÓN: tipos que instancia, y si >=2 de ellos comparten ancestro.
const ancestrosDe = new Map<string, Set<string>>();
for (const e of graph.edges) {
  if (e.kind !== "extends" && e.kind !== "implements" && e.kind !== "satisfies" && e.kind !== "mixes-in") continue;
  let s = ancestrosDe.get(e.from);
  if (!s) { s = new Set(); ancestrosDe.set(e.from, s); }
  s.add(e.to);
}
const tiposPorFn = new Map<string, Set<string>>();
for (const e of graph.edges) {
  if (e.kind !== "instantiates") continue;
  let s = tiposPorFn.get(e.from);
  if (!s) { s = new Set(); tiposPorFn.set(e.from, s); }
  s.add(e.to);
}
let fnCon2Tipos = 0, fnCon2Hermanos = 0;
const ejemplos: unknown[] = [];
for (const [fn, tipos] of tiposPorFn) {
  if (tipos.size < 2) continue;
  fnCon2Tipos++;
  const cuenta = new Map<string, number>();
  for (const t of tipos) for (const a of ancestrosDe.get(t) ?? []) cuenta.set(a, (cuenta.get(a) ?? 0) + 1);
  const comun = [...cuenta.entries()].filter(([, n]) => n >= 2).map(([a]) => a);
  if (comun.length > 0) {
    fnCon2Hermanos++;
    if (ejemplos.length < 25) ejemplos.push({ fn: nodeById.get(fn)?.symbolPath?.join("."), file: nodeById.get(fn)?.file, tipos: [...tipos].map((t) => nodeById.get(t)?.symbolPath?.at(-1) ?? t), ancestro: comun.map((a) => nodeById.get(a)?.symbolPath?.at(-1) ?? a) });
  }
}

const res = {
  dir, nodos: graph.nodes.length, aristas: graph.edges.length, porKind,
  instantiates: porKind["instantiates"] ?? { n: 0, conArities: 0 },
  puertasInstantiatesCon3Sitios: puertas3.length,
  classLike: classLike.length, classLikeConAncestro: [...conAncestro].filter((id) => nodeById.get(id)?.family === "class-like").length,
  herencia,
  fnCon2TiposInstanciados: fnCon2Tipos, fnCon2TiposHermanos: fnCon2Hermanos, ejemplos,
};
writeFileSync(out, JSON.stringify(res, null, 1));
console.log(`${dir}: instantiates=${res.instantiates.n} conArities=${res.instantiates.conArities} · puertas>=3sitios=${puertas3.length} · fn>=2tipos=${fnCon2Tipos} de los cuales hermanos=${fnCon2Hermanos} · herencia=${JSON.stringify(herencia)}`);
