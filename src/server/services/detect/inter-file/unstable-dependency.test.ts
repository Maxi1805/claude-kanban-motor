import { describe, expect, it } from "vitest";

import { buildUnstableDependencyFindings, detector } from "./unstable-dependency.js";
import { testContext } from "../testing.js";
import type { RepoUnit } from "../types.js";
import { fileNodeId, folderNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: igual que `orphan-file.test.ts`/
 * `dependency-cycle.test.ts`, el grafo se arma a mano (nodos+aristas planas),
 * sin tree-sitter — el detector sólo lee `RepoUnit.graph`/`RepoUnit.files`.
 * "≥3 lenguajes que emiten" no aplica: este detector no clasifica por
 * lenguaje en absoluto (ni siquiera para severidad) — opera sólo sobre la
 * FORMA del grafo de módulos, agnóstico de lenguaje por construcción, mismo
 * criterio que `dependency-cycle.ts`.
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function dirnameOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/** El nodo `folder` INMEDIATO que contiene a `file` — `projectGraph("module", …)`
 *  (ver `projectionKeyFn` en `graph/metrics/projection.ts`) sólo separa archivos
 *  en módulos distintos si existe un nodo `kind: "folder"` que los distinga; sin
 *  él, TODOS los archivos colapsan al mismo id de módulo `"folder:"` y ninguna
 *  arista entre ellos sobrevive (se descarta como auto-arista intra-módulo). */
function folderOf(file: string): CodeGraphNode {
  const folder = dirnameOf(file);
  return { id: folderNodeId(folder), kind: "folder", file: folder, symbolPath: [] };
}

/** Un archivo Y su carpeta contenedora — para no olvidar la segunda mitad
 *  (ver `folderOf`) en cada sitio que antes sólo empujaba `fileNode(path)`. */
function moduleFile(path: string): CodeGraphNode[] {
  return [folderOf(path), fileNode(path)];
}

function edge(
  from: string,
  to: string,
  overrides: Partial<Pick<CodeGraphEdge, "kind" | "provenance" | "weight">> = {},
): CodeGraphEdge {
  return { from, to, kind: overrides.kind ?? "imports", provenance: overrides.provenance ?? "declared", weight: overrides.weight ?? 1 };
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

function fileSummary(path: string, language = "typescript", lines = 10) {
  return { path, lines, language };
}

function repoWith(files: readonly ReturnType<typeof fileSummary>[], graph: CodeGraph | null): RepoUnit {
  return { repoName: "test", files, functions: [], clones: [], graph };
}

/** `count` módulos DISTINTOS (carpetas separadas), cada uno con UNA arista
 *  hacia `targetFile` — el único modo de aumentar `Ca` (afluencia) del
 *  destino en una unidad por módulo, ver el docstring de `computeDegrees` en
 *  `instability.ts`: se cuenta grado (módulos distintos), no peso de arista. */
function dependentsOf(
  count: number,
  targetFile: string,
  prefix: string,
): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[]; files: ReturnType<typeof fileSummary>[] } {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const files: ReturnType<typeof fileSummary>[] = [];
  for (let i = 0; i < count; i++) {
    const path = `${prefix}${i}/f.ts`;
    nodes.push(...moduleFile(path));
    files.push(fileSummary(path));
    edges.push(edge(fileNodeId(path), fileNodeId(targetFile)));
  }
  return { nodes, edges, files };
}

/** `count` módulos DISTINTOS a los que `sourceFile` apunta — aumenta `Ce`
 *  (egreso) del origen, mismo principio que `dependentsOf` en la otra
 *  dirección. */
function dependenciesOf(
  count: number,
  sourceFile: string,
  prefix: string,
): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[]; files: ReturnType<typeof fileSummary>[] } {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  const files: ReturnType<typeof fileSummary>[] = [];
  for (let i = 0; i < count; i++) {
    const path = `${prefix}${i}/f.ts`;
    nodes.push(...moduleFile(path));
    files.push(fileSummary(path));
    edges.push(edge(fileNodeId(sourceFile), fileNodeId(path)));
  }
  return { nodes, edges, files };
}

