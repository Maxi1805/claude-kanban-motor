/**
 * CLI de la cobertura de aristas por lenguaje — CONTRATO-F9.md §5.3, F6.
 *
 * UN repo por invocación, sin excepción — mismo motivo que
 * `scripts/language-coverage.mts`/`scripts/census.mts` (dos `analyzeRepo` en
 * el mismo proceso corrompen el caché de `require` de `web-tree-sitter`, ver
 * `code-analyzer.ts#loadRuntime`). Este script SÓLO arma la muestra CRUDA de
 * UN repo (archivos/líneas por lenguaje + aristas por `(kind, lenguaje del
 * nodo "from")`); la AGREGACIÓN de N repos en `EdgeCoverageSample` (una fila
 * por `(kind, lenguaje)`, ya sumada sobre todo el corpus — `graph/edge-coverage.ts`
 * la recibe así, pre-agregada, a diferencia de `computeLanguageCoverage`, que
 * agrega puertas adentro) vive en `graph/edge-coverage.test.ts`, que es quien
 * junta varias muestras y quien conoce la matriz de capacidades.
 *
 * `onGraph` (no `analysis.graph`, que sólo trae el RESUMEN — `CodeGraphSummary`
 * de `shared/types.ts` — sin aristas individuales) da el `CodeGraph` real:
 * `nodes`/`edges` completos. El lenguaje de una arista se toma del ARCHIVO
 * del nodo `from` (vía `CodeGraphNode.file`, cruzado contra
 * `analysis.files[].language`) — coherente con cómo el resto del panel
 * atribuye una arista a un lenguaje (ver `graph-edges.ts` del frontend).
 *
 * *** ARREGLO DEL FRENTE N12 (Ola O) — `affects` necesita el grafo CON nodos
 * de hallazgo. *** `onGraph` (arriba) entrega el grafo tal cual sale de
 * `buildGraphIncremental`, ANTES de `attachFindingNodes`: `code-analyzer.ts
 * #crossAnalyze` dispara `onGraph` deliberadamente antes de ese paso (ver el
 * docstring de `graph/finding-nodes.ts` — no persistir nodos de hallazgo en
 * `code_graphs`). Sin el paso de abajo, este script mide `affects` en CERO
 * para siempre, sin importar qué tan correcto sea `attachFindingNodes`: no es
 * un hueco de extracción, es que la muestra nunca pasaba por esa función.
 * Este script ahora llama `attachFindingNodes` él mismo, con `preCapFindings`
 * (la lista COMPLETA antes del corte de `MAX_STORED_FINDINGS`, la única
 * aproximación a `rawFindings` que `AnalyzeOptions` expone — `rawFindings` en
 * sí es una variable local de `crossAnalyze`, nunca expuesta por ningún hook).
 * COTA CONOCIDA, no escondida: `preCapFindings` YA pasó por el agrupamiento
 * de F5 (Nivel 1 + Nivel 2), así que el conteo de `affects` de acá es una
 * COTA INFERIOR real de lo que produce `crossAnalyze` en producción (agrupar
 * sólo puede reducir hallazgos, nunca aumentarlos) — no una medición exacta
 * de `rawFindings`. Ver `toFindingForAttach` para el resto del adaptador.
 *
 * Uso:
 *   npx tsx scripts/edge-coverage.mts <dir> <slug> [salida.json]
 *
 * Siempre `limits: "unlimited"` — mide el grafo completo, no un corte de
 * salida (igual que `census.mts`/`language-coverage.mts`). Sin
 * `salida.json`: imprime la muestra serializada a STDOUT. Con
 * `salida.json`: la escribe ahí y un resumen de una línea a STDERR — mismo
 * contrato stdout/stderr que los otros scripts de esta familia.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import type { Finding } from "../src/server/services/detect/types.js";
import { attachFindingNodes } from "../src/server/services/graph/finding-nodes.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
import type { CodeFinding } from "../src/shared/types.js";

/**
 * `CodeFinding` (la forma pública, post-agrupamiento) -> el subconjunto de
 * campos que `attachFindingNodes` lee (`id`/`kind`/`severity`/`detectorId`/
 * `locations[].file|startLine|endLine|symbol`). `detectorId` no tiene
 * equivalente en `CodeFinding` (se pierde en `toCodeFinding`) — se usa
 * `kind` como stand-in: no afecta el CONTEO de aristas `affects` (sólo
 * escribiría un `detectorId` cosmético en el nodo `finding`, que este script
 * no persiste ni audita). El resto de `Finding` (`title`/`detail`/`trigger`/
 * `advice`/`scope`/`language`) no existe en `CodeFinding` y `attachFindingNodes`
 * nunca lo lee — el cast es deliberado, documentado, no un atajo de tipado.
 */
