/**
 * Censo REPRODUCIBLE de aristas del grafo — P1, CONTRATO-F8G.md §7.
 *
 * No existe hoy forma commiteada de contar aristas por repo: `census.mts`
 * censa hallazgos/oportunidades, no el grafo, y `measure-cascade.mts` mide el
 * embudo de resolución con un ATAJO (parsea y llama `resolveReferences`
 * directamente) que a propósito NO es el pipeline de producción. Ese vacío
 * es lo que obligó a los dos revisores de la ola anterior a escribir scripts
 * descartables para contar aristas — y les dio números distintos entre sí y
 * contra F3 (ver el reporte de esta tarea, COSTO#1: cobra `calls` 141 vs 695).
 *
 * Este script corre el pipeline de producción REAL — `analyzeRepo` con
 * `onGraph`, exactamente lo que `code-inspector.ts` usa para servir el panel
 * — nunca un atajo de bajo nivel. `graph/build.ts#buildGraph` es quien
 * decide cuántas aristas hay; este script sólo TALLA lo que ese `CodeGraph`
 * ya trae.
 *
 * UN REPO POR PROCESO, sin excepción — mismo motivo que `census.mts`/
 * `measure-cascade.mts` documentan: un segundo `analyzeRepo` en el mismo
 * proceso node corre el riesgo de corromper el caché de `require` de
 * `web-tree-sitter` (ver `loadRuntime` en `code-analyzer.ts`). Regla de
 * memoria de esta ola: nunca junto a otro proceso pesado, y `guava` sola.
 *
 * Determinista: dos corridas seguidas sobre el mismo árbol de archivos
 * producen el mismo JSON, byte a byte — por eso ninguna medición de tiempo
 * de pared entra al JSON (va sólo a STDERR, informativo, mismo lugar que
 * `measure-cascade.mts`'s "tiempo de pared"): un timestamp en el artefacto
 * comparable rompería esa garantía sin aportar nada que `code-graph-
 * repository.test.ts`'s presupuesto de tamaño necesite.
 *
 * Uso:
 *   npx tsx scripts/dump-graph-census.mts <dir> <slug> [salida.json]
 *
 * Sin `salida.json`: imprime el censo serializado a STDOUT (para que un
 * llamador lo capture y lo parsee) y nada más. Con `salida.json`: lo escribe
 * ahí (creando directorios intermedios) y en cambio imprime un resumen de
 * una línea + el tiempo de pared a STDERR — mismo contrato de separación
 * stdout/stderr que `census.mts`/`measure-cascade.mts`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { edgeHasRole, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../src/server/services/graph/types.js";

/** `"${clave} -> conteo"`, ordenado lexicográficamente — mismo motivo que `census.ts#serializeCensus`: el archivo se revisa en un `git diff`, el orden es parte del contrato. */
function tallySorted<T extends string>(values: Iterable<T>, fallback: string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v ?? fallback;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const key of [...counts.keys()].sort()) out[key] = counts.get(key)!;
  return out;
}

/**
 * Distribución de la máscara `roles` — bare / receiver-member / qualified /
 * sin rol. Los tres bits NO son mutuamente excluyentes: una arista colapsada
 * (`resolve.ts#mergeRoles`, misma ocurrencia física resuelta desde dos sitios
 * con rol distinto) puede traer más de un bit — por eso `bare + receiverMember
 * + qualified` puede superar `conRoles`. `sinRol` sí es exacto: `edge.roles`
 * ausente, nunca `0` a fuerza (`types.ts` lo documenta así).
 */
function rolesCensus(edges: readonly CodeGraphEdge[]): {
  bare: number;
  receiverMember: number;
  qualified: number;
  sinRol: number;
  conRoles: number;
} {
  let bare = 0;
  let receiverMember = 0;
  let qualified = 0;
  let sinRol = 0;
  for (const e of edges) {
    if (e.roles === undefined) {
      sinRol++;
      continue;
    }
    if (edgeHasRole(e, "bare")) bare++;
    if (edgeHasRole(e, "receiver-member")) receiverMember++;
    if (edgeHasRole(e, "qualified")) qualified++;
  }
  return { bare, receiverMember, qualified, sinRol, conRoles: edges.length - sinRol };
}

export interface GraphCensusMeta {
  slug: string;
  scannedFiles: number;
  analysedFiles: number;
  totalLines: number;
  languages: readonly string[];
  nodeCount: number;
  edgeCount: number;
}