describe("unstable-dependency", () => {
  it("un módulo estable (muchos dependientes, pocas dependencias) que depende de uno volátil (al revés) es un hallazgo", () => {
    // core: Ca=3 (dep0/1/2 dependen de core), Ce=1 (depende de adapter) -> I=1/4=0.25
    // adapter: Ca=1 (sólo core depende de él), Ce=3 (depende de extern0/1/2) -> I=3/4=0.75
    // gap = 0.75 - 0.25 = 0.5, claramente por encima de cualquier umbral razonable (< 1.0).
    const core = "core/a.ts";
    const adapter = "adapter/b.ts";
    const deps = dependentsOf(3, core, "dep");
    const externs = dependenciesOf(3, adapter, "extern");

    const nodes = [...moduleFile(core), ...moduleFile(adapter), ...deps.nodes, ...externs.nodes];
    const edges = [edge(fileNodeId(core), fileNodeId(adapter)), ...deps.edges, ...externs.edges];
    const files = [fileSummary(core), fileSummary(adapter), ...deps.files, ...externs.files];

    const graph = graphOf(nodes, edges);
    const threshold = testContext(detector, "*").threshold("minInstabilityGap");
    const repo = repoWith(files, graph);
    const findings = buildUnstableDependencyFindings(repo, graph, threshold);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain('"core"');
    expect(findings[0]!.title).toContain('"adapter"');
    expect(findings[0]!.locations[0]).toMatchObject({ file: core, role: "módulo estable que depende de uno volátil" });
    expect(findings[0]!.locations[1]).toMatchObject({ file: adapter, role: "módulo volátil del que depende" });
    expect(findings[0]!.trigger[0]!.value).toBeCloseTo(0.5, 5);
  });

  it("control negativo: ambos módulos con instabilidad similar (misma cantidad de dependientes/dependencias) no dispara", () => {
    // a y b, cada uno Ca=2, Ce=1 (además de la arista mutua bajo prueba) -> misma I para ambos -> gap ~ 0.
    const a = "a/f.ts";
    const b = "b/f.ts";
    const depsA = dependentsOf(2, a, "depa");
    const depsB = dependentsOf(2, b, "depb");
    const nodes = [...moduleFile(a), ...moduleFile(b), ...depsA.nodes, ...depsB.nodes];
    const edges = [edge(fileNodeId(a), fileNodeId(b)), ...depsA.edges, ...depsB.edges];
    const files = [fileSummary(a), fileSummary(b), ...depsA.files, ...depsB.files];
    const graph = graphOf(nodes, edges);
    const threshold = testContext(detector, "*").threshold("minInstabilityGap");
    const findings = buildUnstableDependencyFindings(repoWith(files, graph), graph, threshold);
    expect(findings).toHaveLength(0);
  });

  it("control negativo: la dirección BUENA (el módulo volátil depende del estable) no dispara", () => {
    // Mismo par core/adapter que el primer test, pero la arista va adapter -> core (adapter, el volátil,
    // depende de core, el estable): exactamente la dirección que el "Stable Dependency Principle" pide.
    const core = "core/a.ts";
    const adapter = "adapter/b.ts";
    const deps = dependentsOf(3, core, "dep");
    const externs = dependenciesOf(3, adapter, "extern");
    const nodes = [...moduleFile(core), ...moduleFile(adapter), ...deps.nodes, ...externs.nodes];
    const edges = [edge(fileNodeId(adapter), fileNodeId(core)), ...deps.edges, ...externs.edges];
    const files = [fileSummary(core), fileSummary(adapter), ...deps.files, ...externs.files];
    const graph = graphOf(nodes, edges);
    const threshold = testContext(detector, "*").threshold("minInstabilityGap");
    const findings = buildUnstableDependencyFindings(repoWith(files, graph), graph, threshold);
    expect(findings).toHaveLength(0);
  });

  it("una arista `references` (no imports/extends/implements) no cuenta: mismo par, sin hallazgo", () => {
    const core = "core/a.ts";
    const adapter = "adapter/b.ts";
    const deps = dependentsOf(3, core, "dep");
    const externs = dependenciesOf(3, adapter, "extern");
    const nodes = [...moduleFile(core), ...moduleFile(adapter), ...deps.nodes, ...externs.nodes];
    // La arista bajo prueba es `references`, no uno de los 3 kinds que usa `instability.ts`.
    const edges = [edge(fileNodeId(core), fileNodeId(adapter), { kind: "references" }), ...deps.edges, ...externs.edges];
    const files = [fileSummary(core), fileSummary(adapter), ...deps.files, ...externs.files];
    const graph = graphOf(nodes, edges);
    const threshold = testContext(detector, "*").threshold("minInstabilityGap");
    const findings = buildUnstableDependencyFindings(repoWith(files, graph), graph, threshold);
    expect(findings).toHaveLength(0);
  });

  it("una arista `inferred` se EXCLUYE (evidencia positiva, ver 'OJO CON JAVA' del docstring): el hallazgo desaparece", () => {
    const core = "core/a.ts";
    const adapter = "adapter/b.ts";
    const deps = dependentsOf(3, core, "dep");
    const externs = dependenciesOf(3, adapter, "extern");
    const nodes = [...moduleFile(core), ...moduleFile(adapter), ...deps.nodes, ...externs.nodes];
    const edges = [
      edge(fileNodeId(core), fileNodeId(adapter), { provenance: "inferred" as Provenance }),
      ...deps.edges,
      ...externs.edges,
    ];
    const files = [fileSummary(core), fileSummary(adapter), ...deps.files, ...externs.files];
    const graph = graphOf(nodes, edges);
    const threshold = testContext(detector, "*").threshold("minInstabilityGap");
    const findings = buildUnstableDependencyFindings(repoWith(files, graph), graph, threshold);
    expect(findings).toHaveLength(0);
  });

  it("el borde del umbral (piso declarado): justo en el umbral no dispara, justo por encima sí", () => {
    const gap = testContext(detector, "*").threshold("minInstabilityGap").value;
    // Resolución de la fixture: 10 módulos distintos por lado (denominador común), suficiente para
    // representar exactamente cualquier umbral múltiplo de 0.1 — el umbral declarado en este archivo
    // (`MIN_GAP_SPEC`) lo es. Ver el docstring de `dependentsOf`/`dependenciesOf`: cada módulo extra
    // cuesta UNA carpeta, así que el denominador se elige lo más chico posible que reproduzca el umbral
    // exactamente en vez de uno más fino y más caro de construir.
    const SCALE = 10;
    const iFrom = 1 / SCALE; // Ca(from)=SCALE-1, Ce(from)=1
    const ceToAt = Math.round((gap + iFrom) * SCALE); // Ce(to) tal que I(to) == gap + iFrom exactamente
    const caToAt = SCALE - ceToAt; // incluye la arista entrante desde "from"

    function buildFixture(ceTo: number, caTo: number) {
      const from = "from/f.ts";
      const to = "to/f.ts";
      const fromDeps = dependentsOf(SCALE - 1, from, "fromdep");
      const toDeps = dependentsOf(caTo - 1, to, "todep"); // -1: la arista from->to ya aporta 1
      const toLeaves = dependenciesOf(ceTo, to, "toleaf");
      const nodes = [...moduleFile(from), ...moduleFile(to), ...fromDeps.nodes, ...toDeps.nodes, ...toLeaves.nodes];
      const edges = [edge(fileNodeId(from), fileNodeId(to)), ...fromDeps.edges, ...toDeps.edges, ...toLeaves.edges];
      const files = [fileSummary(from), fileSummary(to), ...fromDeps.files, ...toDeps.files, ...toLeaves.files];
      return { graph: graphOf(nodes, edges), files };
    }

    const atThreshold = buildFixture(ceToAt, caToAt);
    const aboveThreshold = buildFixture(ceToAt + 1, caToAt - 1);

    const threshold = testContext(detector, "*").threshold("minInstabilityGap");
    // `representativeFile` descarta un hallazgo cuando no encuentra un archivo real bajo el módulo (ver
    // su docstring) — por eso hace falta pasar el `RepoUnit.files` real de cada fixture, no uno vacío.
    const atFindings = buildUnstableDependencyFindings(repoWith(atThreshold.files, atThreshold.graph), atThreshold.graph, threshold);
    const aboveFindings = buildUnstableDependencyFindings(
      repoWith(aboveThreshold.files, aboveThreshold.graph),
      aboveThreshold.graph,
      threshold,
    );

    expect(atFindings).toHaveLength(0);
    expect(aboveFindings.length).toBeGreaterThan(0);
  });

  it("groupKey agrupa por el módulo VOLÁTIL de destino: dos orígenes distintos hacia el mismo destino comparten clave", () => {
    const stableA = "stableA/f.ts";
    const stableB = "stableB/f.ts";
    const volatile = "volatile/f.ts";
    const depsA = dependentsOf(3, stableA, "depa");
    const depsB = dependentsOf(3, stableB, "depb");
    const externs = dependenciesOf(3, volatile, "extern");
    const nodes = [
      ...moduleFile(stableA),
      ...moduleFile(stableB),
      ...moduleFile(volatile),
      ...depsA.nodes,
      ...depsB.nodes,
      ...externs.nodes,
    ];
    const edges = [
      edge(fileNodeId(stableA), fileNodeId(volatile)),
      edge(fileNodeId(stableB), fileNodeId(volatile)),
      ...depsA.edges,
      ...depsB.edges,
      ...externs.edges,
    ];
    const files = [
      fileSummary(stableA),
      fileSummary(stableB),
      fileSummary(volatile),
      ...depsA.files,
      ...depsB.files,
      ...externs.files,
    ];
    const graph = graphOf(nodes, edges);
    const threshold = testContext(detector, "*").threshold("minInstabilityGap");
    const findings = buildUnstableDependencyFindings(repoWith(files, graph), graph, threshold);

    expect(findings).toHaveLength(2);
    expect(detector.groupKey).toBeDefined();
    const keys = findings.map((f) => detector.groupKey!(f));
    expect(keys[0]).toBe(keys[1]);
  });

  it("sin grafo: detector.run devuelve [] de forma defensiva (run.ts ya reporta 'sin-grafo' antes de llegar acá)", () => {
    const repo = repoWith([fileSummary("a.ts")], null);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(0);
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const core = "core/a.ts";
    const adapter = "adapter/b.ts";
    const deps = dependentsOf(3, core, "dep");
    const externs = dependenciesOf(3, adapter, "extern");
    const nodes = [...moduleFile(core), ...moduleFile(adapter), ...deps.nodes, ...externs.nodes];
    const edges = [edge(fileNodeId(core), fileNodeId(adapter)), ...deps.edges, ...externs.edges];
    const files = [fileSummary(core), fileSummary(adapter), ...deps.files, ...externs.files];
    const graph = graphOf(nodes, edges);
    const repo = repoWith(files, graph);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(1);
  });
});
