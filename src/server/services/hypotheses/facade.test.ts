import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding, FileSummary, RepoUnit } from "../detect/types.js";
import { fileNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { buildNeighborhoodIndex, EMPTY_NEIGHBORHOOD, neighborhoodFor } from "../graph/neighborhood.js";
import { __internals, hypothesis, startFacadeTrace, takeFacadeTrace } from "./facade.js";
import type { HypothesisContext } from "./types.js";

/**
 * Fixtures de grafo REAL (no `FakeGraph` del spike) — mismo caso de
 * referencia que `CONTRATO-F6.md`/el spike miden sobre jekyll: `site.rb`
 * coordina 6 colaboradores internos, dos clientes externos lo referencian
 * y uno de ellos (`cli_build.rb`) además llama directo a `converters.rb`,
 * saltándose la fachada de facto.
 */
const SITE_COLLABORATORS = ["converters.rb", "generators.rb", "plugin_manager.rb", "dest.rb", "keep_files.rb", "static_files.rb"];

function fileNode(path: string): CodeGraphNode {
  return { id: fileNodeId(path), kind: "file", file: path, symbolPath: [] };
}

function edge(from: string, to: string): CodeGraphEdge {
  return { from: fileNodeId(from), to: fileNodeId(to), kind: "references", provenance: "declared", weight: 1 };
}

/** Ola 10 — símbolo `function-like` (miembro con `calls` saliente) de `file`, para probar `hasDelegatingCalls`. */
function methodNode(file: string, name: string): CodeGraphNode {
  return { id: `sym:${file}#${name}`, kind: "symbol", file, symbolPath: [name], family: "function-like" };
}

/** Ola 10 — símbolo `family: "other"` (campo/constante de nivel clase) de `file`, para probar `ownStateWithinBudget`. */
function otherFieldNode(file: string, name: string): CodeGraphNode {
  return { id: `sym:${file}#field.${name}`, kind: "symbol", file, symbolPath: [`field.${name}`], family: "other" };
}

function callsEdge(fromId: string, toId: string): CodeGraphEdge {
  return { from: fromId, to: toId, kind: "calls", provenance: "declared", weight: 1 };
}

function makeGraph(files: readonly string[], edges: readonly (readonly [string, string])[]): CodeGraph {
  return {
    nodes: files.map(fileNode),
    edges: edges.map(([a, b]) => edge(a, b)),
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

/**
 * OLA V (frente V5) — llamada PROPIA del candidato, hacia un símbolo del
 * MISMO archivo. Satisface el `required` nuevo `invoca-en-vez-de-solo-nombrar`
 * ("este archivo invoca algo, no sólo nombra colaboradores") SIN satisfacer
 * `hasDelegatingCalls` ("llama a un COLABORADOR"), que es lo que sigue
 * separando `ausente` de `ya-aplicado`. Es la forma del `site.rb` real:
 * `Site#process` existe y llama, la pregunta abierta es a quién.
 */
function ownCallEdges(file: string): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const caller = methodNode(file, "Own.caller");
  const callee = methodNode(file, "Own.helper");
  return { nodes: [caller, callee], edges: [callsEdge(caller.id, callee.id)] };
}

/** site.rb -> 6 colaboradores, referenciado por cli_build.rb/cli_serve.rb. Sin fuga. */
function jekyllAusenteGraph(): CodeGraph {
  const files = ["site.rb", "cli_build.rb", "cli_serve.rb", ...SITE_COLLABORATORS];
  const edges: (readonly [string, string])[] = [
    ...SITE_COLLABORATORS.map((c) => ["site.rb", c] as const),
    ["cli_build.rb", "site.rb"],
    ["cli_serve.rb", "site.rb"],
  ];
  const base = makeGraph(files, edges);
  const own = ownCallEdges("site.rb");
  return { ...base, nodes: [...base.nodes, ...own.nodes], edges: [...base.edges, ...own.edges] };
}

/** Idéntico al anterior, PERO cli_build.rb también llama converters.rb directo: la fuga. */
function jekyllAplicadoEludidoGraph(): CodeGraph {
  const base = jekyllAusenteGraph();
  return {
    ...base,
    edges: [...base.edges, edge("cli_build.rb", "converters.rb")],
  };
}

/**
 * P4 (precisión medida en corpus): idéntico a `jekyllAplicadoEludidoGraph`,
 * pero el "colaborador puenteado" es una utilidad ampliamente compartida —
 * MUCHOS archivos sin relación con `site.rb` la referencian de forma
 * independiente (fan-in propio >= el fan-in del propio candidato) — mismo
 * caso medido en el corpus real (`lib/jekyll.rb` fan-in 50 vs. `site.rb`
 * fan-in 5; `Preconditions.java` fan-in 367 vs. `Ordering.java` fan-in 62).
 */
function jekyllWidelySharedUtilGraph(): CodeGraph {
  const base = jekyllAusenteGraph(); // site.rb: 6 colaboradores, 2 referencers externos (fan-in propio = 2)
  const unrelatedCallers = ["u1.rb", "u2.rb", "u3.rb"]; // 3 más, junto con site.rb (que ya referencia converters.rb) => fan-in independiente 3 >= 2
  return {
    ...base,
    nodes: [...base.nodes, ...unrelatedCallers.map(fileNode)],
    edges: [...base.edges, edge("cli_build.rb", "converters.rb"), ...unrelatedCallers.map((u) => edge(u, "converters.rb"))],
  };
}

/** util.rb -> sólo 2 colaboradores: por debajo de FACADE_MIN_COLLABORATORS (4). */
function belowThresholdGraph(): CodeGraph {
  return makeGraph(["util.rb", "a.rb", "b.rb", "caller.rb"], [
    ["util.rb", "a.rb"],
    ["util.rb", "b.rb"],
    ["caller.rb", "util.rb"],
  ]);
}

/**
 * hub.rb -> c1..c4 (fan-out EXACTO al umbral), pero los 4 colaboradores se
 * conocen todos entre sí (clique completo) — coeficiente de agrupamiento
 * ALTO: `low-neighbor-clustering` debe FALLAR. Se agrega además `mega.rb`
 * con fan-out 10 (> 4) para que `fanout-is-repo-max` TAMBIÉN falle para
 * `hub.rb` — los DOS discriminadores en cero, ladder(0) = "baja".
 */
function cohesiveClusterGraph(): CodeGraph {
  const collaborators = ["c1.rb", "c2.rb", "c3.rb", "c4.rb"];
  const megaTargets = Array.from({ length: 10 }, (_, i) => `m${i}.rb`);
  const files = ["hub.rb", "ext.rb", "mega.rb", ...collaborators, ...megaTargets];
  const pairwise: (readonly [string, string])[] = [];
  for (let i = 0; i < collaborators.length; i++) {
    for (let j = i + 1; j < collaborators.length; j++) {
      pairwise.push([collaborators[i]!, collaborators[j]!]);
    }
  }
  const edges: (readonly [string, string])[] = [
    ...collaborators.map((c) => ["hub.rb", c] as const),
    ["ext.rb", "hub.rb"],
    ...pairwise,
    ...megaTargets.map((m) => ["mega.rb", m] as const),
  ];
  const base = makeGraph(files, edges);
  const own = ownCallEdges("hub.rb"); // OLA V: el candidato invoca algo propio (ver `ownCallEdges`)
  return { ...base, nodes: [...base.nodes, ...own.nodes], edges: [...base.edges, ...own.edges] };
}

/**
 * Ola 10 — COMPLETA/`ya-aplicado`: idéntico a `jekyllAusenteGraph` (site.rb,
 * 6 colaboradores, sin fuga), PERO con un símbolo de `Site` (`process`) que
 * hace `calls` real hacia un símbolo de `converters.rb` — la delegación
 * verificable que distingue "F es un Facade activo" de "F sólo los agrupa".
 */
function jekyllYaAplicadoGraph(): CodeGraph {
  const base = jekyllAusenteGraph();
  const siteProcess = methodNode("site.rb", "Site.process");
  const converterConvert = methodNode("converters.rb", "Converters.convert");
  return {
    ...base,
    nodes: [...base.nodes, siteProcess, converterConvert],
    edges: [...base.edges, callsEdge(siteProcess.id, converterConvert.id)],
  };
}

/**
 * Ola 10 — igual que `jekyllYaAplicadoGraph` (delega de verdad), PERO con más
 * miembros propios `family: "other"` que colaboradores tiene (7 > 6): el
 * proxy declarado de "estado propio" (CONTRATO-F10.md §0.4, sin ranura
 * tipada) debe FALLAR, y el candidato NO puede ascender a `ya-aplicado` — se
 * queda en `ausente` (sigue siendo oportunidad, más God Object que Facade).
 */
function jekyllDelegatesButOwnStateExceedsGraph(): CodeGraph {
  const base = jekyllYaAplicadoGraph();
  const ownFields = Array.from({ length: 7 }, (_, i) => otherFieldNode("site.rb", `f${i}`));
  return { ...base, nodes: [...base.nodes, ...ownFields] };
}

/**
 * Ola 10 — PARCIAL: `hubA.rb` (c1..c4) y `hubB.rb` (c3,c4,c5,c6) — fan-out
 * >= umbral cada uno, intersección no vacía ({c3,c4}), ninguno cubre al otro
 * entero. `hubA.rb` tiene además el fan-in externo que exige `required`
 * (`external.rb`), y ninguna fuga propia — sin la señal nueva, esto quedaría
 * indistinguible de `ausente`.
 */
function partialFacadesGraph(): CodeGraph {
  const hubACollabs = ["c1.rb", "c2.rb", "c3.rb", "c4.rb"];
  const hubBCollabs = ["c3.rb", "c4.rb", "c5.rb", "c6.rb"];
  const files = ["hubA.rb", "hubB.rb", "external.rb", "c1.rb", "c2.rb", "c3.rb", "c4.rb", "c5.rb", "c6.rb"];
  const edges: (readonly [string, string])[] = [
    ...hubACollabs.map((c) => ["hubA.rb", c] as const),
    ...hubBCollabs.map((c) => ["hubB.rb", c] as const),
    ["external.rb", "hubA.rb"],
  ];
  const base = makeGraph(files, edges);
  const own = ownCallEdges("hubA.rb"); // OLA V: el candidato invoca algo propio (ver `ownCallEdges`)
  return { ...base, nodes: [...base.nodes, ...own.nodes], edges: [...base.edges, ...own.edges] };
}

/**
 * Ola 10 — réplica de la forma EXACTA de la fixture canónica
 * `fixtures-multi/facade/*` (`OrderFacade` + 4 colaboradores inyectados por
 * constructor, cada método delega en exactamente uno). MEDIDO, no supuesto
 * (`scripts/measure-facade.mts` sobre las 101 fixtures completas): el ancla
 * `fanout-without-cohesion` da CERO hallazgos ahí — la fixture canónica es UN
 * SOLO archivo por lenguaje y sus "colaboradores" (`PaymentGateway`, etc.) son
 * tipos sin archivo propio en el corpus, así que el fan-out a grano ARCHIVO
 * (lo único que esta hipótesis mira, `needs: []`) es cero: no hay forma de
 * ejercitar el ancla de esta hipótesis sobre esa fixture tal como está, ni
 * subiendo ni bajando ningún umbral propio de `facade.ts`. Esta réplica la
 * completa con un archivo real por colaborador (mismos 4 nombres) para poder
 * verificar la forma COMPLETA sobre la MISMA estructura, con un grafo real.
 */
function orderFacadeGraph(): CodeGraph {
  const collaborators = ["payment-gateway.ts", "inventory-service.ts", "shipping-provider.ts", "notification-center.ts"];
  const files = ["order-facade.ts", "checkout-controller.ts", ...collaborators];
  const edges: (readonly [string, string])[] = [
    ...collaborators.map((c) => ["order-facade.ts", c] as const),
    ["checkout-controller.ts", "order-facade.ts"],
  ];
  const graph = makeGraph(files, edges);
  const process = methodNode("order-facade.ts", "OrderFacade.process");
  const charge = methodNode("payment-gateway.ts", "PaymentGateway.charge");
  return {
    ...graph,
    nodes: [...graph.nodes, process, charge],
    edges: [...graph.edges, callsEdge(process.id, charge.id)],
  };
}

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(20, { rationale: "test" }), { language: "ruby", sampleSize: () => 0, corpusP95: () => null });
}

