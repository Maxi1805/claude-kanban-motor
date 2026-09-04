/**
 * Costo REAL de `buildNeighborhoodIndex` a escala de guava — CONTRATO-F9.md
 * §1.2/§1.4. F0 corre con 0 corridas de corpus (regla del reparto), así que
 * esto usa un grafo SINTÉTICO con los conteos medidos al cierre de la Ola 8
 * (guava: 58.496 nodos `contains`, 118.718 aristas), no `analyzeRepo` —
 * mismo espíritu que la compuerta `neighborhood-cost.test.ts` que el
 * contrato reserva para F1 (grafo sintético de 200.000 aristas con un hub de
 * grado 5.000): ESTE archivo mide construcción+memoria, ese archivo (F1) mide
 * cotas de consulta. Nombres distintos a propósito, para no chocar con lo
 * que F1 va a crear.
 *
 * `it.skip` no aplica acá — no depende de `CK_CORPUS_DIR`, corre siempre.
 * El límite de tiempo es GENEROSO (asserts, no benchmarks de precisión): el
 * objetivo es demostrar "no es O(minutos) ni O(GB)", no fijar un SLA.
 */
import { describe, expect, it } from "vitest";

import type { Finding } from "../detect/types.js";
import { fileNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "./types.js";
import { buildNeighborhoodIndex, neighborhoodFor } from "./neighborhood.js";

/** Grafo sintético con la forma aproximada de guava (Ola 8): ~58.500 nodos, ~118.700 aristas, con un hub (~5% de las aristas entrantes concentradas en un puñado de nodos — el patrón real de `Preconditions`/`Objects`). */
function syntheticGuavaShapedGraph(): CodeGraph {
  const nodeCount = 58_496;
  const edgeCount = 118_718;
  const hubCount = 8;

  const nodes: CodeGraphNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ id: fileNodeId(`f${i}.java`), kind: "file", file: `f${i}.java`, symbolPath: [] });
  }

  const edges: CodeGraphEdge[] = [];
  const hubShare = Math.floor(edgeCount * 0.3); // ~30% de las aristas apuntan a los hubs — orden de magnitud de un `Preconditions.checkArgument` real.
  for (let i = 0; i < hubShare; i++) {
    const from = nodes[(i * 7919) % nodeCount]!.id;
    const to = nodes[i % hubCount]!.id; // los primeros `hubCount` nodos son los hubs.
    edges.push({ from, to, kind: "references", provenance: "resolved", weight: 1 + (i % 5) });
  }
  for (let i = hubShare; i < edgeCount; i++) {
    const from = nodes[(i * 104_729) % nodeCount]!.id;
    const to = nodes[(i * 65_537 + 17) % nodeCount]!.id;
    if (from === to) continue;
    edges.push({ from, to, kind: "references", provenance: "resolved", weight: 1 });
  }

  return { nodes, edges, resolution: { candidates: edgeCount, resolved: edgeCount, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

function syntheticFindings(n: number, graph: CodeGraph): Finding[] {
  const kinds = ["long-function", "large-class", "feature-envy-intra", "duplication"];
  const out: Finding[] = [];
  for (let i = 0; i < n; i++) {
    const file = graph.nodes[i % graph.nodes.length]!.file;
    out.push({
      id: `f${i}:${i.toString(16).padStart(16, "0")}`,
      detectorId: "long-function",
      kind: kinds[i % kinds.length]!,
      scope: "intra-function",
      language: "java",
      title: "t",
      detail: "d",
      trigger: [{ label: "x", value: 1, threshold: { value: 1, kind: "citado", label: "x", detail: { kind: "citado", work: "x" } } as never }],
      locations: [{ file, startLine: 1, endLine: 2, role: "sujeto" }],
      severity: 40 + (i % 60),
      advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    });
  }
  return out;
}

describe("costo de buildNeighborhoodIndex sobre un grafo con la forma de guava (sintético — 0 corridas de corpus)", () => {
  it("construye en tiempo acotado y con memoria del orden de MB, no GB", () => {
    const graph = syntheticGuavaShapedGraph();
    const findings = syntheticFindings(7_630, graph); // conteo real de hallazgos de guava, Ola 8.

    const beforeHeap = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const index = buildNeighborhoodIndex(graph, findings, null);
    const buildMs = performance.now() - t0;
    const afterHeap = process.memoryUsage().heapUsed;

    // Sólo el CSR (out+inn), la parte que el contrato pide medir explícitamente: offsets (V+1)×4B×2 + edgeIdx E×4B×2.
    const csrBytes = (index.out.offsets.byteLength + index.out.edgeIdx.byteLength + index.inn.offsets.byteLength + index.inn.edgeIdx.byteLength);

    // eslint-disable-next-line no-console
    console.log(
      `[neighborhood.bench] nodes=${graph.nodes.length} edges=${graph.edges.length} findings=${findings.length} ` +
        `buildMs=${buildMs.toFixed(1)} csrBytes=${csrBytes} (${(csrBytes / 1024 / 1024).toFixed(2)} MiB) ` +
        `heapDeltaMiB=${((afterHeap - beforeHeap) / 1024 / 1024).toFixed(1)}`,
    );

    expect(buildMs).toBeLessThan(5000); // generoso: demuestra "segundos", no "minutos".
    expect(csrBytes).toBeLessThan(4 * 1024 * 1024); // el CSR solo, sin nodeById/findings — contrato estima ~0,95 MiB para guava real.
    expect(index.nodeIds.length).toBe(graph.nodes.length);

    // `ego` sobre un hub real: no debe tocar más que la cota dura, y debe ser rápido.
    const hubId = graph.nodes[0]!.id;
    const t1 = performance.now();
    const n = neighborhoodFor(index, findings[0]!);
    const ego = n.ego({ file: graph.nodes[0]!.file, symbolPath: [] }, 2);
    const egoMs = performance.now() - t1;
    expect(ego).not.toBeNull();
    expect(ego!.nodes.length).toBeLessThanOrEqual(512);
    expect(egoMs).toBeLessThan(200);
    // eslint-disable-next-line no-console
    console.log(`[neighborhood.bench] ego(hub,2) nodes=${ego!.nodes.length} degreeIn=${ego!.degreeIn} truncated=${ego!.truncated} ms=${egoMs.toFixed(2)}`);
  });
});
