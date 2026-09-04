/**
 * Hallazgos como nodos del grafo — CONTRATO-F9.md §2. La firma quedó
 * congelada desde Cimientos (CONTRATO-F9.md §6, fila 5); este archivo es
 * dueño único del CUERPO.
 *
 * Por cada `Finding`: UN nodo `kind: "finding"` (deduplicado por
 * `Finding.id` — un mismo hallazgo no aparece dos veces aunque el llamador
 * concatene listas con solape) y UNA arista `affects` por `location`
 * DISTINTA (CONTRATO-F9.md §2.2: "SIEMPRE `finding → (symbol|file)`. Una por
 * `location` distinta del `Finding`, deduplicada por ancla serializada" —
 * dos locations que derivan la MISMA `Anchor` — mismo `serializeAnchor`,
 * `deriveAnchor`/`ids.ts` — colapsan en una sola arista, sin sumar peso: no
 * hay "ocurrencias" que colapsar acá, cada arista ya es un hecho binario
 * "este hallazgo toca este símbolo").
 *
 * El nodo `finding` usa el id `finding:${Finding.id}` (prefijo nuevo, nunca
 * colisiona con `folder:`/`file:`/`sym:`/`carrier:` — ver `types.ts`) y
 * `file: finding.locations[0].file` — la MISMA noción de "archivo primario"
 * que `hypotheses/run.ts#primaryPath` ya usa para un `Finding`, a propósito:
 * es de ahí que `scripts/edge-coverage.mts` deriva el lenguaje de una arista
 * (del archivo del nodo `from`), así que un hallazgo inter-file con
 * `language: null` igual aterriza en UN lenguaje concreto — el de su primer
 * location — nunca en una celda fantasma.
 *
 * El destino de cada arista `affects`: `anchorNodeId(anchor)` (=
 * `symbolNodeId`, el mismo formato que `serializeAnchor` menos el `@n` — ver
 * `types.ts`) si ESE id existe entre los nodos del `graph` de entrada;
 * si no (el detector ancló a un símbolo que la extracción de símbolos no
 * separó en su propio nodo — closures, símbolos sintéticos, etc.), cae a
 * `fileNodeId(anchor.file)`, que SIEMPRE existe: todo archivo que
 * `buildGraph`/`buildGraphIncremental` procesó recibe un nodo `file`
 * incondicional (`build.ts#buildNodesAndContainsForFile`), y todo `Finding`
 * nace de un archivo que el analizador ya recorrió.
 *
 * `provenance: "declared"` — ni resuelto por cascada, ni ambiguo, ni
 * heurístico: el propio `Finding.locations` YA es la posición exacta que el
 * detector afirma, con certeza total (igual criterio que `contains`, la
 * única otra familia de aristas que nace "declared" sin pasar por
 * `resolve.ts`).
 *
 * Devuelve un `CodeGraph` NUEVO (nunca muta `graph`: `nodes`/`edges` son
 * `readonly`) — `nodes`/`edges` originales primero, los nuevos al final (el
 * grafo de entrada nunca pierde ni reordena nada de lo que ya tenía).
 * Medido en guava (7.630 hallazgos) y newtonsoft-json (el peor caso
 * relativo del corpus): +34% de aristas — ver el informe de esta tarea para
 * el desglose exacto por lenguaje.
 */
import { deriveAnchor, serializeAnchor } from "../detect/ids.js";
import type { Finding } from "../detect/types.js";
import { anchorNodeId, fileNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "./types.js";

/** Id de nodo de un hallazgo — prefijo `finding:` + `Finding.id` (ya único y estable, `ids.ts#findingId`). Sólo usado acá: ningún otro módulo necesita construir uno todavía. */
export function findingNodeId(findingId: string): string {
  return `finding:${findingId}`;
}

/**
 * CONTRATO-F9.md §2.4. Ver el docstring del archivo para el algoritmo
 * completo. `findings` vacío devuelve `graph` SIN copiar (mismo atajo que el
 * paso-a-través original: nada que agregar, nada que asignar).
 */
export function attachFindingNodes(graph: CodeGraph, findings: readonly Finding[]): CodeGraph {
  if (findings.length === 0) return graph;

  const knownNodeIds = new Set(graph.nodes.map((n) => n.id));
  const newNodes: CodeGraphNode[] = [];
  const newEdges: CodeGraphEdge[] = [];
  const seenFindingNodeIds = new Set<string>();

  for (const finding of findings) {
    const nodeId = findingNodeId(finding.id);
    if (!seenFindingNodeIds.has(nodeId)) {
      seenFindingNodeIds.add(nodeId);
      newNodes.push({
        id: nodeId,
        kind: "finding",
        file: finding.locations[0].file,
        symbolPath: [],
        startLine: finding.locations[0].startLine,
        endLine: finding.locations[0].endLine,
        findingKind: finding.kind,
        severity: finding.severity,
        detectorId: finding.detectorId,
      });
    }

    const seenAnchors = new Set<string>();
    for (const loc of finding.locations) {
      const anchor = deriveAnchor(loc);
      const anchorKey = serializeAnchor(anchor);
      if (seenAnchors.has(anchorKey)) continue; // "deduplicada por ancla serializada" — CONTRATO-F9.md §2.2.
      seenAnchors.add(anchorKey);

      const symbolId = anchorNodeId(anchor);
      const to = knownNodeIds.has(symbolId) ? symbolId : fileNodeId(anchor.file);
      newEdges.push({ from: nodeId, to, kind: "affects", provenance: "declared", weight: 1 });
    }
  }

  return {
    nodes: [...graph.nodes, ...newNodes],
    edges: [...graph.edges, ...newEdges],
    resolution: graph.resolution,
  };
}