function fakeFinding(file: string, overrides: Partial<Finding> = {}): Finding {
  return {
    id: `finding-${file}`,
    detectorId: "fanout-without-cohesion",
    kind: "fanout-without-cohesion",
    scope: "inter-file",
    language: null,
    title: "t",
    detail: "d",
    trigger: [{ label: "fan-out", value: 20, threshold: fakeThreshold() }],
    locations: [{ file, startLine: 1, endLine: 10, role: "archivo con fan-out alto y coeficiente de agrupamiento bajo entre sus vecinos" }],
    severity: 60,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    ...overrides,
  };
}

function fakeRepo(files: readonly FileSummary[] = []): RepoUnit {
  return { repoName: "r", files, functions: [], clones: [], graph: null };
}

function emptySets() {
  return {
    functionNodes: new Set<string>(),
    branchNodes: new Set<string>(),
    chainNodes: new Set<string>(),
    cloneNodes: new Set<string>(),
    classNodes: new Set<string>(),
    nestingNodes: new Set<string>(),
    constructorNodes: new Set<string>(),
    exceptionNodes: new Set<string>(),
    switchContainerNodes: new Set<string>(),
  };
}

function fakeCtx(repo: RepoUnit, capabilities: ReadonlySet<Capability> = new Set()): HypothesisContext {
  return { file: null, fileAt: () => null, repo, capabilities, setsFor: () => emptySets(), neighborhood: EMPTY_NEIGHBORHOOD, branches: () => null };
}