export interface GraphCensus {
  meta: GraphCensusMeta;
  /** Conteo de nodos por `GraphNodeKind` (`folder`/`file`/`symbol`). */
  nodesByKind: Record<string, number>;
  /** Conteo de aristas por `EdgeKind`. */
  edgesByKind: Record<string, number>;
  /** Conteo de aristas por `Provenance` (`declared`/`resolved`/`inferred`). */
  edgesByProvenance: Record<string, number>;
  /**
   * Conteo de aristas por `resolvedBy` (qué etapa de la cascada la aceptó).
   * `"sin-etapa"` = `resolvedBy` ausente — SIEMPRE el caso de `contains`
   * (`types.ts`: "Ausente sólo en `contains`") y, hoy, también de `imports`/
   * `satisfies` (se resuelven fuera de la cascada de nombre-de-símbolo — ver
   * `graph/build.ts`, bloque P4).
   */
  edgesByStage: Record<string, number>;
  roles: ReturnType<typeof rolesCensus>;
}

/** Puro: del `CodeGraph` ya construido al censo. No re-corre nada de la cascada — sólo talla lo que `buildGraph` ya decidió. */
export function censusGraph(
  slug: string,
  graph: CodeGraph,
  meta: { scannedFiles: number; analysedFiles: number; totalLines: number; languages: readonly string[] },
): GraphCensus {
  return {
    meta: {
      slug,
      scannedFiles: meta.scannedFiles,
      analysedFiles: meta.analysedFiles,
      totalLines: meta.totalLines,
      languages: [...meta.languages].sort(),
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    },
    nodesByKind: tallySorted(
      graph.nodes.map((n: CodeGraphNode) => n.kind),
      "sin-kind",
    ),
    edgesByKind: tallySorted(
      graph.edges.map((e) => e.kind),
      "sin-kind",
    ),
    edgesByProvenance: tallySorted(
      graph.edges.map((e) => e.provenance),
      "sin-provenance",
    ),
    edgesByStage: tallySorted(
      graph.edges.map((e) => e.resolvedBy ?? "sin-etapa"),
      "sin-etapa",
    ),
    roles: rolesCensus(graph.edges),
  };
}

/** Mismo formato que `census.ts#serializeCensus`: 2 espacios, LF, newline final. */
export function serializeGraphCensus(census: GraphCensus): string {
  return `${JSON.stringify(census, null, 2)}\n`;
}

async function main(): Promise<void> {
  const [, , dir, slug, outFile] = process.argv;
  if (!dir || !slug) {
    console.error("uso: npx tsx scripts/dump-graph-census.mts <dir> <slug> [salida.json]");
    process.exitCode = 1;
    return;
  }

  const rootDir = path.resolve(dir);
  const t0 = performance.now();
  // Envuelto en un objeto (en vez de un `let` suelto) a propósito: TS no seguía la
  // asignación hecha dentro del callback `onGraph` para el `let` — la CFA de un `let`
  // capturado por un closure invocado de forma opaca (`await analyzeRepo(...)`) no ve esa
  // reasignación, así que el chequeo `if (!captured)` de más abajo narrowaba a `never` en
  // vez de al tipo no-nulo (repro mínima confirmada: mismo patrón con `let` da
  // TS2339 sobre `never`; con la propiedad de un objeto, no). Comportamiento en runtime
  // idéntico; sólo cambia lo que tsc puede probar.
  const state: { captured: { graph: CodeGraph; buildMs: number } | null } = { captured: null };

  const analysis = await analyzeRepo({
    dir: rootDir,
    repoName: slug,
    // Mismo motivo que `census.ts#censusRepo`: el censo mide lo que el
    // grafo REALMENTE tiene, no lo que un tope de salida deja pasar.
    limits: { maxFindings: "unlimited" },
    onGraph: (result) => {
      state.captured = { graph: result.graph, buildMs: result.buildMs };
    },
  });
  const elapsedMs = performance.now() - t0;

  if (!state.captured) {
    console.error(
      `[dump-graph-census] ${slug}: \`onGraph\` nunca se llamó — el build de grafo falló para este repo ` +
        "(ver el try/catch de `crossAnalyze` en code-analyzer.ts); no hay CodeGraph que censar.",
    );
    process.exitCode = 1;
    return;
  }

  const { graph, buildMs } = state.captured;
  const census = censusGraph(slug, graph, {
    scannedFiles: analysis.scannedFiles,
    analysedFiles: analysis.analysedFiles,
    totalLines: analysis.totalLines,
    languages: analysis.languages,
  });
  const text = serializeGraphCensus(census);

  if (outFile) {
    const outPath = path.resolve(outFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, text, "utf8");
    console.error(
      `${slug}: ${census.meta.nodeCount} nodos, ${census.meta.edgeCount} aristas, ` +
        `build ${buildMs.toFixed(0)} ms, pared ${elapsedMs.toFixed(0)} ms -> ${outPath}`,
    );
  } else {
    process.stdout.write(text);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