function toFindingForAttach(cf: CodeFinding): Finding {
  return {
    id: cf.id ?? `${cf.kind}:${Math.random().toString(36).slice(2)}`,
    detectorId: cf.kind,
    kind: cf.kind,
    severity: cf.severity,
    locations: cf.locations.map((l) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol, role: "x" })),
  } as unknown as Finding;
}

export interface RepoEdgeCoverageSample {
  slug: string;
  languageFacts: Record<string, { filesAnalysed: number; lines: number }>;
  /** clave = `${kind} ${language}`, valor = cuántas aristas de ese `kind` tienen su nodo `from` en un archivo de ese `language`. */
  edgesByKindLanguage: Record<string, number>;
}

function buildSample(slug: string, files: readonly { path: string; language: string; lines: number }[], graph: CodeGraph | null): RepoEdgeCoverageSample {
  const languageFacts: Record<string, { filesAnalysed: number; lines: number }> = {};
  const fileLanguage = new Map<string, string>();
  for (const f of files) {
    fileLanguage.set(f.path, f.language);
    const cur = languageFacts[f.language] ?? { filesAnalysed: 0, lines: 0 };
    cur.filesAnalysed += 1;
    cur.lines += f.lines;
    languageFacts[f.language] = cur;
  }

  const edgesByKindLanguage: Record<string, number> = {};
  if (graph) {
    const nodeFileById = new Map<string, string>();
    for (const n of graph.nodes) nodeFileById.set(n.id, n.file);
    for (const e of graph.edges) {
      const file = nodeFileById.get(e.from);
      const lang = file ? fileLanguage.get(file) : undefined;
      if (!lang) continue; // nodo de un archivo fuera de los lenguajes soportados (p.ej. carpeta), o sin match — no atribuible.
      const key = `${e.kind} ${lang}`;
      edgesByKindLanguage[key] = (edgesByKindLanguage[key] ?? 0) + 1;
    }
  }

  return { slug, languageFacts, edgesByKindLanguage };
}

async function main(): Promise<void> {
  const [dir, slug, outFile] = process.argv.slice(2);
  if (!dir || !slug) {
    console.error("uso: edge-coverage.mts <dir> <slug> [salida.json]");
    process.exitCode = 1;
    return;
  }

  // Caché por SHA + huella del analizador (`analyze-cache.ts`) — un HIT evita
  // repagar `analyzeRepo` sobre el mismo repo que `census.mts` ya analizó en esta
  // misma corrida de la suite (los dos piden `limits: "unlimited"`, así que
  // comparten entrada). Verificabilidad: el hit/miss se loguea a STDERR, nunca a
  // STDOUT (que sigue siendo sólo la muestra serializada).
  const { analysis, graph, preCapFindings, cache } = await analyzeRepoCached({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  console.error(
    `[analyzer-cache] ${slug}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)} key=${cache.key || "-"}`,
  );

  // `attachFindingNodes` — ver el docstring del módulo para por qué hace
  // falta este paso extra (y su cota conocida) antes de medir `affects`.
  const graphWithFindings = graph ? attachFindingNodes(graph, (preCapFindings ?? []).map(toFindingForAttach)) : null;

  const sample = buildSample(slug, analysis.files, graphWithFindings);
  const text = `${JSON.stringify(sample, null, 2)}\n`;

  if (outFile) {
    const outPath = path.resolve(outFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, text, "utf8");
    console.error(
      `${slug}: ${analysis.analysedFiles}/${analysis.scannedFiles} archivos, ` +
        `${graphWithFindings ? (graphWithFindings as CodeGraph).edges.length : 0} aristas (con nodos de hallazgo) -> ${outPath}`,
    );
  } else {
    process.stdout.write(text);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
