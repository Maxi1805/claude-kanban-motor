/**
 * P5 (ola P) — medición de `feature-envy-intra` CON GRAFO, liviana.
 *
 * Misma idea y mismo banco que `n8-medir-feature-envy-intra.mts` (recorrer los
 * MISMOS archivos que `analyzeRepo` con `collectFiles` y armar la MISMA
 * `FileUnit` con `resolveLiveFileUnit`, corriendo SÓLO este detector), con lo
 * que la ola P le agregó: el detector pasó a declarar `needsGraph: true`, así
 * que una medición sin grafo ya no es equivalente a producción — el propio
 * script de N8 lo dejó escrito como su límite declarado.
 *
 * Dos pasadas por repo:
 *   1. `extractSymbols` sobre cada archivo -> `GraphFileFacts` -> `buildGraph`.
 *      Sólo hacen falta los NODOS `symbol` (el detector pregunta qué unidad de
 *      este repo declara qué miembros), no las aristas: `references` va vacío,
 *      que es la degradación honesta y hace la pasada barata.
 *   2. el detector, con `ctx.graph` puesto.
 *
 * LÍMITE DECLARADO: como `references` va vacío, este grafo tiene los mismos
 * NODOS que el de producción y MENOS aristas. El detector sólo lee
 * `graph.nodes`, así que para ESTE detector las dos formas son equivalentes;
 * para cualquier otro no lo serían.
 *
 * Uso: npx tsx scripts/p5-medir-con-grafo.mts <salida.json> <dir> [<dir>…]
 */
import { writeFileSync } from "node:fs";

import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { detector } from "../src/server/services/detect/intra-file/feature-envy-intra.js";
import { resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { RunContext } from "../src/server/services/detect/types.js";
import { buildGraph, type GraphFileFacts } from "../src/server/services/graph/build.js";
import { extractSymbols } from "../src/server/services/graph/symbols.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , out, ...dirs] = process.argv;
if (!out || dirs.length === 0) {
  console.error("Uso: npx tsx scripts/p5-medir-con-grafo.mts <salida.json> <dir> [<dir>…]");
  process.exit(1);
}

type K = keyof (typeof detector)["thresholds"];
function ctxFor(language: string, graph: CodeGraph | null): RunContext<K> {
  return {
    language,
    capabilities: new Set(),
    threshold: (name: K) => resolveThreshold(detector.thresholds[name], { language, sampleSize: () => 0, corpusP95: () => null }),
    graph,
    graphIndex: () => null,
  };
}

interface Row {
  repo: string;
  file: string;
  language: string;
  line: number;
  endLine: number;
  symbol: string;
  title: string;
  trigger: Record<string, number>;
  evidence: Record<string, number>;
}

const t0 = performance.now();
const rows: Row[] = [];
for (const dir of dirs) {
  const repo = dir.replace(/\/+$/, "").split("/").pop() ?? dir;
  const scanned = await collectFiles(dir);

  const facts: GraphFileFacts[] = [];
  for (const f of scanned) {
    const live = await resolveLiveFileUnit(dir, f.path);
    if (!live) continue;
    try {
      facts.push({ path: f.path, language: live.unit.language, symbols: extractSymbols(live.unit.root, live.unit.sets), references: [] });
    } finally {
      live.release();
    }
  }
  const graph = buildGraph(facts);

  const antes = rows.length;
  for (const f of scanned) {
    const live = await resolveLiveFileUnit(dir, f.path);
    if (!live) continue;
    try {
      for (const finding of detector.run(live.unit, ctxFor(live.unit.language, graph))) {
        const loc = finding.locations[0];
        const trigger: Record<string, number> = {};
        for (const t of finding.trigger) trigger[t.label] = t.value;
        const evidence: Record<string, number> = {};
        for (const e of finding.evidence ?? []) evidence[e.label] = e.value;
        rows.push({
          repo,
          file: loc.file,
          language: live.unit.language,
          line: loc.startLine,
          endLine: loc.endLine,
          symbol: loc.symbol ?? "",
          title: finding.title,
          trigger,
          evidence,
        });
      }
    } finally {
      live.release();
    }
  }
  console.error(`${repo}: ${rows.length - antes} hallazgos (${graph.nodes.length} nodos de grafo)`);
}

const porLenguaje: Record<string, number> = {};
for (const r of rows) porLenguaje[r.language] = (porLenguaje[r.language] ?? 0) + 1;
writeFileSync(out, JSON.stringify({ dirs, total: rows.length, porLenguaje, hallazgos: rows }, null, 2));
console.error(
  `TOTAL ${rows.length} hallazgos (${Math.round(performance.now() - t0)} ms) — ` +
    Object.entries(porLenguaje)
      .map(([l, n]) => `${l}:${n}`)
      .join(" "),
);
