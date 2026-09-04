import { describe, expect, it } from "vitest";

import { buildGodComponentFindings, detector, findHubCandidates } from "./god-component.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoUnit } from "../types.js";
import { fileNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: el detector sólo lee `RepoUnit.graph`
 * (nodos+aristas planas) y `RepoUnit.files` (para las líneas, sólo contexto
 * informativo) — no hace falta tree-sitter, igual que
 * `dependency-cycle.test.ts`/`orphan-file.test.ts`. Por la misma razón,
 * "≥3 lenguajes que emiten" no aplica: el detector no clasifica por
 * lenguaje (opera sobre la FORMA del grafo entre archivos), `ctx.language`
 * es el centinela `"*"` en producción.
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function edge(from: string, to: string, overrides: Partial<Pick<CodeGraphEdge, "kind" | "provenance">> = {}): CodeGraphEdge {
  return {
    from: fileNodeId(from),
    to: fileNodeId(to),
    kind: overrides.kind ?? "references",
    provenance: overrides.provenance ?? "declared",
    weight: 1,
  };
}

const EMPTY_STATS = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function graphOf(files: readonly string[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes: files.map(fileNode), edges, resolution: EMPTY_STATS };
}

function fileSummary(path: string, lines = 10, language = "typescript"): FileSummary {
  return { path, lines, language };
}

function repoWith(files: readonly FileSummary[], graph: CodeGraph | null): RepoUnit {
  return { repoName: "test", files, functions: [], clones: [], graph };
}

/** `n` archivos distintos, cada uno con una arista hacia `hub` (fan-in de `hub` == n). */
function callersOf(hub: string, n: number): { files: string[]; edges: CodeGraphEdge[] } {
  const files = Array.from({ length: n }, (_, i) => `caller${i}.ts`);
  return { files, edges: files.map((f) => edge(f, hub)) };
}

/** `hub` con una arista hacia cada uno de `n` archivos distintos (fan-out de `hub` == n). */
function calleesOf(hub: string, n: number): { files: string[]; edges: CodeGraphEdge[] } {
  const files = Array.from({ length: n }, (_, i) => `callee${i}.ts`);
  return { files, edges: files.map((f) => edge(hub, f)) };
}

describe("god-component", () => {
  it("fan-in Y fan-out ambos en el umbral (o por encima): hallazgo con rol y ambos triggers", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value;
    const fanOutFloor = ctx.threshold("fanOutFloor").value;
    const { files: callers, edges: inEdges } = callersOf("hub.ts", fanInFloor);
    const { files: callees, edges: outEdges } = calleesOf("hub.ts", fanOutFloor);
    const files = [...callers, "hub.ts", ...callees];
    const graph = graphOf(files, [...inEdges, ...outEdges]);

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f)),
      graph,
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.file).toBe("hub.ts");
    expect(findings[0]!.locations[0]!.role).toBe("archivo con fan-in y fan-out simultáneamente altos (posible hub/god component)");
    expect(findings[0]!.trigger).toHaveLength(2);
    expect(findings[0]!.trigger[0]!.value).toBe(fanInFloor);
    expect(findings[0]!.trigger[1]!.value).toBe(fanOutFloor);
  });

  it("el borde del umbral: un fan-out menos que el piso no dispara (piso pedido a testContext, no hardcodeado)", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value;
    const fanOutFloor = ctx.threshold("fanOutFloor").value;
    const { files: callers, edges: inEdges } = callersOf("hub.ts", fanInFloor);
    const { files: callees, edges: outEdges } = calleesOf("hub.ts", fanOutFloor - 1);
    const files = [...callers, "hub.ts", ...callees];
    const graph = graphOf(files, [...inEdges, ...outEdges]);

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f)),
      graph,
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );
    expect(findings).toHaveLength(0);
  });

  it("control negativo: sólo fan-in alto (API/biblioteca estable, fan-out ~0) no dispara", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value;
    const { files: callers, edges } = callersOf("api.ts", fanInFloor * 3);
    const files = [...callers, "api.ts"];
    const graph = graphOf(files, edges);

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f)),
      graph,
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );
    expect(findings).toHaveLength(0);
  });

  it("control negativo: sólo fan-out alto (orquestador legítimo, fan-in ~0) no dispara", () => {
    const ctx = testContext(detector, "*");
    const fanOutFloor = ctx.threshold("fanOutFloor").value;
    const { files: callees, edges } = calleesOf("orchestrator.ts", fanOutFloor * 3);
    const files = ["orchestrator.ts", ...callees];
    const graph = graphOf(files, edges);

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f)),
      graph,
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );
    expect(findings).toHaveLength(0);
  });

  it("una arista `inferred` NO cuenta para fan-in/fan-out (evidencia positiva excluida — ver 'OJO CON JAVA')", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value;
    const fanOutFloor = ctx.threshold("fanOutFloor").value;
    // Justo UNA arista de fan-in por debajo del piso con provenance confiable...
    const { files: callers, edges: inEdges } = callersOf("hub.java", fanInFloor - 1);
    const { files: callees, edges: outEdges } = calleesOf("hub.java", fanOutFloor);
    // ...y la que falta llega SÓLO por una arista `inferred` (heurística path-proximity).
    const inferredEdge = edge("extraCaller.java", "hub.java", { provenance: "inferred" as Provenance });
    const files = [...callers, "extraCaller.java", "hub.java", ...callees];
    const graph = graphOf(files, [...inEdges, inferredEdge, ...outEdges]);

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f, 10, "java")),
      graph,
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );
    // Sin la arista inferred, fan-in real (declared/resolved) sigue un paso por
    // debajo del piso: no debería dispararse.
    expect(findings).toHaveLength(0);
  });

  /**
   * OLA P (P8), cambio D: el criterio "declara comportamiento" reemplaza al
   * chequeo de sufijo `.d.ts`. Dos grafos IDÉNTICOS en forma; lo único que
   * cambia es la familia de los símbolos que el archivo declara.
   */
  it("un archivo que no declara ningún símbolo `function-like` (barril de tipos/opciones) no es un hub, con la MISMA forma de grafo", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value;
    const fanOutFloor = ctx.threshold("fanOutFloor").value;

    const run = (family: "function-like" | "class-like") => {
      const { files: callers, edges: inEdges } = callersOf("hub.ts", fanInFloor);
      const { files: callees, edges: outEdges } = calleesOf("hub.ts", fanOutFloor);
      const files = [...callers, "hub.ts", ...callees];
      const graph = graphOf(files, [...inEdges, ...outEdges]);
      // Un símbolo por archivo: los vecinos siempre `function-like`, para que
      // el hecho SEA medible en el grafo (ausente ≠ false); sólo `hub.ts`
      // cambia de familia entre las dos corridas.
      const symbols: CodeGraphNode[] = files.map((f) => ({
        id: `sym:${f}#s`,
        kind: "symbol",
        file: f,
        symbolPath: ["s"],
        family: f === "hub.ts" ? family : "function-like",
      }));
      return buildGodComponentFindings(
        files.map((f) => fileSummary(f)),
        { ...graph, nodes: [...graph.nodes, ...symbols] },
        ctx.threshold("fanInFloor"),
        ctx.threshold("fanOutFloor"),
      );
    };

    expect(run("function-like")).toHaveLength(1);
    expect(run("class-like")).toHaveLength(0);
  });

  /**
   * OLA P (P8), cambio C: la fuente citada pide fan-in y fan-out
   * simultáneamente altos; dos pisos independientes admiten una raíz de
   * jerarquía (fan-in 651 / fan-out 17, `rubocop/lib/rubocop/cop/base.rb`,
   * juzgada FALSA a mano).
   */
  it("desequilibrio: fan-in altísimo con fan-out apenas en el piso NO es un hub (raíz de jerarquía / utilidad fundacional)", () => {
    const ctx = testContext(detector, "*");
    const fanOutFloor = ctx.threshold("fanOutFloor").value;
    // fan-in 40 contra fan-out 8: desequilibrio 5x, por encima del tope 4x.
    const { files: callers, edges: inEdges } = callersOf("base.ts", 40);
    const { files: callees, edges: outEdges } = calleesOf("base.ts", fanOutFloor);
    const files = [...callers, "base.ts", ...callees];

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f)),
      graphOf(files, [...inEdges, ...outEdges]),
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );
    expect(findings).toHaveLength(0);
  });

  /**
   * OLA P (P8), cambio A: `calls` es la partición callee de la MISMA cascada
   * que produce `references` (`graph/edge-kinds.ts`), y la lista de kinds que
   * el detector usaba (`pagerank.edgeKinds`) se escribió antes de que ese
   * kind existiera.
   */
  it("una arista `calls` cuenta como dependencia igual que una `references`", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value;
    const fanOutFloor = ctx.threshold("fanOutFloor").value;
    const { files: callers, edges: inEdges } = callersOf("hub.ts", fanInFloor);
    const { files: callees } = calleesOf("hub.ts", fanOutFloor);
    // TODAS las salientes son `calls`, ni una `references`.
    const outEdges = callees.map((f) => edge("hub.ts", f, { kind: "calls" }));
    const files = [...callers, "hub.ts", ...callees];

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f)),
      graphOf(files, [...inEdges, ...outEdges]),
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[1]!.value).toBe(fanOutFloor);
  });

  /**
   * OLA P (P8), cambio B — el que recupera `eslint/lib/eslint/eslint.js`
   * (fan-in 6, piso del corpus 8) y `rubocop/lib/rubocop/cli.rb` (fan-in 7).
   */
  it("piso relativo al repo: con >= 20 archivos y un p95 propio por debajo del piso del corpus, el piso baja al del repo", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value; // 8, piso del corpus
    // 30 archivos planos (grado 0) + un hub con fan-in/fan-out 5: el p95 del
    // repo queda en 5, muy por debajo del piso del corpus.
    const relleno = Array.from({ length: 30 }, (_, i) => `plano${i}.ts`);
    const { files: callers, edges: inEdges } = callersOf("hub.ts", 5);
    const { files: callees, edges: outEdges } = calleesOf("hub.ts", 5);
    const files = [...relleno, ...callers, "hub.ts", ...callees];

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f)),
      graphOf(files, [...inEdges, ...outEdges]),
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );
    expect(fanInFloor).toBeGreaterThan(5); // el piso del corpus lo habría descartado
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.threshold.value).toBeLessThanOrEqual(5);
    expect(findings[0]!.trigger[0]!.threshold.label).toContain("p95");
  });

  /**
   * La otra mitad del cambio B: el piso es un `min`, así que en un repo denso
   * NO sube — lo que evita que un archivo deje de reportarse por vivir en un
   * repo grande. Quien acota ahí es la condición de OUTLIER.
   */
  it("outlier: en un repo denso, pasar el piso no alcanza — hay que destacar en al menos un eje contra el p95 propio", () => {
    const ctx = testContext(detector, "*");
    // 40 archivos que se referencian todos entre sí en pares densos: el p95
    // propio queda alto, y un archivo apenas sobre el piso del corpus no
    // destaca.
    const densos = Array.from({ length: 40 }, (_, i) => `denso${i}.ts`);
    const edges: CodeGraphEdge[] = [];
    for (const a of densos) for (const b of densos) if (a !== b) edges.push(edge(a, b));
    const { files: callers, edges: inEdges } = callersOf("tibio.ts", 8);
    const { files: callees, edges: outEdges } = calleesOf("tibio.ts", 8);
    const files = [...densos, ...callers, "tibio.ts", ...callees];

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f)),
      graphOf(files, [...edges, ...inEdges, ...outEdges]),
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );
    expect(findings.some((f) => f.locations[0]!.file === "tibio.ts")).toBe(false);
  });

  it("participa de un ciclo de dependencias (SCC) entre sus propios vecinos: la evidencia lo marca", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value;
    const fanOutFloor = ctx.threshold("fanOutFloor").value;
    const { files: callers, edges: inEdges } = callersOf("hub.ts", fanInFloor);
    const { files: callees, edges: outEdges } = calleesOf("hub.ts", fanOutFloor);
    // `hub.ts` -> callee0.ts (ya en outEdges) y callee0.ts -> hub.ts: SCC de tamaño 2 con `hub.ts`.
    const backEdge = edge("callee0.ts", "hub.ts");
    const files = [...callers, "hub.ts", ...callees];
    const graph = graphOf(files, [...inEdges, ...outEdges, backEdge]);

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f)),
      graph,
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );
    expect(findings).toHaveLength(1);
    const cycleEvidence = findings[0]!.evidence!.find((e) => e.label.includes("ciclo"));
    expect(cycleEvidence!.value).toBe(1);
    expect(findings[0]!.detail).toContain("ciclo de dependencias");
  });

  it("control negativo: sin ciclo, la evidencia de ciclo es 0", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value;
    const fanOutFloor = ctx.threshold("fanOutFloor").value;
    const { files: callers, edges: inEdges } = callersOf("hub.ts", fanInFloor);
    const { files: callees, edges: outEdges } = calleesOf("hub.ts", fanOutFloor);
    const files = [...callers, "hub.ts", ...callees];
    const graph = graphOf(files, [...inEdges, ...outEdges]);

    const findings = buildGodComponentFindings(
      files.map((f) => fileSummary(f)),
      graph,
      ctx.threshold("fanInFloor"),
      ctx.threshold("fanOutFloor"),
    );
    expect(findings).toHaveLength(1);
    const cycleEvidence = findings[0]!.evidence!.find((e) => e.label.includes("ciclo"));
    expect(cycleEvidence!.value).toBe(0);
  });

  it("una arista `contains` (jerarquía carpeta->archivo) no cuenta para fan-in/fan-out", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value;
    const fanOutFloor = ctx.threshold("fanOutFloor").value;
    const { files: callers, edges: inEdges } = callersOf("hub.ts", fanInFloor);
    const { files: callees, edges: outEdges } = calleesOf("hub.ts", fanOutFloor);
    // Aristas `contains` extra, que si contaran empujarían fan-in/fan-out muy por
    // encima del piso ya justo — no deberían cambiar nada en el resultado.
    const containsNoise = Array.from({ length: 5 }, (_, i) =>
      edge(`unrelated${i}.ts`, "hub.ts", { kind: "contains" }),
    );
    const files = [...callers, "hub.ts", ...callees];
    const graph = graphOf(files, [...inEdges, ...outEdges, ...containsNoise]);

    const candidates = findHubCandidates(graph);
    const hub = candidates.find((c) => c.file === "hub.ts")!;
    expect(hub.fanIn).toBe(fanInFloor);
    expect(hub.fanOut).toBe(fanOutFloor);
  });

  it("sin grafo: detector.run devuelve [] de forma defensiva (run.ts ya reporta 'sin-grafo' antes de llegar acá)", () => {
    const repo = repoWith([fileSummary("a.ts")], null);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(0);
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const ctx = testContext(detector, "*");
    const fanInFloor = ctx.threshold("fanInFloor").value;
    const fanOutFloor = ctx.threshold("fanOutFloor").value;
    const { files: callers, edges: inEdges } = callersOf("hub.ts", fanInFloor);
    const { files: callees, edges: outEdges } = calleesOf("hub.ts", fanOutFloor);
    const files = [...callers, "hub.ts", ...callees];
    const repo = repoWith(
      files.map((f) => fileSummary(f)),
      graphOf(files, [...inEdges, ...outEdges]),
    );
    const findings = detector.run(repo, ctx);
    expect(findings).toHaveLength(1);
  });
});
