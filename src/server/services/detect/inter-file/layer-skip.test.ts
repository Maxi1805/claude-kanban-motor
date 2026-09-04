import { describe, expect, it } from "vitest";

import { buildLayerSkipFindings, detector } from "./layer-skip.js";
import { testContext } from "../testing.js";
import type { RepoUnit } from "../types.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";
import type { ResolutionStageId } from "../../graph/stages.js";

/**
 * `inter-file`, `needsGraph: true`, `needs: []`: no hace falta tree-sitter —
 * el detector sólo lee `RepoUnit.graph` (nodos+aristas planas, y en
 * particular `CodeGraphNode.file`, que ya trae la ruta de carpeta completa)
 * y `RepoUnit.files` (para las líneas de cada archivo, y desde la Ola O
 * también para saber QUÉ CARPETAS CONTIENEN ARCHIVOS), así que este test
 * construye el grafo a mano, igual que `orphan-file.test.ts`/
 * `dependency-cycle.test.ts`. Por la misma razón, "≥3 lenguajes que emiten"
 * no aplica: el detector no clasifica por lenguaje en absoluto (ni siquiera
 * para reducir severidad, a diferencia de `orphan-file`/`unused-symbol`) —
 * ver el docstring del módulo, "LÍMITE ESTRUCTURAL, NO DE LENGUAJE".
 *
 * OLA O, N3 — POR QUÉ CASI TODAS LAS FIXTURES GANARON UN ARCHIVO "DE CAPA".
 * El detector ya no cuenta segmentos de RUTA sino CAPAS REALES: una carpeta
 * intermedia sólo cuenta si contiene directamente algún archivo analizado
 * (ver `detect/primitivas/n3-capas-reales.ts`). Una fixture con sólo dos
 * archivos y cuatro carpetas vacías entre medio ya no describe un módulo con
 * capas: describe un namespace. Agregar el archivo de la capa intermedia
 * ENDURECE la fixture (ahora tiene que expresar la estructura que el
 * hallazgo afirma), no la afloja — y hay tests nuevos, abajo, que verifican
 * el caso contrario (la geometría REAL de guava, sin archivos intermedios,
 * que ahora NO dispara).
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function symbolNode(file: string, symbolPath: readonly string[]): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "function-like" };
}

function edge(
  from: string,
  to: string,
  overrides: Partial<Pick<CodeGraphEdge, "kind" | "provenance" | "weight">> = {},
): CodeGraphEdge {
  return { from, to, kind: overrides.kind ?? "references", provenance: overrides.provenance ?? "declared", weight: overrides.weight ?? 1 };
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
  return buildLayerSkipFindings(files, graph, ctx.threshold("minSkippedLevels"), ctx.threshold("minRealLayers"));
}

/**
 * El archivo que hace de SUPERFICIE del módulo intermedio en las fixtures
 * "hay una capa real y se la saltea": sin él, `app/payments` sería una
 * carpeta sin archivos propios (namespace) y no habría capa que saltear.
 */
const PAYMENTS_SURFACE = fileSummary("app/payments/index.js");

