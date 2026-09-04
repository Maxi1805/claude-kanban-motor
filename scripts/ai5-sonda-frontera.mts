/**
 * AI5 — SONDA DEL CAMINO NUEVO, CORRIENDO LA FUNCIÓN DE PRODUCCIÓN.
 *
 * No reimplementa nada: importa `analizarFormaPorFrontera` y
 * `analizarFormaDeLaFuncion` de `hypotheses/extract-method.ts` (producción) y
 * las corre sobre el árbol real de cada archivo, con un `HypothesisContext`
 * cuyo `neighborhood.findingsInFile` devuelve los hallazgos `complexity`
 * REALES de ese archivo — los que el embudo del día
 * (`scripts/ai5-embudo.mts`, analizador real) ya registró. Es la forma de
 * evitar el defecto que AH3 dejó escrito: una sonda que reimplementa los
 * `required` mide otra cosa que producción.
 *
 * Uso: npx tsx scripts/ai5-sonda-frontera.mts <repo> <dirCorpus> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

import { resolveLiveFileUnit } from "../scratchpad-ai5/srcA/server/services/code-analyzer.js";
import { analizarFormaDeLaFuncion, analizarFormaPorFrontera, hypothesis as extractMethod } from "../src/server/services/hypotheses/extract-method.js";
import { EMPTY_NEIGHBORHOOD } from "../src/server/services/graph/neighborhood.js";

const [, , repo, dir, out] = process.argv;
if (!repo || !dir || !out) {
  console.error("Uso: npx tsx scripts/ai5-sonda-frontera.mts <repo> <dirCorpus> <salida.json>");
  process.exit(1);
}

const emb = JSON.parse(readFileSync(`scratchpad-ai5/emb/${repo}.json`, "utf8"));

function parseLoc(loc: string | null): { file: string; startLine: number; endLine: number } | null {
  const m = /^(.*):(\d+)-(\d+)$/.exec(loc ?? "");
  return m ? { file: m[1]!, startLine: Number(m[2]), endLine: Number(m[3]) } : null;
}

/** Los hallazgos `long-function` (crudos, la unidad que ve la hipótesis) y los
 *  `complexity` del mismo archivo, tal como los vio la corrida real. */
const largas = new Map<string, { id: string; file: string; startLine: number; endLine: number; sym: string | null; parrafosOk: boolean }>();
const complejos = new Map<string, { id: string; file: string; startLine: number; endLine: number }[]>();
for (const r of emb.rows as any[]) {
  if (r.builder !== "extract-method" || !r.required) continue;
  const p = parseLoc(r.loc);
  if (!p) continue;
  if (r.kind === "long-function") {
    largas.set(r.findingId, { id: r.findingId, ...p, sym: r.sym ?? null, parrafosOk: r.required[0].ok });
  } else if (r.kind === "complexity") {
    const arr = complejos.get(p.file) ?? [];
    if (!arr.some((x) => x.id === r.findingId && x.startLine === p.startLine && x.endLine === p.endLine)) arr.push({ id: r.findingId, ...p });
    complejos.set(p.file, arr);
  }
}

function findingFake(id: string, kind: string, f: { file: string; startLine: number; endLine: number }): any {
  return {
    id,
    detectorId: kind,
    kind,
    scope: "intra-function",
    language: null,
    title: "t",
    detail: "d",
    trigger: [{ label: "x", value: 1, threshold: null }],
    locations: [{ file: f.file, startLine: f.startLine, endLine: f.endLine, symbol: undefined, role: "r" }],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

const porArchivo = new Map<string, (typeof largas extends Map<string, infer V> ? V : never)[]>();
for (const o of largas.values()) {
  const arr = porArchivo.get(o.file) ?? [];
  arr.push(o);
  porArchivo.set(o.file, arr);
}

const filas: any[] = [];
for (const [file, objs] of porArchivo) {
  const live = await resolveLiveFileUnit(dir, file);
  if (!live) {
    for (const o of objs) filas.push({ ...o, error: "sin-archivo-vivo" });
    continue;
  }
  const unit: any = live.unit;
  const vecinos = (complejos.get(file) ?? []).map((c) => findingFake(c.id, "complexity", c));
  const ctx: any = {
    file: unit,
    fileAt: (p: string) => (unit.path === p ? unit : null),
    repo: { repoName: repo, files: [], functions: [], clones: [], graph: null },
    capabilities: new Set<string>(),
    setsFor: () => unit.sets,
    neighborhood: { ...EMPTY_NEIGHBORHOOD, findingsInFile: () => vecinos },
    branches: () => null,
  };
  for (const o of objs) {
    const problem = findingFake(o.id, "long-function", o);
    const vieja = analizarFormaDeLaFuncion(problem, ctx);
    const nueva = analizarFormaPorFrontera(problem, ctx);
    const h = extractMethod.build(problem, null, ctx);
    filas.push({
      ...o,
      nombre: nueva?.nombre ?? vieja?.nombre ?? null,
      lineas: o.endLine - o.startLine + 1,
      parrafosViejos: vieja?.parrafosReales.length ?? null,
      grupos: nueva?.gruposReales.length ?? null,
      bloques: nueva?.bloquesDelimitadores ?? null,
      gemeloComplejo: nueva?.gemeloComplejoQueYaPropone ?? null,
      emite: h ? h.state : null,
      porFrontera: h ? h.checks.some((c) => c.label.includes("grupos delimitados por la gramática")) : false,
    });
  }
  live.release();
}

writeFileSync(out, JSON.stringify({ repo, dir, filas }, null, 0));
const nuevas = filas.filter((f) => f.porFrontera).length;
console.log(`${out}: ${filas.length} funciones largas, ${nuevas} recomendaciones NUEVAS por frontera de bloque`);