describe("hypotheses/facade", () => {
  it("registro: id/pattern/anchors", () => {
    expect(hypothesis.id).toBe("facade");
    expect(hypothesis.pattern).toBe("Facade");
    // OLA W (frente W5) — segunda ancla, ver la sección "OLA W" del docstring del módulo.
    // OLA AD (frente AD4) — TERCERA ancla, el ancla-FUERZA. **La lista SUMA: las dos
    // viejas siguen exactamente donde estaban.** AD4 midió que las dos viejas producen
    // CERO `ausente` sobre 288 hipótesis en las dos poblaciones (244 `aplicado-eludido`,
    // 31 `ya-aplicado`, 13 `parcial`) y las dejó encendidas igual: la ola es ADITIVA y ese
    // número es el insumo de una decisión futura, no una licencia para apagar.
    // OLA AN (frente AN3) — las dos anclas de la CAPA DE REFACTORIZACIÓN se sumaron, se
    // MIDIERON sobre los 21 repos y se RETIRARON (688 propuestas, 0 de 63 verdaderas — ver
    // "OLA AN" en el docstring del módulo). La lista vuelve a las tres de siempre.
    expect(hypothesis.anchors).toEqual(["fanout-without-cohesion", "god-component", "repeated-collaborator-set"]);
  });

  /* ── OLA AD (frente AD4) — el camino de entrada del ancla-fuerza ──────────
   * Grafo mínimo con la forma que el ancla `repeated-collaborator-set` marca:
   * tres clientes que invocan, cada uno por su cuenta, los cuatro archivos de
   * un subsistema. Las aristas son `calls` símbolo→símbolo, que es lo que este
   * camino lee (`rawCalleeFilesOf`) — a propósito NO se usan las de archivo,
   * porque la proyección de PageRank descarta las ambiguas y este ancla vive
   * sobre ellas (ver el docstring de `rawCalleeFilesOf`). */
  const AD4_PIEZAS = ["sub/a.ts", "sub/b.ts", "sub/c.ts", "sub/d.ts"];
  const AD4_CLIENTES = ["cli/uno.ts", "cli/dos.ts", "cli/tres.ts"];

  function ad4Graph(extraNodes: readonly CodeGraphNode[] = [], extraEdges: readonly CodeGraphEdge[] = []): CodeGraph {
    const nodes: CodeGraphNode[] = [];
    const edges: CodeGraphEdge[] = [];
    for (const p of AD4_PIEZAS) nodes.push(methodNode(p, "open"));
    for (const c of AD4_CLIENTES) {
      nodes.push(methodNode(c, "hace"));
      for (const p of AD4_PIEZAS) edges.push(callsEdge(`sym:${c}#hace`, `sym:${p}#open`));
    }
    return { nodes: [...nodes, ...extraNodes], edges: [...edges, ...extraEdges], resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
  }

  function ad4Finding(clientes: readonly string[] = AD4_CLIENTES, piezas: readonly string[] = AD4_PIEZAS): Finding {
    return fakeFinding("cli/uno.ts", {
      id: "finding-ad4",
      detectorId: "repeated-collaborator-set",
      kind: "repeated-collaborator-set",
      locations: [
        ...clientes.map((f) => ({ file: f, startLine: 1, endLine: 5, symbol: "hace", role: "repite la coordinación: invoca los 4 pasos del núcleo por su cuenta" })),
        ...piezas.map((f) => ({ file: f, startLine: 1, endLine: 9, role: "pieza del subsistema: aporta 1 paso que todos repiten — open" })),
      ] as unknown as Finding["locations"],
    });
  }

  it("OLA AD — un `Finding` del ancla-fuerza construye por el camino NUEVO: `ausente` cuando ningún archivo coordina el subsistema", () => {
    const h = hypothesis.build(ad4Finding(), ad4Graph(), fakeCtx(fakeRepo()));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).not.toBeNull();
    // los `places` son los del ancla, con sus roles intactos
    expect(h!.places.map((p) => p.file).sort()).toEqual([...AD4_CLIENTES, ...AD4_PIEZAS].sort());
  });

  it("OLA AD — media puerta ya escrita (un archivo ajeno alcanza 3 de las 4 piezas, más de la mitad, y ya tiene clientes) ⇒ `parcial`, no `ausente`", () => {
    const media = methodNode("media.ts", "abre");
    const usuarios = [methodNode("otro/x.ts", "usa"), methodNode("otro/y.ts", "usa")];
    const h = hypothesis.build(
      ad4Finding(),
      ad4Graph(
        [media, ...usuarios],
        [
          callsEdge(media.id, `sym:${AD4_PIEZAS[0]}#open`),
          callsEdge(media.id, `sym:${AD4_PIEZAS[1]}#open`),
          callsEdge(media.id, `sym:${AD4_PIEZAS[2]}#open`),
          ...usuarios.map((u) => callsEdge(u.id, media.id)),
        ],
      ),
      fakeCtx(fakeRepo()),
    );
    expect(h!.state).toBe("parcial");
  });

  it("OLA AD — un archivo ajeno que alcanza sólo la MITAD de las piezas no es media puerta ⇒ sigue `ausente`", () => {
    const media = methodNode("media.ts", "abre");
    const usuarios = [methodNode("otro/x.ts", "usa"), methodNode("otro/y.ts", "usa")];
    const h = hypothesis.build(
      ad4Finding(),
      ad4Graph(
        [media, ...usuarios],
        [callsEdge(media.id, `sym:${AD4_PIEZAS[0]}#open`), callsEdge(media.id, `sym:${AD4_PIEZAS[1]}#open`), ...usuarios.map((u) => callsEdge(u.id, media.id))],
      ),
      fakeCtx(fakeRepo()),
    );
    expect(h!.state).toBe("ausente");
  });

  it("OLA AD — la puerta existe ENTERA y uno de los que repiten la invoca ⇒ `aplicado-eludido`", () => {
    const puerta = methodNode("puerta.ts", "abre");
    const h = hypothesis.build(
      ad4Finding(),
      ad4Graph(
        [puerta],
        [...AD4_PIEZAS.map((p) => callsEdge(puerta.id, `sym:${p}#open`)), callsEdge(`sym:${AD4_CLIENTES[0]}#hace`, puerta.id)],
      ),
      fakeCtx(fakeRepo()),
    );
    expect(h!.state).toBe("aplicado-eludido");
    expect(h!.confidence).toBeNull();
  });

  it("OLA AD — el `required` NO aprueba por no poder mirar: si un archivo que el ancla marcó NO invoca todas las piezas, devuelve null", () => {
    // El grafo sólo tiene a `cli/uno.ts` invocando; el Finding afirma tres.
    const nodes = [...AD4_PIEZAS.map((p) => methodNode(p, "open")), methodNode("cli/uno.ts", "hace")];
    const graph: CodeGraph = {
      nodes,
      edges: AD4_PIEZAS.map((p) => callsEdge("sym:cli/uno.ts#hace", `sym:${p}#open`)),
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    expect(hypothesis.build(ad4Finding(), graph, fakeCtx(fakeRepo()))).toBeNull();
  });

  it("OLA AD — un `Finding` del ancla nueva sin las ubicaciones con rol NO construye nada (nunca adivina)", () => {
    const sinRoles = fakeFinding("cli/uno.ts", { id: "x", detectorId: "repeated-collaborator-set", kind: "repeated-collaborator-set" });
    expect(hypothesis.build(sinRoles, ad4Graph(), fakeCtx(fakeRepo()))).toBeNull();
  });

  it("OLA AD — el camino viejo NO cambia: el mismo grafo de jekyll sigue dando `ausente` por `fanout-without-cohesion`", () => {
    const h = hypothesis.build(fakeFinding("site.rb"), jekyllAusenteGraph(), fakeCtx(fakeRepo()));
    expect(h!.state).toBe("ausente");
  });

  it("OLA W — un `Finding` de kind `god-component` construye la MISMA hipótesis que uno de `fanout-without-cohesion` sobre el mismo archivo: `build()` sólo lee `problem.locations[0].file`, nunca el kind del ancla", () => {
    const godComponentFinding = fakeFinding("site.rb", { detectorId: "god-component", kind: "god-component" });
    const h = hypothesis.build(godComponentFinding, jekyllAusenteGraph(), fakeCtx(fakeRepo()));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.anchorFindingId).toBe(godComponentFinding.id);
  });

  it("sin grafo ⇒ no-aplicable (missingCapabilities no vacío), NUNCA ausente silencioso", () => {
    const finding = fakeFinding("site.rb");
    const h = hypothesis.build(finding, null, fakeCtx(fakeRepo()));
    expect(h).not.toBeNull();
    expect(h!.missingCapabilities.length).toBeGreaterThan(0);
    expect(h!.confidence).toBeNull();
  });

  it("required no cumplido (fan-out < umbral) ⇒ null, ni siquiera candidata", () => {
    const finding = fakeFinding("util.rb");
    const h = hypothesis.build(finding, belowThresholdGraph(), fakeCtx(fakeRepo()));
    expect(h).toBeNull();
  });

  it("ausente: hub con fan-out/fan-in que cumplen, sin fuga ⇒ oportunidad clásica, confidence definida", () => {
    const finding = fakeFinding("site.rb");
    const h = hypothesis.build(finding, jekyllAusenteGraph(), fakeCtx(fakeRepo()));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).not.toBeNull();
    expect(h!.missingCapabilities).toEqual([]);
    expect(h!.anchorFindingId).toBe(finding.id);
  });

  it("ceiling ES UN TECHO: escalera perfecta (2/2 discriminadores de siempre) NUNCA supera 'media'", () => {
    const finding = fakeFinding("site.rb");
    const h = hypothesis.build(finding, jekyllAusenteGraph(), fakeCtx(fakeRepo()))!;
    // site.rb: agrupamiento bajo (colaboradores no se conocen entre sí) Y es
    // el fan-out máximo del repo ⇒ los DOS discriminadores de siempre
    // confirman. El tercero (Ola 11a, ctx.neighborhood.ego) NO confirma acá
    // porque `fakeCtx` usa EMPTY_NEIGHBORHOOD (ego() siempre null,
    // "no evaluado") — declarado, no un fallo: ver el describe dedicado más
    // abajo para el caso con un Neighborhood real.
    const preExisting = h.discriminators.filter((d) => !d.label.includes("ego"));
    expect(preExisting.every((d) => d.passed)).toBe(true);
    const egoCheck = h.discriminators.find((d) => d.label.includes("ego"));
    expect(egoCheck?.passed).toBe(false);
    expect(h.confidence).toBe("media");
    expect(h.ceiling).toBe("media");
  });

  it("0/2 discriminadores confirmados (vecinos cohesivos entre sí + no es el fan-out máximo) ⇒ confidence 'baja'", () => {
    const finding = fakeFinding("hub.rb");
    const h = hypothesis.build(finding, cohesiveClusterGraph(), fakeCtx(fakeRepo()))!;
    expect(h.state).toBe("ausente");
    expect(h.discriminators.every((d) => !d.passed)).toBe(true);
    expect(h.confidence).toBe("baja");
  });

  it("aplicado-eludido: existe fuga (cliente que puentea la fachada) ⇒ confidence null, estado de alerta", () => {
    const finding = fakeFinding("site.rb");
    const h = hypothesis.build(finding, jekyllAplicadoEludidoGraph(), fakeCtx(fakeRepo()))!;
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull();
    const bypassCheck = h.checks.find((c) => c.role === "applied")!;
    expect(bypassCheck.passed).toBe(true);
    expect(bypassCheck.why).toContain("cli_build.rb");
    expect(bypassCheck.why).toContain("converters.rb");
  });

  it("aplicado-eludido: `places` lista al cliente que puentea y al colaborador alcanzado, con los roles exactos", () => {
    const finding = fakeFinding("site.rb");
    const repo = fakeRepo([
      { path: "site.rb", lines: 200, language: "ruby" },
      { path: "cli_build.rb", lines: 50, language: "ruby" },
      { path: "converters.rb", lines: 80, language: "ruby" },
    ]);
    const h = hypothesis.build(finding, jekyllAplicadoEludidoGraph(), fakeCtx(repo))!;
    const client = h.places.find((p) => p.file === "cli_build.rb");
    const internal = h.places.find((p) => p.file === "converters.rb");
    expect(client?.role).toBe("cliente que puentea la fachada");
    expect(internal?.role).toBe("colaborador interno alcanzado directamente, sin pasar por la fachada");
    expect(h.places[0]!.file).toBe("site.rb");
  });

  it("P4: colaborador puenteado que es una utilidad ampliamente compartida (fan-in propio >= fan-in del candidato) NO cuenta como fuga real ⇒ ausente, no aplicado-eludido", () => {
    const finding = fakeFinding("site.rb");
    const h = hypothesis.build(finding, jekyllWidelySharedUtilGraph(), fakeCtx(fakeRepo()))!;
    expect(h.state).toBe("ausente");
    const bypassCheck = h.checks.find((c) => c.role === "applied")!;
    expect(bypassCheck.passed).toBe(false);
  });

  it("no compite en ranking en ausente-eludido/ya-aplicado: `confidence: null` incluso si el finding tiene severity alta", () => {
    const finding = fakeFinding("site.rb", { severity: 95 });
    const h = hypothesis.build(finding, jekyllAplicadoEludidoGraph(), fakeCtx(fakeRepo()))!;
    expect(h.confidence).toBeNull();
  });

  it("agnóstico de lenguaje: needs=[] ⇒ el resultado no depende de `ctx.capabilities` ni del `language` del Finding", () => {
    const finding = fakeFinding("site.rb", { language: "go" });
    const withNoCaps = hypothesis.build(finding, jekyllAusenteGraph(), fakeCtx(fakeRepo(), new Set()))!;
    const withSomeCaps = hypothesis.build(finding, jekyllAusenteGraph(), fakeCtx(fakeRepo(), new Set(["unidad-tipo-clase"])))!;
    expect(withNoCaps.state).toBe(withSomeCaps.state);
    expect(withNoCaps.confidence).toBe(withSomeCaps.confidence);
    expect(withNoCaps.missingCapabilities).toEqual([]);
  });

  it("archivo sin ninguna arista en el grafo ⇒ null (no candidata, fan-out cero)", () => {
    const graph = makeGraph(["isolated.rb", "other.rb"], []);
    const finding = fakeFinding("isolated.rb");
    const h = hypothesis.build(finding, graph, fakeCtx(fakeRepo()));
    expect(h).toBeNull();
  });

  // ── Ola 10 (CONTRATO-F10.md) — las tres formas nuevas ──────────────────

  it("ya-aplicado: sin fuga + delegación real (`calls` símbolo→símbolo) + sin exceso de estado propio ⇒ COMPLETA, confidence null, nunca sugiere", () => {
    const finding = fakeFinding("site.rb");
    const h = hypothesis.build(finding, jekyllYaAplicadoGraph(), fakeCtx(fakeRepo()))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const applied = h.checks.filter((c) => c.role === "applied");
    expect(applied).toHaveLength(3);
    const [bypassCheck, delegatesCheck, ownStateCheck] = applied;
    expect(bypassCheck!.passed).toBe(false);
    expect(delegatesCheck!.passed).toBe(true);
    expect(ownStateCheck!.passed).toBe(true);
  });

  it("delega de verdad PERO excede el presupuesto de estado propio (7 'other' > 6 colaboradores) ⇒ NO asciende a ya-aplicado, se queda ausente", () => {
    const finding = fakeFinding("site.rb");
    const h = hypothesis.build(finding, jekyllDelegatesButOwnStateExceedsGraph(), fakeCtx(fakeRepo()))!;
    expect(h.state).toBe("ausente");
    expect(h.confidence).not.toBeNull();
    const applied = h.checks.filter((c) => c.role === "applied");
    const [, delegatesCheck, ownStateCheck] = applied;
    expect(delegatesCheck!.passed).toBe(true);
    expect(ownStateCheck!.passed).toBe(false);
    expect(ownStateCheck!.why).toContain("7");
  });

  /**
   * OLA AY (frente AY4) — LOS DOS TESTS DE LA MÁQUINA DE ESTADOS DEL `parcial` SIGUEN
   * ENTEROS, con las MISMAS aserciones; lo único que cambia es el sujeto: pasan de
   * `hypothesis.build` a `__internals.evaluarCaminoDeArchivo`, que es exactamente el mismo
   * cálculo SIN la compuerta G1. Ni una aserción se aflojó ni se borró: G1 apaga la
   * PUBLICACIÓN de este estado, no su cálculo, y eso es lo que estos dos tests cubren.
   * Que la compuerta de verdad apaga está en el test que sigue a los dos.
   */
  it("parcial: dos archivos con fan-out >= umbral hacia colaboradores solapados, ninguno cubriendo al otro entero ⇒ estado 'parcial' (la máquina lo calcula; G1 decide aparte si se publica)", () => {
    const finding = fakeFinding("hubA.rb");
    const h = __internals.evaluarCaminoDeArchivo(finding, partialFacadesGraph(), fakeCtx(fakeRepo()))!;
    expect(h.state).toBe("parcial");
    expect(h.confidence).not.toBeNull();
    const applied = h.checks.filter((c) => c.role === "applied");
    const partialCheck = applied[applied.length - 1]!;
    expect(partialCheck.passed).toBe(true);
    expect(partialCheck.why).toContain("hubB.rb");
  });

  it("parcial: `places` incluye al archivo hermano con su rol de fachada parcial solapada", () => {
    const finding = fakeFinding("hubA.rb");
    const repo = fakeRepo([
      { path: "hubA.rb", lines: 40, language: "ruby" },
      { path: "hubB.rb", lines: 40, language: "ruby" },
    ]);
    const h = __internals.evaluarCaminoDeArchivo(finding, partialFacadesGraph(), fakeCtx(repo))!;
    const sibling = h.places.find((p) => p.file === "hubB.rb");
    expect(sibling?.role).toContain("otra fachada parcial");
  });

  /**
   * OLA AY (frente AY4) — G1, EL CONTRATO NUEVO. El camino de ARCHIVO no publica el estado
   * `parcial`. La razón, con el censo entero, está en el comentario de `build()`: las dos
   * celdas que ese estado produce (`fanout-without-cohesion` y `god-component`) suman 37
   * propuestas, las 37 JUZGADAS, **0 verdaderas** y 36 falsas.
   *
   * Este test es la contracara del de arriba y por eso van juntos: uno prueba que el cálculo
   * sigue vivo, el otro que no se publica. Un frente futuro que quiera reactivarlo tiene que
   * borrar ESTE test a propósito, no por accidente.
   */
  it("G1 (Ola AY): el camino de ARCHIVO NO emite en estado `parcial` — `build` devuelve null aunque la máquina calcule `parcial`, y la traza queda con state=parcial y emitted=false", () => {
    const finding = fakeFinding("hubA.rb");
    expect(__internals.evaluarCaminoDeArchivo(finding, partialFacadesGraph(), fakeCtx(fakeRepo()))!.state).toBe("parcial");

    startFacadeTrace();
    expect(hypothesis.build(finding, partialFacadesGraph(), fakeCtx(fakeRepo()))).toBeNull();
    const traza = takeFacadeTrace();
    const entrada = traza.find((t) => t.findingId === finding.id && t.camino === "archivo");
    expect(entrada).toBeDefined();
    expect(entrada!.state).toBe("parcial");
    expect(entrada!.emitted).toBe(false);
  });

  it("G1 (Ola AY) NO toca los otros estados del camino de archivo: `ya-aplicado` se sigue publicando", () => {
    const finding = fakeFinding("site.rb");
    const h = hypothesis.build(finding, jekyllYaAplicadoGraph(), fakeCtx(fakeRepo()));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
  });

  it("ya-aplicado sobre la MISMA forma que la fixture canónica `fixtures-multi/facade/*` (OrderFacade, 4 colaboradores por constructor, delegación real) — ver docstring de `orderFacadeGraph`", () => {
    const finding = fakeFinding("order-facade.ts");
    const h = hypothesis.build(finding, orderFacadeGraph(), fakeCtx(fakeRepo()))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull(); // información positiva, nunca una sugerencia (regla 1 de la tarea)
  });

  it("ya-aplicado nunca compite en el ranking incluso con severity alta (mismo criterio que aplicado-eludido)", () => {
    const finding = fakeFinding("site.rb", { severity: 95 });
    const h = hypothesis.build(finding, jekyllYaAplicadoGraph(), fakeCtx(fakeRepo()))!;
    expect(h.confidence).toBeNull();
  });

  /* ────────────────────────────────────────────────────────────────────────
   * Ola 11a — consumo REAL de `ctx.neighborhood.ego(1)` (registro de
   * pendientes: "1 de 17 hipótesis lee ctx.neighborhood"). `fanout-without-
   * cohesion` es inter-file, así que `attachHypotheses` (hypotheses/run.ts,
   * llamada (2)) ya pasa `ctx.neighborhood` real — sin necesitar `refresh()`.
   * `buildNeighborhoodIndex`/`neighborhoodFor` REALES, mismo estilo END TO
   * END que `strategy.test.ts`.
   * ──────────────────────────────────────────────────────────────────────── */
  function ctxWithRealNeighborhood(graph: CodeGraph, finding: Finding, repo: RepoUnit = fakeRepo()): HypothesisContext {
    const index = buildNeighborhoodIndex(graph, [finding], null);
    return { ...fakeCtx(repo), neighborhood: neighborhoodFor(index, finding) };
  }

  /**
   * OLA V (frente V5) — `invoca-en-vez-de-solo-nombrar`, el `required` de
   * intención nuevo. Los dos casos de regresión son los dos
   * `problema-si-patrón-no` de Facade de la Ola U, reducidos a su forma de
   * grafo, más el CONTRA-caso que descartó la versión ingenua del chequeo.
   */
  describe("Ola V — un manifiesto de imports no es una fachada a medio hacer", () => {
    /** `rubocop/lib/rubocop.rb`: 106 colaboradores, 0 símbolos `function-like`, CERO aristas `calls`. */
    function manifestGraph(): CodeGraph {
      const base = jekyllAusenteGraph();
      return { ...base, nodes: base.nodes.filter((n) => n.kind !== "symbol"), edges: base.edges.filter((e) => e.kind !== "calls") };
    }

    /**
     * `guava/.../AbstractCollectionTestSuiteBuilder.java`: SÍ declara un
     * miembro (`getTesters`), pero su cuerpo devuelve literales `.class` —
     * cero llamadas. Un símbolo propio no alcanza: lo que se exige es que
     * INVOQUE.
     */
    function symbolButNoCallsGraph(): CodeGraph {
      const base = manifestGraph();
      return { ...base, nodes: [...base.nodes, methodNode("site.rb", "Builder.getTesters")] };
    }

    /**
     * `newtonsoft-json/.../JsonSerializerInternalReader.cs`: 184 `calls` a
     * otros archivos, TODAS `provenance: "ambiguous"` (medido con
     * `scripts/v5-delegacion-cruda.mts`). `hasDelegatingCalls` da `false`
     * por HUECO DE RESOLUCIÓN, no porque el archivo no trabaje — este
     * `required` NO lo puede gatear.
     */
    function ambiguousCallsGraph(): CodeGraph {
      const base = manifestGraph();
      const caller = methodNode("site.rb", "Reader.deserialize");
      const callee = methodNode("converters.rb", "Converters.convert");
      const ambiguous: CodeGraphEdge = { from: caller.id, to: callee.id, kind: "calls", provenance: "ambiguous", weight: 1 };
      return { ...base, nodes: [...base.nodes, caller, callee], edges: [...base.edges, ambiguous] };
    }

    it("cero llamadas salientes (manifiesto de require/import) ⇒ null, ni siquiera candidata — antes emitía `parcial`", () => {
      const finding = fakeFinding("site.rb");
      expect(hypothesis.build(finding, manifestGraph(), fakeCtx(fakeRepo()))).toBeNull();
    });

    it("declara un miembro pero su cuerpo no invoca nada (lista de literales) ⇒ null: un símbolo propio no es trabajo", () => {
      const finding = fakeFinding("site.rb");
      expect(hypothesis.build(finding, symbolButNoCallsGraph(), fakeCtx(fakeRepo()))).toBeNull();
    });

    it("llama, pero el grafo no resolvió el destino (aristas `calls` AMBIGUAS) ⇒ sigue siendo candidata: el hueco es del resolutor, no del código", () => {
      const finding = fakeFinding("site.rb");
      const h = hypothesis.build(finding, ambiguousCallsGraph(), fakeCtx(fakeRepo()));
      expect(h).not.toBeNull();
      const check = h!.checks.find((c) => c.label.includes("al menos UNA llamada propia"));
      expect(check?.passed).toBe(true);
    });
  });

  describe("Ola 11a — ctx.neighborhood.ego(ancla, 1): respalda/desmiente el hub desde el grafo crudo", () => {
    it("aplicado-eludido: ego(1) real también confirma el hub (degreeIn+degreeOut >= umbral) ⇒ el `why` lo declara como RESPALDO", () => {
      const finding = fakeFinding("site.rb");
      const graph = jekyllAplicadoEludidoGraph();
      const h = hypothesis.build(finding, graph, ctxWithRealNeighborhood(graph, finding))!;
      expect(h.state).toBe("aplicado-eludido");
      const bypassCheck = h.checks.find((c) => c.role === "applied")!;
      expect(bypassCheck.why).toContain("RESPALDA");
      expect(bypassCheck.why).toContain("degreeIn");
    });

    it("discriminador ego-confirma-hub: con vecindario real y grado suficiente ⇒ confirma (peldaño extra, sin superar el techo 'media')", () => {
      const finding = fakeFinding("site.rb");
      const graph = jekyllAusenteGraph();
      const h = hypothesis.build(finding, graph, ctxWithRealNeighborhood(graph, finding))!;
      expect(h.state).toBe("ausente");
      const egoCheck = h.discriminators.find((d) => d.label.includes("ego"));
      expect(egoCheck?.passed).toBe(true);
      expect(egoCheck?.why).toMatch(/degreeIn=\d+, degreeOut=\d+/);
      expect(h.confidence).toBe("media"); // el techo sigue capando, aunque suban más peldaños de la escalera.
    });

    it("sin nodo de grafo para el archivo en el índice del vecindario (mismatch defensivo) ⇒ 'no evaluado', nunca lanza", () => {
      const finding = fakeFinding("site.rb");
      const graph = jekyllAusenteGraph();
      // Índice de vecindario construido SIN grafo (`null`): ego() no tiene con qué resolver el nodo, aunque `build()` sí reciba el grafo real por el segundo parámetro.
      const emptyIndex = buildNeighborhoodIndex(null, [finding], null);
      const ctx: HypothesisContext = { ...fakeCtx(fakeRepo()), neighborhood: neighborhoodFor(emptyIndex, finding) };
      const h = hypothesis.build(finding, graph, ctx)!;
      const egoCheck = h.discriminators.find((d) => d.label.includes("ego"));
      expect(egoCheck?.passed).toBe(false);
      expect(egoCheck?.why).toContain("no evaluado");
    });
  });

  /* ── OLA AN (frente AN3) — LA TRAZA DEL EMBUDO ───────────────────────────
   * El camino de entrada por las anclas de la capa de refactorización se midió
   * y se RETIRÓ (ver "OLA AN" en el docstring del módulo: 688 propuestas, 0 de
   * 63 verdaderas). Lo que queda en producción es la traza, y estos dos tests
   * son los que garantizan que sigue siendo lo que dice ser.
   * ─────────────────────────────────────────────────────────────────────── */
  describe("OLA AN — la traza del embudo", () => {
    it("registra el camino, el estado y si el vecindario llegó VIVO — la prueba de mecanismo que el frente publica", () => {
      const finding = fakeFinding("site.rb");
      const graph = jekyllAusenteGraph();
      const index = buildNeighborhoodIndex(graph, [finding], null);
      const ctx: HypothesisContext = { ...fakeCtx(fakeRepo()), neighborhood: neighborhoodFor(index, finding) };
      startFacadeTrace();
      hypothesis.build(finding, graph, ctx);
      const t = takeFacadeTrace();
      expect(t).toHaveLength(1);
      expect(t[0]!.camino).toBe("archivo");
      expect(t[0]!.vecindarioVivo).toBe(true);
      expect(t[0]!.emitted).toBe(true);
      expect(t[0]!.state).toBe("ausente");
      expect(t[0]!.colaboradores).toBe(6);
    });

    it("con `EMPTY_NEIGHBORHOOD` la traza lo DICE — es lo que separa «el canal no sirve» de «el canal no llegó»", () => {
      const finding = fakeFinding("site.rb");
      startFacadeTrace();
      hypothesis.build(finding, jekyllAusenteGraph(), fakeCtx(fakeRepo()));
      const t = takeFacadeTrace();
      expect(t[0]!.vecindarioVivo).toBe(false);
      expect(t[0]!.nivel2Total).toBe(0);
    });

    it("apagada no registra nada: costo cero en producción", () => {
      hypothesis.build(fakeFinding("site.rb"), jekyllAusenteGraph(), fakeCtx(fakeRepo()));
      expect(takeFacadeTrace()).toHaveLength(0);
    });
  });
});