describe("layer-skip", () => {
  it("javascript: referenciar un símbolo 2 niveles más adentro del punto de divergencia, atravesando una capa REAL, es un hallazgo", () => {
    const files = [fileSummary("app/checkout/cart.js"), PAYMENTS_SURFACE, fileSummary("app/payments/internal/gateway/client.js")];
    const graph = graphOf(
      [symbolNode("app/checkout/cart.js", ["run"]), symbolNode("app/payments/internal/gateway/client.js", ["send"])],
      [edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["send"]))],
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2); // niveles de RUTA salteados
    expect(findings[0]!.trigger[1]!.value).toBe(1); // capas REALES salteadas: sólo `app/payments` tiene archivos
    expect(findings[0]!.locations[0]!.file).toBe("app/checkout/cart.js");
    expect(findings[0]!.locations[0]!.role).toBe("archivo que salta la superficie del módulo referenciado");
    expect(findings[0]!.locations[1]!.role).toBe("archivo profundo dentro de otro módulo, fuera de su superficie");
    expect(findings[0]!.locations[1]!.symbol).toBe("send");
  });

  it("OLA O — LA RAÍZ: la geometría REAL de guava (paquete Java: cuatro carpetas intermedias SIN un solo archivo) ya no dispara — es namespace, no capas", () => {
    // Caminos reales de tests/golden/precision/guava.verdicts.csv (10 de 10 juzgados FALSOS,
    // nota: "en Java la profundidad de carpeta ES el paquete (namespace), no una capa").
    // Verificado sobre el árbol real: `android/guava/src`, `…/src/com`, `…/com/google` y
    // `…/google/common` contienen CERO archivos cada una.
    const caller = "android/guava-testlib/src/com/google/common/testing/ClassSanityTester.java";
    const target = "android/guava/src/com/google/common/collect/ArrayListMultimap.java";
    const files = [fileSummary(caller, "java"), fileSummary(target, "java")];
    const graph = graphOf(
      [symbolNode(caller, ["check"]), symbolNode(target, ["create"])],
      [edge(symbolNodeId(caller, ["check"]), symbolNodeId(target, ["create"]))],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("OLA O — control positivo del MISMO lenguaje: un layout Java CON capas reales (carpetas intermedias con archivos) sigue disparando: el mecanismo no apaga java, distingue namespace de capa", () => {
    const caller = "src/main/java/com/acme/web/OrderController.java";
    const target = "src/main/java/com/acme/store/jdbc/internal/OrderDao.java";
    const files = [
      fileSummary(caller, "java"),
      // `store/` y `store/jdbc/` SÍ tienen archivos propios: son capas reales del módulo.
      fileSummary("src/main/java/com/acme/store/OrderStore.java", "java"),
      fileSummary("src/main/java/com/acme/store/jdbc/JdbcOrderStore.java", "java"),
      fileSummary(target, "java"),
    ];
    const graph = graphOf(
      [symbolNode(caller, ["get"]), symbolNode(target, ["findById"])],
      [edge(symbolNodeId(caller, ["get"]), symbolNodeId(target, ["findById"]))],
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[1]!.value).toBe(2); // dos capas reales: `…/acme/store` y `…/store/jdbc`
  });

  it("OLA O — el par sobrevive si UNA sola de las carpetas atravesadas tiene archivos (caso medido de guava: futures/failureaccess/src trae module-info.java)", () => {
    const caller = "guava/src/com/google/common/util/concurrent/AbstractFuture.java";
    const target = "futures/failureaccess/src/com/google/common/util/concurrent/internal/InternalFutureFailureAccess.java";
    const files = [
      fileSummary(caller, "java"),
      fileSummary("futures/failureaccess/src/module-info.java", "java"),
      fileSummary(target, "java"),
    ];
    const graph = graphOf(
      [symbolNode(caller, ["get"]), symbolNode(target, ["tryInternalFastPathGetFailure"])],
      [edge(symbolNodeId(caller, ["get"]), symbolNodeId(target, ["tryInternalFastPathGetFailure"]))],
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(8); // 8 niveles de RUTA
    expect(findings[0]!.trigger[1]!.value).toBe(1); // …de los cuales UNO es una capa real
  });

  it("control negativo: referenciar el archivo de nivel superior del otro módulo (su superficie) no dispara nada", () => {
    const files = [fileSummary("app/checkout/cart.js"), fileSummary("app/payments/client.js")];
    const graph = graphOf(
      [symbolNode("app/checkout/cart.js", ["run"]), symbolNode("app/payments/client.js", ["pay"])],
      [edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/client.js", ["pay"]))],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("borde del umbral: exactamente 1 nivel salteado (uno menos que el umbral) no dispara", () => {
    const files = [fileSummary("app/checkout/cart.js"), PAYMENTS_SURFACE, fileSummary("app/payments/internal/client.js")];
    const graph = graphOf(
      [symbolNode("app/checkout/cart.js", ["run"]), symbolNode("app/payments/internal/client.js", ["pay"])],
      [edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/client.js", ["pay"]))],
    );
    const ctx = testContext(detector, "*");
    expect(ctx.threshold("minSkippedLevels").value).toBe(2); // pisoDeclarado — pedido a testContext, no supuesto
    expect(ctx.threshold("minRealLayers").value).toBe(1);
    expect(run(files, graph)).toHaveLength(0);
  });

  it("borde del umbral: exactamente el umbral (2 niveles salteados, 1 capa real) sí dispara", () => {
    const files = [fileSummary("app/checkout/cart.js"), PAYMENTS_SURFACE, fileSummary("app/payments/internal/gateway/client.js")];
    const graph = graphOf(
      [symbolNode("app/checkout/cart.js", ["run"]), symbolNode("app/payments/internal/gateway/client.js", ["pay"])],
      [edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["pay"]))],
    );
    expect(run(files, graph)).toHaveLength(1);
  });

  it("borde del piso de capas reales: 2 niveles de ruta pero CERO carpetas intermedias con archivos no dispara", () => {
    const files = [fileSummary("app/checkout/cart.js"), fileSummary("app/payments/internal/gateway/client.js")];
    const graph = graphOf(
      [symbolNode("app/checkout/cart.js", ["run"]), symbolNode("app/payments/internal/gateway/client.js", ["pay"])],
      [edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["pay"]))],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("la carpeta PROPIA del destino no cuenta como capa atravesada (llegar ahí es el hallazgo, no el camino)", () => {
    // `app/payments/internal/gateway/` tiene archivos (el propio destino) pero es la carpeta del
    // destino, no una capa intermedia: sin `app/payments/index.js` ni `app/payments/internal/*`
    // no hay ninguna capa real entre la superficie y el destino.
    const files = [
      fileSummary("app/checkout/cart.js"),
      fileSummary("app/payments/internal/gateway/client.js"),
      fileSummary("app/payments/internal/gateway/otro.js"),
    ];
    const graph = graphOf(
      [symbolNode("app/checkout/cart.js", ["run"]), symbolNode("app/payments/internal/gateway/client.js", ["pay"])],
      [edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["pay"]))],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("control negativo: dos archivos hermanos en la misma carpeta profunda no disparan, sin importar cuán profunda sea", () => {
    const files = [
      fileSummary("app/payments/internal/gateway/a.js"),
      fileSummary("app/payments/internal/gateway/b.js"),
    ];
    const graph = graphOf(
      [symbolNode("app/payments/internal/gateway/a.js", ["run"]), symbolNode("app/payments/internal/gateway/b.js", ["helper"])],
      [edge(symbolNodeId("app/payments/internal/gateway/a.js", ["run"]), symbolNodeId("app/payments/internal/gateway/b.js", ["helper"]))],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("control negativo: referencia INTRA-archivo no es un salto de módulo (mismo archivo, sin importar el símbolo)", () => {
    const files = [fileSummary("app/payments/internal/gateway/deep.js"), PAYMENTS_SURFACE];
    const graph = graphOf(
      [symbolNode("app/payments/internal/gateway/deep.js", ["a"]), symbolNode("app/payments/internal/gateway/deep.js", ["b"])],
      [edge(symbolNodeId("app/payments/internal/gateway/deep.js", ["a"]), symbolNodeId("app/payments/internal/gateway/deep.js", ["b"]))],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("monorepo plano: sin jerarquía de carpetas significativa (todo a nivel raíz), la fórmula nunca puede disparar", () => {
    const files = [fileSummary("a.js"), fileSummary("b.js")];
    const graph = graphOf(
      [symbolNode("a.js", ["run"]), symbolNode("b.js", ["helper"])],
      [edge(symbolNodeId("a.js", ["run"]), symbolNodeId("b.js", ["helper"]))],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("una arista `inferred` NO cuenta como evidencia (lectura conservadora — riesgo Java/path-proximity, ver docstring)", () => {
    const files = [
      fileSummary("app/checkout/cart.java", "java"),
      fileSummary("app/payments/Api.java", "java"),
      fileSummary("app/payments/internal/gateway/client.java", "java"),
    ];
    const graph = graphOf(
      [symbolNode("app/checkout/cart.java", ["run"]), symbolNode("app/payments/internal/gateway/client.java", ["pay"])],
      [
        edge(symbolNodeId("app/checkout/cart.java", ["run"]), symbolNodeId("app/payments/internal/gateway/client.java", ["pay"]), {
          provenance: "inferred" as Provenance,
        }),
      ],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("una arista `ambiguous` NO cuenta como evidencia (CONTRATO-F9.md §4.5, fuera de toda consulta por defecto)", () => {
    const files = [
      fileSummary("app/checkout/cart.java", "java"),
      fileSummary("app/payments/Api.java", "java"),
      fileSummary("app/payments/internal/gateway/client.java", "java"),
    ];
    const graph = graphOf(
      [symbolNode("app/checkout/cart.java", ["run"]), symbolNode("app/payments/internal/gateway/client.java", ["pay"])],
      [
        edge(symbolNodeId("app/checkout/cart.java", ["run"]), symbolNodeId("app/payments/internal/gateway/client.java", ["pay"]), {
          provenance: "ambiguous" as Provenance,
        }),
      ],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("BUG ARREGLADO — una arista `resolvedBy: 'global-uniqueness'` NO cuenta como evidencia (mismo tratamiento que `inferred`, ver el docstring del módulo: 62% de los falsos positivos juzgados venían de acá — colisión de nombre genérico vía la etapa 9, catch-all, de la cascada)", () => {
    const files = [
      fileSummary("app/checkout/cart.go", "go"),
      fileSummary("app/payments/api.go", "go"),
      fileSummary("app/payments/internal/gateway/client.go", "go"),
    ];
    const graph = graphOf(
      [symbolNode("app/checkout/cart.go", ["run"]), symbolNode("app/payments/internal/gateway/client.go", ["error"])],
      [
        {
          ...edge(symbolNodeId("app/checkout/cart.go", ["run"]), symbolNodeId("app/payments/internal/gateway/client.go", ["error"])),
          resolvedBy: "global-uniqueness" satisfies ResolutionStageId,
        },
      ],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("una arista `resolvedBy: 'global-uniqueness'` MÁS una arista de OTRA etapa: el par sigue disparando con la evidencia que queda (no todo-o-nada por pareja)", () => {
    const files = [
      fileSummary("app/checkout/cart.go", "go"),
      fileSummary("app/payments/api.go", "go"),
      fileSummary("app/payments/internal/gateway/client.go", "go"),
    ];
    const guEdge: CodeGraphEdge = {
      ...edge(symbolNodeId("app/checkout/cart.go", ["run"]), symbolNodeId("app/payments/internal/gateway/client.go", ["error"])),
      resolvedBy: "global-uniqueness" satisfies ResolutionStageId,
    };
    const otherEdge: CodeGraphEdge = {
      ...edge(symbolNodeId("app/checkout/cart.go", ["run"]), symbolNodeId("app/payments/internal/gateway/client.go", ["Pay"])),
      resolvedBy: "qualified-name" satisfies ResolutionStageId,
    };
    const graph = graphOf(
      [
        symbolNode("app/checkout/cart.go", ["run"]),
        symbolNode("app/payments/internal/gateway/client.go", ["error"]),
        symbolNode("app/payments/internal/gateway/client.go", ["Pay"]),
      ],
      [guEdge, otherEdge],
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    // Sólo la arista de `qualified-name` colapsa en el hallazgo — la de `global-uniqueness` no cuenta.
    expect(findings[0]!.evidence?.[0]?.value).toBe(1);
  });

  it("una arista `contains` no cuenta como dependencia de código (evita falso positivo con la jerarquía misma)", () => {
    const files = [fileSummary("app/checkout/cart.js"), PAYMENTS_SURFACE, fileSummary("app/payments/internal/gateway/client.js")];
    const graph = graphOf(
      [fileNode("app/checkout/cart.js"), fileNode("app/payments/internal/gateway/client.js")],
      [edge(fileNodeId("app/checkout/cart.js"), fileNodeId("app/payments/internal/gateway/client.js"), { kind: "contains" })],
    );
    expect(run(files, graph)).toHaveLength(0);
  });

  it("varios símbolos del mismo archivo profundo referenciados desde el mismo llamador colapsan en UN hallazgo", () => {
    const files = [fileSummary("app/checkout/cart.js"), PAYMENTS_SURFACE, fileSummary("app/payments/internal/gateway/client.js")];
    const graph = graphOf(
      [
        symbolNode("app/checkout/cart.js", ["run"]),
        symbolNode("app/payments/internal/gateway/client.js", ["pay"]),
        symbolNode("app/payments/internal/gateway/client.js", ["refund"]),
      ],
      [
        edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["pay"])),
        edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["refund"])),
      ],
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence?.[0]?.value).toBe(2); // dos aristas colapsadas
    expect(findings[0]!.title).toContain("2 símbolos");
  });

  it("OLA O — LA UNIDAD ES (MÓDULO, MÓDULO): un módulo que alcanza VARIOS archivos internos del mismo módulo cruzado es UN hallazgo, con la cuenta en la evidencia (caso medido: lib/rubocop.rb alcanza 22 internos de lib/rubocop = 506 de volumen de censo)", () => {
    const callers = ["app/checkout/cart.js", "app/checkout/total.js"];
    const targets = [
      "app/payments/internal/gateway/a.js",
      "app/payments/internal/gateway/b.js",
      "app/payments/internal/gateway/c.js",
    ];
    const files = [...callers.map((c) => fileSummary(c)), PAYMENTS_SURFACE, ...targets.map((t) => fileSummary(t))];
    const graph = graphOf(
      [...callers.map((c) => symbolNode(c, ["run"])), ...targets.map((t) => symbolNode(t, ["go"]))],
      callers.flatMap((c) => targets.map((t) => edge(symbolNodeId(c, ["run"]), symbolNodeId(t, ["go"])))),
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1); // 6 pares (2 llamadores x 3 destinos) -> UN hecho módulo-a-módulo
    const evidencia = Object.fromEntries((findings[0]!.evidence ?? []).map((e) => [e.label, e.value]));
    expect(evidencia["archivos del módulo que llama involucrados"]).toBe(2);
    expect(evidencia["archivos internos del módulo cruzado alcanzados"]).toBe(3);
    expect(findings[0]!.title).toContain("app/checkout");
    // Hasta 3 archivos de ejemplo por lado: 2 llamadores (los que hay) + 3 destinos = 5 locations.
    expect(findings[0]!.locations).toHaveLength(5);
    expect(findings[0]!.locations.map((l) => l.file)).toEqual([...callers, ...targets]);
  });

  it("OLA O — dos módulos llamadores distintos hacia el mismo módulo cruzado siguen siendo DOS hallazgos (no se colapsa de más)", () => {
    const files = [
      fileSummary("app/checkout/cart.js"),
      fileSummary("app/billing/invoice.js"),
      PAYMENTS_SURFACE,
      fileSummary("app/payments/internal/gateway/client.js"),
    ];
    const graph = graphOf(
      [
        symbolNode("app/checkout/cart.js", ["run"]),
        symbolNode("app/billing/invoice.js", ["run"]),
        symbolNode("app/payments/internal/gateway/client.js", ["pay"]),
      ],
      [
        edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["pay"])),
        edge(symbolNodeId("app/billing/invoice.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["pay"])),
      ],
    );
    expect(run(files, graph)).toHaveLength(2);
  });

  it('"mismo árbol hacia abajo" (candidato a fachada/barril) pesa MENOS que la misma magnitud en una rama cruzada', () => {
    const filesFacade = [
      fileSummary("app/payments/index.js"),
      fileSummary("app/payments/internal/registry.js"),
      fileSummary("app/payments/internal/gateway/handlers/stripe/client.js"),
    ];
    const graphFacade = graphOf(
      [
        symbolNode("app/payments/index.js", ["init"]),
        symbolNode("app/payments/internal/gateway/handlers/stripe/client.js", ["charge"]),
      ],
      [
        edge(
          symbolNodeId("app/payments/index.js", ["init"]),
          symbolNodeId("app/payments/internal/gateway/handlers/stripe/client.js", ["charge"]),
        ),
      ],
    );
    const filesCross = [
      fileSummary("app/checkout/cart.js"),
      PAYMENTS_SURFACE,
      fileSummary("app/payments/internal/registry.js"),
      fileSummary("app/payments/internal/gateway/handlers/client.js"),
    ];
    const graphCross = graphOf(
      [symbolNode("app/checkout/cart.js", ["run"]), symbolNode("app/payments/internal/gateway/handlers/client.js", ["charge"])],
      [edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/handlers/client.js", ["charge"]))],
    );
    const facadeFindings = run(filesFacade, graphFacade);
    const crossFindings = run(filesCross, graphCross);
    expect(facadeFindings[0]!.trigger[0]!.value).toBe(crossFindings[0]!.trigger[0]!.value); // misma magnitud (3)
    expect(facadeFindings[0]!.trigger[0]!.value).toBe(3);
    expect(facadeFindings[0]!.severity).toBeLessThan(crossFindings[0]!.severity);
    expect(facadeFindings[0]!.detail).toContain("fachada/barril");
    expect(crossFindings[0]!.detail).toContain("no comparten ninguna relación de contención");
  });

  it("severidad acotada (P5, criterio unificado) cuando la MAYORÍA de las aristas del par son 'inferred'", () => {
    const files = [fileSummary("app/checkout/cart.js"), PAYMENTS_SURFACE, fileSummary("app/payments/internal/gateway/client.js")];
    // El hallazgo dispara con 1 arista declared (como el resto de los tests), pero hay además 10 aristas
    // 'inferred' extra entre el MISMO par (no cuentan como evidencia del salto, pero sí hacen que la mayoría
    // de TODAS las aristas del par -- cualquier provenance -- sean 'inferred').
    const noise = Array.from({ length: 10 }, () =>
      edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["send"]), {
        provenance: "inferred" as Provenance,
      }),
    );
    const graph = graphOf(
      [symbolNode("app/checkout/cart.js", ["run"]), symbolNode("app/payments/internal/gateway/client.js", ["send"])],
      [edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["send"])), ...noise],
    );
    const confidentGraph = graphOf(
      [symbolNode("app/checkout/cart.js", ["run"]), symbolNode("app/payments/internal/gateway/client.js", ["send"])],
      [edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["send"]))],
    );
    const findings = run(files, graph);
    const confidentFindings = run(files, confidentGraph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBeLessThanOrEqual(35);
    expect(findings[0]!.severity).toBeLessThan(confidentFindings[0]!.severity);
    expect(findings[0]!.detail).toContain("Confianza reducida");
  });

  it("RAÍZ 3 (Ola N, A2b) — fan-in ancho (archivo destino alcanzado desde >=3 raíces de carpeta de nivel superior distintas) acota la severidad, sin importar la magnitud del salto", () => {
    // Reproduce la geometría medida de guava que SOBREVIVE al filtro de capas reales de la Ola O:
    // `futures/failureaccess/src` contiene `module-info.java` (archivo real, verificado en el árbol),
    // así que es una capa real; y el destino se alcanza desde varias raíces de nivel superior
    // (guava/, android/guava/, guava-gwt/) — el confundidor "micro-artefacto Maven separado".
    const target = "futures/failureaccess/src/com/google/common/util/concurrent/internal/InternalFutureFailureAccess.java";
    const surface = "futures/failureaccess/src/module-info.java";
    const otherRoots = ["android/guava", "guava-gwt"];
    const underTestCaller = "guava/src/com/google/common/util/concurrent/AbstractFuture.java";
    const noiseCallers = otherRoots.map((root) => `${root}/src/com/google/common/util/concurrent/Futures.java`);
    const files = [
      fileSummary(underTestCaller, "java"),
      fileSummary(surface, "java"),
      fileSummary(target, "java"),
      ...noiseCallers.map((c) => fileSummary(c, "java")),
    ];
    const graph = graphOf(
      [symbolNode(underTestCaller, ["get"]), symbolNode(target, ["read"]), ...noiseCallers.map((c) => symbolNode(c, ["run"]))],
      [
        edge(symbolNodeId(underTestCaller, ["get"]), symbolNodeId(target, ["read"])),
        ...noiseCallers.map((c) => edge(symbolNodeId(c, ["run"]), symbolNodeId(target, ["read"]))),
      ],
    );
    const findings = run(files, graph);
    const underTest = findings.find((f) => f.locations[0]!.file === underTestCaller)!;
    expect(underTest).toBeDefined();
    expect(underTest.severity).toBeLessThanOrEqual(30);
    expect(underTest.detail).toContain("raíz(ces) de carpeta de nivel superior distintas");
    expect(underTest.evidence?.at(-1)?.label).toContain("raíces de carpeta de nivel superior distintas");
    // 3 raíces de nivel superior distintas alcanzan el destino: guava, android, guava-gwt.
    expect(underTest.evidence?.at(-1)?.value).toBe(3);
  });

  it("contraejemplo medido (eslint) — TRES llamadores reales bajo el MISMO primer segmento de carpeta no activan el descuento de fan-in ancho: sigue siendo severidad plena", () => {
    // tests/golden/precision/eslint.verdicts.csv: lib/linter/linter.js, lib/api.js y
    // lib/rule-tester/rule-tester.js reeempiezan los tres en lib/languages/js/source-code —
    // un hallazgo VERDADERO. Los tres viven bajo el mismo primer segmento ("lib"), así que el
    // fan-in ANCHO (por raíz de nivel superior) es 1, no 3 — el mecanismo de RAÍZ 3 no debe
    // apagar este caso real. Ver el docstring de `a2b-module-boundary.ts`.
    // La capa real que se saltea es `lib/languages/js` (contiene index.js): `lib/languages` NO
    // tiene archivos propios, verificado en el árbol de eslint — o sea la afirmación honesta es
    // "salta UNA capa real", no dos.
    const target = "lib/languages/js/source-code/index.js";
    const otherCallers = ["lib/api.js", "lib/rule-tester/rule-tester.js"];
    const files = [
      fileSummary("lib/linter/linter.js"),
      fileSummary("lib/languages/js/index.js"),
      fileSummary(target),
      ...otherCallers.map((c) => fileSummary(c)),
    ];
    const graph = graphOf(
      [
        symbolNode("lib/linter/linter.js", ["run"]),
        symbolNode(target, ["SourceCode"]),
        ...otherCallers.map((c) => symbolNode(c, ["run"])),
      ],
      [
        edge(symbolNodeId("lib/linter/linter.js", ["run"]), symbolNodeId(target, ["SourceCode"])),
        ...otherCallers.map((c) => edge(symbolNodeId(c, ["run"]), symbolNodeId(target, ["SourceCode"]))),
      ],
    );
    const findings = run(files, graph);
    const linterFinding = findings.find((f) => f.locations[0]!.file === "lib/linter/linter.js")!;
    expect(linterFinding).toBeDefined();
    expect(linterFinding.trigger[1]!.value).toBe(1); // una capa real (lib/languages/js), no dos
    expect(linterFinding.severity).toBeGreaterThan(30); // NO acotado — cross-branch pleno, sin descuento de fan-in
    expect(linterFinding.detail).not.toContain("raíz(ces) de carpeta de nivel superior distintas");
  });

  it("regresión con datos reales (hugo) — resources/page/pagemeta/pagemeta.go, juzgado VERDADERO con llamadores reales bajo 2 raíces de nivel superior (hugolib, config), sigue disparando y con severidad plena", () => {
    // Caminos reales de tests/golden/precision/hugo.verdicts.csv (kind=layer-skip, target
    // resources/page/pagemeta/pagemeta.go, config/allconfig/alldecoders.go juzgado VERDADERO).
    // `resources/` y `resources/page/` SÍ tienen archivos propios en hugo: dos capas reales.
    const callers = [
      "config/allconfig/alldecoders.go",
      "config/allconfig/allconfig.go",
      "hugolib/pagesfromdata/pagesfromgotmpl.go",
      "hugolib/page__meta.go",
      "hugolib/site.go",
      "hugolib/content_map.go",
      "hugolib/content_map_page_assembler.go",
    ];
    const target = "resources/page/pagemeta/pagemeta.go";
    const files = [
      ...callers.map((c) => fileSummary(c, "go")),
      fileSummary("resources/resource.go", "go"),
      fileSummary("resources/page/page.go", "go"),
      fileSummary(target, "go"),
    ];
    const graph = graphOf(
      [...callers.map((c) => symbolNode(c, ["run"])), symbolNode(target, ["Handler"])],
      callers.map((c) => edge(symbolNodeId(c, ["run"]), symbolNodeId(target, ["Handler"]))),
    );
    const findings = run(files, graph);
    // Los dos llamadores de `config/allconfig` son AHORA un solo hecho módulo-a-módulo
    // (`config/allconfig` -> `resources`), y los de `hugolib` otro: 3 módulos llamadores.
    expect(findings).toHaveLength(3);
    const underTest = findings.find((f) => f.locations[0]!.file.startsWith("config/allconfig/"))!;
    expect(underTest).toBeDefined();
    expect(underTest.trigger[1]!.value).toBe(2); // resources/ y resources/page/ son capas reales
    expect(underTest.severity).toBeGreaterThan(30);
    expect(underTest.detail).not.toContain("raíz(ces) de carpeta de nivel superior distintas");
  });

  it("GAP CONOCIDO, documentado a propósito (ver 'DESCARTADO' en el docstring del módulo) — el confundidor de Go internal/ (restricción del compilador) NO queda cubierto: misma geometría que un hallazgo real (eslint), path-geometry sola no alcanza para distinguirlos", () => {
    // Caminos reales de hugo.verdicts.csv: tpl/tplimpl/* importa tpl/internal/go_templates/... —
    // juzgado FALSO ("idioma-framework: Go's propia convención internal/ restringe el import a
    // código dentro del árbol"). `tpl/internal/` y `tpl/internal/go_templates/` tienen archivos
    // propios en hugo (verificado), así que SÍ hay capas reales: este test documenta que el
    // detector, HOY, sigue reportándolo — no es un olvido, es el límite medido y declarado.
    const files = [
      fileSummary("tpl/tplimpl/templatetransform.go", "go"),
      fileSummary("tpl/internal/templatefuncsRegistry.go", "go"),
      fileSummary("tpl/internal/go_templates/hugo.go", "go"),
      fileSummary("tpl/internal/go_templates/texttemplate/parse/parse.go", "go"),
    ];
    const graph = graphOf(
      [
        symbolNode("tpl/tplimpl/templatetransform.go", ["run"]),
        symbolNode("tpl/internal/go_templates/texttemplate/parse/parse.go", ["error"]),
      ],
      [
        edge(
          symbolNodeId("tpl/tplimpl/templatetransform.go", ["run"]),
          symbolNodeId("tpl/internal/go_templates/texttemplate/parse/parse.go", ["error"]),
        ),
      ],
    );
    const findings = run(files, graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBeGreaterThan(30); // NO acotado — gap conocido, ver docstring
  });

  it("sin grafo: detector.run devuelve [] de forma defensiva (run.ts ya reporta 'sin-grafo' antes de llegar acá)", () => {
    const repo = repoWith([fileSummary("app/checkout/cart.js")], null);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(0);
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const files = [fileSummary("app/checkout/cart.js"), PAYMENTS_SURFACE, fileSummary("app/payments/internal/gateway/client.js")];
    const graph = graphOf(
      [symbolNode("app/checkout/cart.js", ["run"]), symbolNode("app/payments/internal/gateway/client.js", ["pay"])],
      [edge(symbolNodeId("app/checkout/cart.js", ["run"]), symbolNodeId("app/payments/internal/gateway/client.js", ["pay"]))],
    );
    const repo = repoWith(files, graph);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(1);
  });
});
