import { describe, expect, it } from "vitest";

import { buildImportDepthDemeterFindings, detector } from "./import-depth-demeter.js";
import { runDetectorSet } from "../run.js";
import { testContext } from "../testing.js";
import type { DerivedNodeSets } from "../../code-grammar.js";
import type { RepoUnit } from "../types.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`, `needs: []` (BUG ARREGLADO — ver el
 * docstring del módulo: era `["imports"]`, un gate por capacidad que Ruby
 * nunca satisface pero que el extractor real ya no necesita, y que
 * silenciaba 22 hallazgos reales en rubocop sin mirar el grafo): no hace
 * falta tree-sitter para probar `buildImportDepthDemeterFindings` — el
 * detector sólo lee `RepoUnit.graph` (nodos+aristas planas,
 * `CodeGraphNode.file` ya trae la ruta de carpeta completa) y
 * `RepoUnit.files` (líneas por archivo, y desde la Ola O también qué
 * carpetas contienen archivos), mismo patrón que `orphan-file.test.ts`/
 * `layer-skip.test.ts`. El test del gate (`needsEdges: ["imports"]`, el
 * único que queda) SÍ necesita el runner real (`run.ts#runDetectorSet`),
 * porque la decisión `sin-aristas` vive en `run.ts#runInterFile`, no acá.
 *
 * "≥3 lenguajes que emiten" no aplica: el detector no clasifica por
 * lenguaje en ningún punto de `buildImportDepthDemeterFindings` (ni para
 * severidad, a diferencia de `orphan-file`/`unused-symbol` — ver "PROVENANCE"
 * en el docstring del módulo: una arista `imports` nunca es `inferred`, así
 * que no hay brecha de Java que compensar acá). La única superficie
 * sensible al lenguaje es el gate `needsEdges: ["imports"]`, cubierto por
 * los tests de Ruby de más abajo.
 *
 * OLA O, N3 — POR QUÉ LAS FIXTURES GANARON UN ARCHIVO "DE CAPA": el
 * detector ya no cuenta segmentos de RUTA sino CAPAS REALES (carpetas que
 * contienen directamente algún archivo analizado, ver
 * `detect/primitivas/n3-capas-reales.ts`). Una fixture con dos archivos y
 * carpetas vacías entre medio describía un NAMESPACE, no un módulo con
 * capas. Los tests nuevos de abajo cubren el caso contrario.
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function symbolNode(file: string, symbolPath: readonly string[]): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "function-like" };
}

