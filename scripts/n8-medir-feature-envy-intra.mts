/**
 * N8 (ola O) — medición LIVIANA de `feature-envy-intra` sobre un repo real.
 *
 * POR QUÉ EXISTE. `dump-hallazgos.mts` corre `analyzeRepo` ENTERO (los 42
 * detectores, el grafo, `crossAnalyze`, las hipótesis) para poder contar UN
 * kind. Con trece frentes editando el árbol a la vez, cada edición invalida el
 * caché por huella del analizador, así que medir un solo detector costaba una
 * corrida completa por repo y por iteración — y el semáforo da 3 cupos.
 *
 * Este script recorre los MISMOS archivos que `analyzeRepo` (`collectFiles`) y
 * arma la MISMA `FileUnit` que produce el camino de producción
 * (`resolveLiveFileUnit`, que es la primera mitad literal de `analyzeFile`),
 * pero corre ÚNICAMENTE el detector de este frente. No hay reimplementación
 * del escaneo ni de la construcción de unidades: el número que sale es el que
 * el detector emite en producción, salvo por el tope de hallazgos
 * (`maxFindings`) y por el agrupamiento posterior, que no aplican a un kind
 * intra-file con este volumen.
 *
 * LÍMITE DECLARADO: este detector NO declara `needsGraph`, así que la segunda
 * pasada de la unificación no cambia lo que emite. Si algún día lo declarara,
 * este script dejaría de ser equivalente y habría que volver a
 * `dump-hallazgos.mts`.
 *
 * Uso: npx tsx scripts/n8-medir-feature-envy-intra.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { detector } from "../src/server/services/detect/intra-file/feature-envy-intra.js";
import { resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { RunContext } from "../src/server/services/detect/types.js";

const [, , out, ...dirs] = process.argv;
if (!out || dirs.length === 0) {
  console.error("Uso: npx tsx scripts/n8-medir-feature-envy-intra.mts <salida.json> <dir> [<dir>…]");
  process.exit(1);
}

type K = keyof (typeof detector)["thresholds"];

function ctxFor(language: string): RunContext<K> {
  return {
    language,
    capabilities: new Set(),
    threshold: (name: K) => resolveThreshold(detector.thresholds[name], { language, sampleSize: () => 0, corpusP95: () => null }),
  };
}

const t0 = performance.now();
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
const rows: Row[] = [];
const archivos: Record<string, number> = {};

for (const dir of dirs) {
  const repo = dir.replace(/\/+$/, "").split("/").pop() ?? dir;
  const scanned = await collectFiles(dir);
  let analysed = 0;
  const antes = rows.length;
  for (const f of scanned) {
    const live = await resolveLiveFileUnit(dir, f.path);
    if (!live) continue;
    analysed++;
    try {
      for (const finding of detector.run(live.unit, ctxFor(live.unit.language))) {
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
  archivos[repo] = analysed;
  console.error(`${repo}: ${rows.length - antes} hallazgos en ${analysed} archivos`);
}

const porLenguaje: Record<string, number> = {};
for (const r of rows) porLenguaje[r.language] = (porLenguaje[r.language] ?? 0) + 1;

writeFileSync(out, JSON.stringify({ dirs, archivos, total: rows.length, porLenguaje, hallazgos: rows }, null, 2));
console.error(
  `TOTAL ${rows.length} hallazgos (${Math.round(performance.now() - t0)} ms) — ` +
    Object.entries(porLenguaje)
      .map(([l, n]) => `${l}:${n}`)
      .join(" "),
);
