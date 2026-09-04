/**
 * SONDA DEL FRENTE P8 (Ola P) — vuelca el `CodeGraph` + `files` de un repo a
 * JSON para poder iterar la definición de `god-component`/`divergent-change`/
 * `inappropriate-intimacy` sin re-pagar `analyzeRepo` por cada variante.
 *
 * Los tres detectores son PUROS sobre `(repo.files, repo.graph, thresholds)`,
 * así que el volcado del grafo alcanza para reproducir su salida exacta —
 * antes y después del cambio — sin volver a analizar el repo. Ese es todo el
 * punto: medir sin quemar el semáforo doce veces.
 *
 * Uso: npx tsx scripts/p8-dump-grafo.mts <dir> <slug> <salida.json>
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/p8-dump-grafo.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const { analysis, graph, cache } = await analyzeRepoCached({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
});
console.error(`[p8-grafo] ${slug}: cache ${cache.hit ? "HIT" : "MISS"} (${cache.reason})`);
if (!graph) {
  console.error(`[p8-grafo] ${slug}: sin grafo.`);
  process.exit(1);
}

const out = {
  slug,
  files: analysis.files.map((f) => ({ path: f.path, lines: f.lines, language: f.language })),
  resolution: graph.resolution,
  nodes: graph.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    file: n.file,
    symbolPath: n.symbolPath,
    family: n.family,
    startLine: n.startLine,
    endLine: n.endLine,
    visibility: n.visibility,
    memberOfClassLike: n.memberOfClassLike,
    exported: n.exported,
  })),
  edges: graph.edges.map((e) => ({
    from: e.from,
    to: e.to,
    kind: e.kind,
    provenance: e.provenance,
    weight: e.weight,
    resolvedBy: e.resolvedBy,
    alternatives: e.alternatives,
  })),
};

await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
await fs.writeFile(path.resolve(outFile), JSON.stringify(out), "utf8");
console.error(
  `[p8-grafo] ${slug}: ${out.files.length} archivos, ${out.nodes.length} nodos, ${out.edges.length} aristas -> ${outFile}`,
);