function importEdge(from: string, to: string, provenance: Provenance = "declared"): CodeGraphEdge {
  return { from, to, kind: "imports", provenance, weight: 1 };
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return {
    nodes,
    edges,
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

function fileSummary(path: string, language = "javascript", lines = 10) {
  return { path, lines, language };
}

function repoWith(files: readonly ReturnType<typeof fileSummary>[], graph: CodeGraph | null): RepoUnit {
  return { repoName: "test", files, functions: [], clones: [], graph };
}

/** Los dos umbrales de una vez — `minSkippedLevels` (magnitud) y `minRealLayers` (existencia del fenómeno). */
function run(files: readonly ReturnType<typeof fileSummary>[], graph: CodeGraph) {
  const ctx = testContext(detector, "*");
  return buildImportDepthDemeterFindings(files, graph, ctx.threshold("minSkippedLevels"), ctx.threshold("minRealLayers"));
}

/** La superficie del módulo intermedio: sin ella `app/payments` no tendría archivos propios y no sería una capa. */
const PAYMENTS_SURFACE = fileSummary("app/payments/index.js");

const EMPTY_SETS: DerivedNodeSets = {
  functionNodes: new Set(),
  branchNodes: new Set(),
  chainNodes: new Set(),
  cloneNodes: new Set(),
  classNodes: new Set(),
  nestingNodes: new Set(),
  constructorNodes: new Set(),
  exceptionNodes: new Set(),
  switchContainers: new Set(),
} as unknown as DerivedNodeSets;

describe("import-depth-demeter", () => {
  it("javascript: un import que resuelve 2 niveles más adentro del punto de divergencia, atravesando una capa REAL, es un hallazgo", () => {
    const files = [fileSummary("app/checkout/cart.js"), PAYMENTS_SURFACE, fileSummary("app/payments/internal/gateway/client.js")];
    const graph = graphOf(
      [fileNode("app/checkout/cart.js"), fileNode("app/payments/internal/gateway/client.js")],
      [importEdge(fileNodeId("app/checkout/cart.js"), fileNodeId("app/payments/internal/gateway/client.js"))],
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2); // niveles de RUTA
    expect(findings[0]!.trigger[1]!.value).toBe(1); // capas REALES
    expect(findings[0]!.locations[0]!.file).toBe("app/checkout/cart.js");
    expect(findings[0]!.locations[0]!.role).toBe("archivo que importa por debajo de la superficie del módulo importado");
    expect(findings[0]!.locations[1]!.role).toBe("archivo interno de otro módulo, importado directamente");
    expect(findings[0]!.severity).toBeLessThanOrEqual(70); // MAX_SEVERITY — ver docstring del módulo
  });

  it("OLA O — LA RAÍZ: la geometría REAL de guava (paquete Java: carpetas intermedias SIN un solo archivo) ya no dispara — es namespace, no capas", () => {
    // Caminos reales de tests/golden/precision/guava.verdicts.csv (9 de 9 juzgados FALSOS,
    // nota: "en Java la profundidad de carpeta ES el paquete, no una capa").
    const caller = "android/guava-testlib/src/com/google/common/collect/testing/AbstractTester.java";
    const target = "android/guava/src/com/google/common/annotations/GwtCompatible.java";
    const files = [fileSummary(caller, "java"), fileSummary(target, "java")];
    const graph = graphOf([fileNode(caller), fileNode(target)], [importEdge(fileNodeId(caller), fileNodeId(target))]);
    expect(run(files, graph)).toHaveLength(0);
  });

  it("OLA O — control positivo del MISMO lenguaje: un layout Java CON capas reales sigue disparando: el mecanismo no apaga java", () => {
    const caller = "src/main/java/com/acme/web/OrderController.java";
    const target = "src/main/java/com/acme/store/jdbc/internal/OrderDao.java";
    const files = [
      fileSummary(caller, "java"),
      fileSummary("src/main/java/com/acme/store/OrderStore.java", "java"),
      fileSummary("src/main/java/com/acme/store/jdbc/JdbcOrderStore.java", "java"),
      fileSummary(target, "java"),
    ];
    const graph = graphOf([fileNode(caller), fileNode(target)], [importEdge(fileNodeId(caller), fileNodeId(target))]);
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[1]!.value).toBe(2);
  });

  it("OLA O — LA UNIDAD ES (ARCHIVO, MÓDULO): un archivo que importa VARIOS internos del mismo módulo es UN hallazgo con la cuenta en la evidencia (caso medido: lib/rubocop.rb importa 22 internos de lib/rubocop = 506 de volumen de censo)", () => {
    const caller = "lib/rubocop.rb";
    const targets = [
      "lib/rubocop/cli/command/auto_generate_config.rb",
      "lib/rubocop/cli/command/base.rb",
      "lib/rubocop/cop/variable_force/scope.rb",
      "lib/rubocop/cop/generator/require_file_injector.rb",
    ];
    const files = [
      fileSummary(caller, "ruby"),
      fileSummary("lib/rubocop/version.rb", "ruby"),
      fileSummary("lib/rubocop/cli.rb", "ruby"),
      ...targets.map((t) => fileSummary(t, "ruby")),
    ];
    const graph = graphOf(
      [fileNode(caller), ...targets.map((t) => fileNode(t))],
      targets.map((t) => importEdge(fileNodeId(caller), fileNodeId(t))),
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    const evidencia = Object.fromEntries((findings[0]!.evidence ?? []).map((e) => [e.label, e.value]));
    expect(evidencia["archivos internos del módulo importados directamente"]).toBe(4);
    expect(evidencia["aristas 'imports' colapsadas hacia este módulo"]).toBe(4);
    // 1 importador + hasta 3 destinos de ejemplo: el resto va como CUENTA, no como locations.
    expect(findings[0]!.locations).toHaveLength(4);
  });

  it("OLA O — un mismo archivo que importa el interior de DOS módulos distintos sigue siendo DOS hallazgos (no se colapsa de más)", () => {
    const caller = "app/main.js";
    const files = [
      fileSummary(caller),
      PAYMENTS_SURFACE,
      fileSummary("app/payments/internal/gateway/client.js"),
      fileSummary("app/billing/index.js"),
      fileSummary("app/billing/internal/ledger/entry.js"),
    ];
    const graph = graphOf(
      [fileNode(caller), fileNode("app/payments/internal/gateway/client.js"), fileNode("app/billing/internal/ledger/entry.js")],
      [
        importEdge(fileNodeId(caller), fileNodeId("app/payments/internal/gateway/client.js")),
        importEdge(fileNodeId(caller), fileNodeId("app/billing/internal/ledger/entry.js")),
      ],
    );
    expect(run(files, graph)).toHaveLength(2);
  });

  it("provenance 'ambiguous' NO cuenta como evidencia (CONTRATO-F9.md §4.5, fuera de toda consulta por defecto)", () => {
    const files = [fileSummary("app/checkout/cart.js"), PAYMENTS_SURFACE, fileSummary("app/payments/internal/gateway/client.js")];
    const graph = graphOf(
      [fileNode("app/checkout/cart.js"), fileNode("app/payments/internal/gateway/client.js")],
      [importEdge(fileNodeId("app/checkout/cart.js"), fileNodeId("app/payments/internal/gateway/client.js"), "ambiguous")],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("control negativo: importar el archivo de nivel superior del otro módulo (su superficie) no dispara nada", () => {
    const files = [fileSummary("app/checkout/cart.js"), fileSummary("app/payments/client.js")];
    const graph = graphOf(
      [fileNode("app/checkout/cart.js"), fileNode("app/payments/client.js")],
      [importEdge(fileNodeId("app/checkout/cart.js"), fileNodeId("app/payments/client.js"))],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("borde del umbral: justo en minSkippedLevels dispara, uno menos no", () => {
    const ctx = testContext(detector, "*");
    const n = ctx.threshold("minSkippedLevels").value;

    // fromFolder = ["a","b"] (profundidad 2, ancestro común completo).
    // skippedLevels = toFolder.length - commonLen(2) - 1, así que toFolder
    // necesita (n + 1) segmentos EXTRA sobre "a/b" para que skippedLevels === n.
    const deepFolder = Array.from({ length: n + 1 }, (_, i) => `lvl${i}`).join("/");
    const files = [fileSummary("a/b/from.js"), fileSummary("a/b/lvl0/surface.js"), fileSummary(`a/b/${deepFolder}/deep.js`)];
    const graph = graphOf(
      [fileNode("a/b/from.js"), fileNode(`a/b/${deepFolder}/deep.js`)],
      [importEdge(fileNodeId("a/b/from.js"), fileNodeId(`a/b/${deepFolder}/deep.js`))],
    );
    const atThreshold = run(files, graph);
    expect(atThreshold).toHaveLength(1);
    expect(atThreshold[0]!.trigger[0]!.value).toBe(n);

    // Un segmento EXTRA menos => skippedLevels === n - 1, por debajo del umbral.
    const shallowerFolder = Array.from({ length: n }, (_, i) => `lvl${i}`).join("/");
    const filesBelow = [fileSummary("a/b/from.js"), fileSummary("a/b/lvl0/surface.js"), fileSummary(`a/b/${shallowerFolder}/deep.js`)];
    const graphBelow = graphOf(
      [fileNode("a/b/from.js"), fileNode(`a/b/${shallowerFolder}/deep.js`)],
      [importEdge(fileNodeId("a/b/from.js"), fileNodeId(`a/b/${shallowerFolder}/deep.js`))],
    );
    expect(run(filesBelow, graphBelow)).toHaveLength(0);
  });

  it("borde del piso de capas reales: la misma profundidad de ruta sin NINGUNA carpeta intermedia poblada no dispara", () => {
    const files = [fileSummary("app/checkout/cart.js"), fileSummary("app/payments/internal/gateway/client.js")];
    const graph = graphOf(
      [fileNode("app/checkout/cart.js"), fileNode("app/payments/internal/gateway/client.js")],
      [importEdge(fileNodeId("app/checkout/cart.js"), fileNodeId("app/payments/internal/gateway/client.js"))],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it('patrón fachada/barril ("mismo árbol hacia abajo") reduce la severidad frente a una rama cruzada equivalente', () => {
    // Fachada: el importador vive EXACTAMENTE en el punto de divergencia (pkg/index.js -> pkg/internal/deep/nested/x.js).
    // 4 segmentos de carpeta bajo "pkg/" => con commonLen=1 (fromFolder=["pkg"]), skippedLevels = 4-1-1 = 2 (umbral por defecto).
    const facadeFiles = [
      fileSummary("pkg/index.js"),
      fileSummary("pkg/internal/registry.js"),
      fileSummary("pkg/internal/deep/nested/x.js"),
    ];
    const facadeGraph = graphOf(
      [fileNode("pkg/index.js"), fileNode("pkg/internal/deep/nested/x.js")],
      [importEdge(fileNodeId("pkg/index.js"), fileNodeId("pkg/internal/deep/nested/x.js"))],
    );
    const facadeFindings = run(facadeFiles, facadeGraph);

    // Rama cruzada: el importador vive en una rama hermana sin relación de contención con el módulo importado.
    const crossFiles = [
      fileSummary("app/checkout/cart.js"),
      fileSummary("pkg/index.js"),
      fileSummary("pkg/internal/registry.js"),
      fileSummary("pkg/internal/deep/nested/x.js"),
    ];
    const crossGraph = graphOf(
      [fileNode("app/checkout/cart.js"), fileNode("pkg/internal/deep/nested/x.js")],
      [importEdge(fileNodeId("app/checkout/cart.js"), fileNodeId("pkg/internal/deep/nested/x.js"))],
    );
    const crossFindings = run(crossFiles, crossGraph);

    expect(facadeFindings).toHaveLength(1);
    expect(crossFindings).toHaveLength(1);
    expect(facadeFindings[0]!.severity).toBeLessThan(crossFindings[0]!.severity);
  });

  it("dos imports profundos entre el mismo par de archivos colapsan en UN solo hallazgo", () => {
    const files = [fileSummary("app/a.js"), fileSummary("pkg/index.js"), fileSummary("pkg/internal/deep/x.js")];
    const graph = graphOf(
      [
        fileNode("app/a.js"),
        symbolNode("pkg/internal/deep/x.js", ["foo"]),
        symbolNode("pkg/internal/deep/x.js", ["bar"]),
      ],
      [
        importEdge(fileNodeId("app/a.js"), symbolNodeId("pkg/internal/deep/x.js", ["foo"])),
        importEdge(fileNodeId("app/a.js"), symbolNodeId("pkg/internal/deep/x.js", ["bar"])),
      ],
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence?.[0]?.value).toBe(2); // dos aristas colapsadas, ver "evidence"
  });

  it("una arista 'references' que cruza la misma profundidad NO dispara (sólo 'imports' cuenta)", () => {
    const files = [fileSummary("app/checkout/cart.js"), PAYMENTS_SURFACE, fileSummary("app/payments/internal/gateway/client.js")];
    const graph = graphOf(
      [
        symbolNode("app/checkout/cart.js", ["run"]),
        symbolNode("app/payments/internal/gateway/client.js", ["send"]),
      ],
      [
        {
          from: symbolNodeId("app/checkout/cart.js", ["run"]),
          to: symbolNodeId("app/payments/internal/gateway/client.js", ["send"]),
          kind: "references",
          provenance: "declared",
          weight: 1,
        },
      ],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("RAÍZ 3 (Ola N, A2b) — fan-in ancho (archivo importado desde >=3 raíces de carpeta de nivel superior distintas) acota la severidad", () => {
    // Geometría medida de guava que SOBREVIVE al filtro de capas reales de la Ola O:
    // `futures/failureaccess/src` contiene `module-info.java` (archivo real), así que es capa
    // real; y el destino se importa desde varias raíces de nivel superior — el confundidor
    // "micro-artefacto Maven deliberadamente separado", ya juzgado falso en la planilla.
    const target = "futures/failureaccess/src/com/google/common/util/concurrent/internal/InternalFutureFailureAccess.java";
    const surface = "futures/failureaccess/src/module-info.java";
    const underTestCaller = "guava/src/com/google/common/util/concurrent/AbstractFuture.java";
    const otherCallers = [
      "android/guava/src/com/google/common/util/concurrent/Futures.java",
      "guava-gwt/src/com/google/common/util/concurrent/AbstractFutureState.java",
    ];
    const files = [
      fileSummary(underTestCaller, "java"),
      fileSummary(surface, "java"),
      fileSummary(target, "java"),
      ...otherCallers.map((c) => fileSummary(c, "java")),
    ];
    const graph = graphOf(
      [fileNode(underTestCaller), fileNode(target), ...otherCallers.map((c) => fileNode(c))],
      [
        importEdge(fileNodeId(underTestCaller), fileNodeId(target)),
        ...otherCallers.map((c) => importEdge(fileNodeId(c), fileNodeId(target))),
      ],
    );
    const findings = run(files, graph);
    const underTest = findings.find((f) => f.locations[0]!.file === underTestCaller)!;
    expect(underTest).toBeDefined();
    expect(underTest.severity).toBeLessThanOrEqual(30);
    expect(underTest.detail).toContain("raíz(ces) de carpeta de nivel superior distintas");
    expect(underTest.evidence?.at(-1)?.label).toContain("raíces de carpeta de nivel superior distintas");
    expect(underTest.evidence?.at(-1)?.value).toBe(3); // guava, android, guava-gwt
  });

  it("contraejemplo medido (eslint) — TRES importadores reales bajo el MISMO primer segmento de carpeta no activan el descuento de fan-in ancho", () => {
    const target = "lib/languages/js/source-code/index.js";
    const otherCallers = ["lib/api.js", "lib/rule-tester/rule-tester.js"];
    const files = [
      fileSummary("lib/linter/linter.js"),
      fileSummary("lib/languages/js/index.js"),
      fileSummary(target),
      ...otherCallers.map((c) => fileSummary(c)),
    ];
    const graph = graphOf(
      [fileNode("lib/linter/linter.js"), fileNode(target), ...otherCallers.map((c) => fileNode(c))],
      [
        importEdge(fileNodeId("lib/linter/linter.js"), fileNodeId(target)),
        ...otherCallers.map((c) => importEdge(fileNodeId(c), fileNodeId(target))),
      ],
    );
    const findings = run(files, graph);
    const linterFinding = findings.find((f) => f.locations[0]!.file === "lib/linter/linter.js")!;
    expect(linterFinding).toBeDefined();
    expect(linterFinding.trigger[1]!.value).toBe(1); // `lib/languages` no tiene archivos: una capa real, no dos
    expect(linterFinding.severity).toBeGreaterThan(30);
    expect(linterFinding.detail).not.toContain("raíz(ces) de carpeta de nivel superior distintas");
  });

  it("regresión con datos reales (hugo) — resources/page/pagemeta/pagemeta.go, juzgado VERDADERO (hugolib/content_map.go), con varios importadores bajo sólo 2 raíces de nivel superior, sigue disparando con severidad plena", () => {
    // Geometría real de tests/golden/precision/hugo.verdicts.csv (kind=import-depth-demeter,
    // hugolib/content_map.go, nota: "importa resources/page/pagemeta directamente"). `resources/`
    // y `resources/page/` tienen archivos propios en hugo: dos capas reales.
    const callers = [
      "hugolib/content_map.go",
      "hugolib/pagesfromdata/pagesfromgotmpl.go",
      "hugolib/site.go",
      "hugolib/page__meta.go",
      "hugolib/content_map_page_assembler.go",
      "config/allconfig/alldecoders.go",
      "config/allconfig/allconfig.go",
    ];
    const target = "resources/page/pagemeta/pagemeta.go";
    const files = [
      ...callers.map((c) => fileSummary(c, "go")),
      fileSummary("resources/resource.go", "go"),
      fileSummary("resources/page/page.go", "go"),
      fileSummary(target, "go"),
    ];
    const graph = graphOf(
      [...callers.map((c) => fileNode(c)), fileNode(target)],
      callers.map((c) => importEdge(fileNodeId(c), fileNodeId(target))),
    );
    const findings = run(files, graph);
    const underTest = findings.find((f) => f.locations[0]!.file === "hugolib/content_map.go")!;
    expect(underTest).toBeDefined();
    expect(underTest.trigger[1]!.value).toBe(2);
    expect(underTest.severity).toBeGreaterThan(30);
    expect(underTest.detail).not.toContain("raíz(ces) de carpeta de nivel superior distintas");
  });

  it("GAP CONOCIDO, documentado a propósito (ver 'DESCARTADO' en el docstring de layer-skip.ts, compartido) — el confundidor de Go internal/ NO queda cubierto", () => {
    // tpl/tplimpl/templatetransform.go -> tpl/internal/go_templates/... (hugo.verdicts.csv,
    // juzgado FALSO, "idioma-framework: Go's propia convención internal/ restringe el import a
    // código dentro del árbol"). `tpl/internal/` y `tpl/internal/go_templates/` tienen archivos
    // propios en hugo (verificado), así que hay capas reales y el detector, HOY, sigue
    // reportándolo con severidad plena — límite medido y declarado, no un olvido.
    const files = [
      fileSummary("tpl/tplimpl/templatetransform.go", "go"),
      fileSummary("tpl/internal/templatefuncsRegistry.go", "go"),
      fileSummary("tpl/internal/go_templates/hugo.go", "go"),
      fileSummary("tpl/internal/go_templates/texttemplate/parse/parse.go", "go"),
    ];
    const graph = graphOf(
      [fileNode("tpl/tplimpl/templatetransform.go"), fileNode("tpl/internal/go_templates/texttemplate/parse/parse.go")],
      [importEdge(fileNodeId("tpl/tplimpl/templatetransform.go"), fileNodeId("tpl/internal/go_templates/texttemplate/parse/parse.go"))],
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBeGreaterThan(30); // NO acotado — gap conocido, ver docstring
  });

  it("BUG ARREGLADO — sin aristas 'imports' EN ESTA CORRIDA, un repo ruby-only reporta 'sin-aristas' (transitorio), nunca 'no-aplicable' (permanente)", async () => {
    // Antes de este fix, `needs: ["imports"]` (capacidad por tipo-de-nodo,
    // que Ruby nunca satisface) corría ANTES que `needsEdges` y hacía que
    // este caso reportara `no-aplicable` — "Ruby no puede producir esto,
    // nunca va a cambiar". Eso ya no es cierto (ver el docstring del módulo:
    // el extractor SÍ produce aristas `imports` de Ruby desde Ola 11b/A7).
    // Este grafo en particular no trae ninguna de todos modos (sólo
    // `references`) — el estado correcto para ESE hecho es `sin-aristas`
    // ("no aterrizó en esta corrida"), no una afirmación sobre el lenguaje.
    const files = [fileSummary("lib/a.rb", "ruby"), fileSummary("lib/b/b.rb", "ruby"), fileSummary("lib/b/deep/c.rb", "ruby")];
    const graph = graphOf(
      [
        symbolNode("lib/a.rb", ["Foo"]),
        symbolNode("lib/b/deep/c.rb", ["Bar"]),
      ],
      [
        {
          from: symbolNodeId("lib/a.rb", ["Foo"]),
          to: symbolNodeId("lib/b/deep/c.rb", ["Bar"]),
          kind: "references",
          provenance: "declared",
          weight: 1,
        },
      ],
    );
    const repo = repoWith(files, graph);
    const languages = new Map([["ruby", { capabilities: new Set<import("../capabilities.js").Capability>(), sets: EMPTY_SETS }]]);

    const result = await runDetectorSet([detector], { repo, languages, benchmarks: null });

    expect(result.findings).toHaveLength(0);
    expect(result.coverage).toHaveLength(1);
    expect(result.coverage[0]!.status).toBe("sin-aristas");
    expect(result.coverage[0]!.missingEdgeKinds).toEqual(["imports"]);
  });

  it("BUG ARREGLADO — un repo ruby-only con una arista 'imports' real (require_relative profundo) SÍ produce un hallazgo, vía el runner completo", async () => {
    // Confirma el caso positivo que `needs: ["imports"]` venía silenciando
    // sin excepción (medido: 22 pares reales en rubocop, ninguno llegaba a
    // `run()`). El grafo simula exactamente lo que
    // `graph/edges/imports.ts#importsExtractor` produce hoy para
    // `require_relative "b/deep/internal/c"` — una arista `kind: "imports"`,
    // `provenance: "declared"` — resuelta a un archivo dos niveles más allá
    // de la superficie de "lib/b", que además ES una capa real (tiene b.rb).
    const files = [
      fileSummary("lib/a.rb", "ruby"),
      fileSummary("lib/b/b.rb", "ruby"),
      fileSummary("lib/b/deep/internal/c.rb", "ruby"),
    ];
    const graph = graphOf(
      [fileNode("lib/a.rb"), fileNode("lib/b/deep/internal/c.rb")],
      [importEdge(fileNodeId("lib/a.rb"), fileNodeId("lib/b/deep/internal/c.rb"))],
    );
    const repo = repoWith(files, graph);
    const languages = new Map([["ruby", { capabilities: new Set<import("../capabilities.js").Capability>(), sets: EMPTY_SETS }]]);

    const result = await runDetectorSet([detector], { repo, languages, benchmarks: null });

    expect(result.coverage).toHaveLength(1);
    expect(result.coverage[0]!.status).toBe("corrio");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.locations[0]!.file).toBe("lib/a.rb");
    expect(result.findings[0]!.locations[1]!.file).toBe("lib/b/deep/internal/c.rb");
  });

  it("forzado a correr sobre un grafo ruby SIN aristas 'imports': 0 hallazgos (control negativo de la función pura, independiente del gate de arriba)", () => {
    // Complementa los dos tests de arriba (que pasan por el runner real y su
    // gate): esto llama directo a `buildImportDepthDemeterFindings`,
    // confirmando que la función pura tampoco inventa nada cuando el grafo
    // no trae evidencia — el `needsEdges` del runner y el comportamiento de
    // la función pura están de acuerdo.
    const files = [fileSummary("lib/a.rb", "ruby"), fileSummary("lib/b/b.rb", "ruby"), fileSummary("lib/b/deep/internal/c.rb", "ruby")];
    const graph = graphOf([fileNode("lib/a.rb"), fileNode("lib/b/deep/internal/c.rb")], []);
    expect(run(files, graph)).toHaveLength(0);
  });
});
