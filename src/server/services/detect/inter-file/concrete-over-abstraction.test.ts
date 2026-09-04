import { describe, expect, it } from "vitest";

import { buildConcreteOverAbstractionFindings, detector } from "./concrete-over-abstraction.js";
import { testContext } from "../testing.js";
import type { RepoUnit } from "../types.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: no hace falta tree-sitter — el detector
 * sólo lee `RepoUnit.graph` (nodos+aristas planas), igual que
 * `dependency-cycle.test.ts`/`orphan-file.test.ts`. Por la misma razón,
 * "≥3 lenguajes que emiten" no aplica: el detector no clasifica por
 * lenguaje, opera sobre la FORMA del grafo (`implements`/`satisfies`/
 * `contains`/`references`), `ctx.language` es el centinela `"*"`.
 */
function classNode(file: string, name: string, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, [name]), kind: "symbol", file, symbolPath: [name], family: "class-like", ...overrides };
}

function memberNode(file: string, className: string, memberName: string): CodeGraphNode {
  return { id: symbolNodeId(file, [className, memberName]), kind: "symbol", file, symbolPath: [className, memberName], family: "function-like" };
}

function edge(
  from: string,
  to: string,
  kind: CodeGraphEdge["kind"],
  overrides: Partial<Pick<CodeGraphEdge, "provenance" | "weight">> = {},
): CodeGraphEdge {
  return { from, to, kind, provenance: overrides.provenance ?? "declared", weight: overrides.weight ?? 1 };
}

function contains(from: string, to: string): CodeGraphEdge {
  return edge(from, to, "contains");
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

/**
 * Fixture base: interfaz `Shipper` con un método `ship`, clase concreta
 * `TruckShipper` que la implementa (arista `implements`) y expone además
 * `refuel` (miembro fuera de la interfaz), y un consumidor `Warehouse` en
 * OTRO archivo que referencia `TruckShipper`.
 */
function baseFixture(opts: {
  consumerMember?: string; // si se define, la referencia apunta a este miembro de TruckShipper en vez de a la clase.
  consumerProvenance?: Provenance;
  abstractionKind?: "implements" | "satisfies";
  abstractionProvenance?: Provenance;
  /** Ola P: por defecto el fixture incluye una `instantiates` desde una FÁBRICA (origen ajeno al
   *  consumidor) hacia `TruckShipper` — la evidencia estructural de que B es CONCRETA que el
   *  detector ahora exige. `false` la quita, para probar el descarte (el caso Go: una interfaz
   *  que embebe otra interfaz nunca es destino de una `instantiates`). */
  concreteEvidence?: boolean;
  /** Ola R: `b.ship()` produce una arista `calls` (callee) y no `references`. */
  consumerEdgeKind?: "references" | "calls";
  /** Ola R: el consumidor declara un sitio (campo/parámetro/variable) cuyo TIPO ESCRITO es B. */
  declaresTypeInConsumer?: boolean;
  /** Ola R: la arista de uso del consumidor sale `ambiguous`, con `alternatives` que incluyen al miembro de B. */
  ambiguousMemberWithAlternatives?: readonly string[];
}): { graph: CodeGraph; ids: { iface: string; concrete: string; consumer: string; ship: string; refuel: string; factory: string; carrier: string } } {
  const iface = classNode("shipping/shipper.ts", "Shipper");
  const shipMember = memberNode("shipping/shipper.ts", "Shipper", "ship");
  const concrete = classNode("shipping/truck.ts", "TruckShipper");
  const shipImpl = memberNode("shipping/truck.ts", "TruckShipper", "ship");
  const refuelImpl = memberNode("shipping/truck.ts", "TruckShipper", "refuel");
  const consumer = classNode("warehouse/warehouse.ts", "Warehouse");
  const factory = classNode("shipping/factory.ts", "ShipperFactory");

  const nodes = [iface, shipMember, concrete, shipImpl, refuelImpl, consumer, factory];
  const edges: CodeGraphEdge[] = [
    contains(iface.id, shipMember.id),
    contains(concrete.id, shipImpl.id),
    contains(concrete.id, refuelImpl.id),
    edge(concrete.id, iface.id, opts.abstractionKind ?? "implements", { provenance: opts.abstractionProvenance ?? "declared" }),
  ];
  if (opts.concreteEvidence !== false) edges.push(edge(factory.id, concrete.id, "instantiates"));

  // Ola R — el SITIO DE DECLARACIÓN del consumidor cuyo tipo escrito es B (`carrier` +
  // `declares-type`). Es el ancla que desambigua un miembro ambiguo: ver el docstring del módulo.
  const carrier: CodeGraphNode = {
    id: "carrier:warehouse/warehouse.ts#Warehouse.shipper@0",
    kind: "carrier",
    file: "warehouse/warehouse.ts",
    symbolPath: ["Warehouse", "shipper"],
    carrierForm: "field",
    declaredTypeForm: "nominal",
  };
  if (opts.declaresTypeInConsumer) {
    nodes.push(carrier);
    edges.push(edge(carrier.id, concrete.id, "declares-type"));
  }

  const target = opts.consumerMember === "ship" ? shipImpl.id : opts.consumerMember === "refuel" ? refuelImpl.id : concrete.id;
  const useKind = opts.consumerEdgeKind ?? "references";
  if (opts.ambiguousMemberWithAlternatives) {
    edges.push({
      from: consumer.id,
      to: opts.ambiguousMemberWithAlternatives[0]!,
      kind: useKind,
      provenance: "ambiguous",
      weight: 1,
      alternatives: opts.ambiguousMemberWithAlternatives.slice(1),
    });
  } else {
    edges.push(edge(consumer.id, target, useKind, { provenance: opts.consumerProvenance ?? "declared" }));
  }

  return {
    graph: graphOf(nodes, edges),
    ids: {
      iface: iface.id,
      concrete: concrete.id,
      consumer: consumer.id,
      ship: shipImpl.id,
      refuel: refuelImpl.id,
      factory: factory.id,
      carrier: carrier.id,
    },
  };
}

describe("concrete-over-abstraction", () => {
  it("uso de un miembro cubierto por la interfaz es un hallazgo, con confianza alta", () => {
    const { graph } = baseFixture({ consumerMember: "ship" });
    const threshold = testContext(detector, "*").threshold("presence");
    const findings = buildConcreteOverAbstractionFindings(graph, threshold);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.file).toBe("warehouse/warehouse.ts");
    expect(findings[0]!.locations[0]!.role).toBe("cliente que depende de la clase concreta");
    expect(findings[0]!.locations[1]!.role).toBe("clase concreta usada en vez de la interfaz");
    expect(findings[0]!.locations[2]!.role).toBe("interfaz disponible que cubriría el uso");
    expect(findings[0]!.detail).toContain("Verificado");
  });

  it("control negativo — CON QUÉ SE CONFUNDE: A usa un miembro que la interfaz NO expone, no dispara", () => {
    const { graph } = baseFixture({ consumerMember: "refuel" });
    const threshold = testContext(detector, "*").threshold("presence");
    const findings = buildConcreteOverAbstractionFindings(graph, threshold);
    expect(findings).toHaveLength(0);
  });

  it(
    "OLA R (R5) — CAMBIO DE DEFINICIÓN: una referencia SÓLO a nivel de clase (sin ningún miembro resuelto) ya NO " +
      "dispara. Hasta la Ola Q emitía con severidad 25 y el detail decía 'Confianza reducida'; medido, esa forma era " +
      "el 100 % de la población del corpus (72/72 tarjetas) con 0 % de precisión (n=5, Wilson [0,43]). El enunciado " +
      "afirma que el uso de A está ENTERAMENTE CUBIERTO por I, y con cero miembros observados esa condición se " +
      "cumple por vacuidad: se afirmaba algo que nunca se midió",
    () => {
      const threshold = testContext(detector, "*").threshold("presence");
      expect(buildConcreteOverAbstractionFindings(baseFixture({}).graph, threshold)).toHaveLength(0);

      // Control positivo del MISMO par: con un miembro observado y cubierto, sí dispara.
      const verified = buildConcreteOverAbstractionFindings(baseFixture({ consumerMember: "ship" }).graph, threshold);
      expect(verified).toHaveLength(1);
      expect(verified[0]!.detail).toContain("Verificado");
    },
  );

  it(
    "OLA R (R5) — `calls` es una arista de USO tanto como `references`: `b.ship()` produce una `calls` (posición de " +
      "callee) y no una `references`, y hasta esta ola `collectConsumers` sólo leía la segunda — la forma MÁS COMÚN " +
      "de usar un miembro era invisible para este detector",
    () => {
      const threshold = testContext(detector, "*").threshold("presence");
      const findings = buildConcreteOverAbstractionFindings(baseFixture({ consumerMember: "ship", consumerEdgeKind: "calls" }).graph, threshold);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.detail).toContain("Verificado");
    },
  );

  it(
    "OLA R (R5) — EL TIPO DEL RECEPTOR RESUELVE EL MIEMBRO: una arista de uso `ambiguous` cuyo `to`/`alternatives` " +
      "incluye un miembro de B cuenta SÓLO si el archivo consumidor declara un sitio cuyo TIPO ESCRITO es B " +
      "(`declares-type`). Sin ese ancla no se elige nada: sería resolver una incertidumbre con otra",
    () => {
      const threshold = testContext(detector, "*").threshold("presence");
      const { ids } = baseFixture({});
      const alternatives = ["sym:otro/otro.ts#Otro.ship", ids.ship];

      const conAncla = baseFixture({ ambiguousMemberWithAlternatives: alternatives, declaresTypeInConsumer: true }).graph;
      expect(buildConcreteOverAbstractionFindings(conAncla, threshold)).toHaveLength(1);

      const sinAncla = baseFixture({ ambiguousMemberWithAlternatives: alternatives }).graph;
      expect(buildConcreteOverAbstractionFindings(sinAncla, threshold)).toHaveLength(0);
    },
  );

  it(
    "OLA R (R5) — EL ANCLA ES DE ALCANCE, NO DE ARCHIVO (medido: los 5 falsos de guava, `Ints`/`Longs`/`Doubles`/" +
      "`Shorts`/`Floats` sobre `Converter`, con `equals` como único miembro observado). Un sitio de tipo B declarado " +
      "en una clase ANIDADA no está en alcance para una referencia del contenedor",
    () => {
      const threshold = testContext(detector, "*").threshold("presence");
      const { graph, ids } = baseFixture({ ambiguousMemberWithAlternatives: ["sym:otro/otro.ts#Otro.ship", "shipping/truck.ts#TruckShipper.ship"] });
      // El carrier vive en `Warehouse.Interna` (clase anidada) y la referencia sale de `Warehouse`.
      const anidado: CodeGraph = {
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id: "carrier:warehouse/warehouse.ts#Warehouse.Interna.shipper@0",
            kind: "carrier",
            file: "warehouse/warehouse.ts",
            symbolPath: ["Warehouse", "Interna", "shipper"],
            carrierForm: "field",
            declaredTypeForm: "nominal",
          },
        ],
        edges: [...graph.edges, edge("carrier:warehouse/warehouse.ts#Warehouse.Interna.shipper@0", ids.concrete, "declares-type")],
      };
      expect(buildConcreteOverAbstractionFindings(anidado, threshold)).toHaveLength(0);
    },
  );

  it(
    "OLA R (R5) — PROHIBIDO INFERIR POR CONJUNTO DE MIEMBROS (regla 3): con el ancla `declares-type` puesta, una " +
      "arista ambigua cuyos candidatos NO incluyen ningún miembro de B no aporta nada — el tipo escrito ELIGE entre " +
      "candidatos que la cascada ya produjo, nunca inventa uno",
    () => {
      const threshold = testContext(detector, "*").threshold("presence");
      const graph = baseFixture({
        ambiguousMemberWithAlternatives: ["sym:otro/otro.ts#Otro.ship", "sym:tercero/t.ts#Tercero.ship"],
        declaresTypeInConsumer: true,
      }).graph;
      expect(buildConcreteOverAbstractionFindings(graph, threshold)).toHaveLength(0);
    },
  );

  it("\"B ES CONCRETA\" (Ola P): si NADIE construye B en ningún lado, no hay clase concreta que reemplazar — no dispara", () => {
    // Es el caso Go medido: el `implements` de Go nace del EMBEDDING de una
    // interfaz dentro de otra (`type A interface { B }`), así que la supuesta
    // "clase concreta" es otra interfaz — y una interfaz nunca es destino de
    // una `instantiates`. 253 de los 282 hallazgos del kind (censo Ola O)
    // eran de hugo por esta causa; dos juzgados a mano, los dos falsos.
    const threshold = testContext(detector, "*").threshold("presence");
    expect(buildConcreteOverAbstractionFindings(baseFixture({ consumerMember: "ship", concreteEvidence: false }).graph, threshold)).toHaveLength(0);
    expect(buildConcreteOverAbstractionFindings(baseFixture({ concreteEvidence: false }).graph, threshold)).toHaveLength(0);
  });

  it("control negativo — sin arista implements/satisfies, no hay abstracción que ofrecer: no dispara", () => {
    const concrete = classNode("shipping/truck.ts", "TruckShipper");
    const shipImpl = memberNode("shipping/truck.ts", "TruckShipper", "ship");
    const consumer = classNode("warehouse/warehouse.ts", "Warehouse");
    const graph = graphOf(
      [concrete, shipImpl, consumer],
      [contains(concrete.id, shipImpl.id), edge(consumer.id, shipImpl.id, "references")],
    );
    const threshold = testContext(detector, "*").threshold("presence");
    expect(buildConcreteOverAbstractionFindings(graph, threshold)).toHaveLength(0);
  });

  it("control negativo — interfaz marcador (sin miembros) nunca cubre un uso real", () => {
    const iface = classNode("shipping/marker.ts", "Marker"); // sin hijos `contains`
    const concrete = classNode("shipping/truck.ts", "TruckShipper");
    const shipImpl = memberNode("shipping/truck.ts", "TruckShipper", "ship");
    const consumer = classNode("warehouse/warehouse.ts", "Warehouse");
    const graph = graphOf(
      [iface, concrete, shipImpl, consumer],
      [contains(concrete.id, shipImpl.id), edge(concrete.id, iface.id, "implements"), edge(consumer.id, shipImpl.id, "references")],
    );
    const threshold = testContext(detector, "*").threshold("presence");
    expect(buildConcreteOverAbstractionFindings(graph, threshold)).toHaveLength(0);
  });

  it("control negativo — referencia INTRA-archivo (A y B en el mismo archivo) queda fuera de alcance", () => {
    const iface = classNode("shipping/shipper.ts", "Shipper");
    const shipMember = memberNode("shipping/shipper.ts", "Shipper", "ship");
    const concrete = classNode("shipping/truck.ts", "TruckShipper");
    const shipImpl = memberNode("shipping/truck.ts", "TruckShipper", "ship");
    const sibling = classNode("shipping/truck.ts", "TruckDispatcher"); // mismo archivo que TruckShipper
    const graph = graphOf(
      [iface, shipMember, concrete, shipImpl, sibling],
      [
        contains(iface.id, shipMember.id),
        contains(concrete.id, shipImpl.id),
        edge(concrete.id, iface.id, "implements"),
        edge(sibling.id, shipImpl.id, "references"),
      ],
    );
    const threshold = testContext(detector, "*").threshold("presence");
    expect(buildConcreteOverAbstractionFindings(graph, threshold)).toHaveLength(0);
  });

  it("`satisfies` (interfaz-estructural) siempre es `inferred`: queda excluida hoy (ver 'OJO CON JAVA')", () => {
    const { graph } = baseFixture({ consumerMember: "ship", abstractionKind: "satisfies", abstractionProvenance: "inferred" });
    const threshold = testContext(detector, "*").threshold("presence");
    expect(buildConcreteOverAbstractionFindings(graph, threshold)).toHaveLength(0);
  });

  it("arista `implements` `inferred` (nombre con dos declaraciones candidatas, árbol duplicado guava/android) SÍ cuenta — la relación es NOMINAL, lo inferido es cuál copia (Ola P)", () => {
    const { graph } = baseFixture({ consumerMember: "ship", abstractionProvenance: "inferred" });
    const threshold = testContext(detector, "*").threshold("presence");
    expect(buildConcreteOverAbstractionFindings(graph, threshold)).toHaveLength(1);
  });

  it("arista `references` `inferred` (caso Java / path-proximity) se excluye como evidencia positiva", () => {
    const { graph } = baseFixture({ consumerMember: "ship", consumerProvenance: "inferred" });
    const threshold = testContext(detector, "*").threshold("presence");
    expect(buildConcreteOverAbstractionFindings(graph, threshold)).toHaveLength(0);
  });

  it("arista de abstracción (`implements`) `ambiguous` se excluye: CONTRATO-F9.md §4.5, fuera de toda consulta por defecto", () => {
    const { graph } = baseFixture({ consumerMember: "ship", abstractionProvenance: "ambiguous" });
    const threshold = testContext(detector, "*").threshold("presence");
    expect(buildConcreteOverAbstractionFindings(graph, threshold)).toHaveLength(0);
  });

  it("arista `references` `ambiguous` se excluye como evidencia positiva: CONTRATO-F9.md §4.5", () => {
    const { graph } = baseFixture({ consumerMember: "ship", consumerProvenance: "ambiguous" });
    const threshold = testContext(detector, "*").threshold("presence");
    expect(buildConcreteOverAbstractionFindings(graph, threshold)).toHaveLength(0);
  });

  it("el borde del umbral (piso declarado, presencia no magnitud) se pide a testContext: el valor es 1", () => {
    const threshold = testContext(detector, "*").threshold("presence");
    expect(threshold.value).toBe(1);
  });

  it("sin grafo: detector.run devuelve [] de forma defensiva (run.ts ya reporta 'sin-grafo' antes de llegar acá)", () => {
    const repo = repoWith([fileSummary("a.ts")], null);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(0);
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const { graph } = baseFixture({ consumerMember: "ship" });
    const repo = repoWith([fileSummary("warehouse/warehouse.ts"), fileSummary("shipping/truck.ts"), fileSummary("shipping/shipper.ts")], graph);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(1);
  });

  describe("Ola O — SITIO DE CONSTRUCCIÓN: la construcción de B no es evidencia de cliente evitable", () => {
    it("la ÚNICA evidencia es que A construye B (`new B()`, misma arista `instantiates` que el sitio de la referencia de clase) — no dispara", () => {
      const { graph, ids } = baseFixture({});
      const withInstantiates: CodeGraph = { ...graph, edges: [...graph.edges, edge(ids.consumer, ids.concrete, "instantiates")] };
      const threshold = testContext(detector, "*").threshold("presence");
      expect(buildConcreteOverAbstractionFindings(withInstantiates, threshold)).toHaveLength(0);
    });

    it("control — un archivo que usa un miembro cubierto SIN construir B sigue disparando, aunque otro archivo distinto construya B", () => {
      const iface = classNode("shipping/shipper.ts", "Shipper");
      const shipMember = memberNode("shipping/shipper.ts", "Shipper", "ship");
      const concrete = classNode("shipping/truck.ts", "TruckShipper");
      const shipImpl = memberNode("shipping/truck.ts", "TruckShipper", "ship");
      const builder = classNode("factory/builder.ts", "Builder");
      const consumer = classNode("warehouse/warehouse.ts", "Warehouse");
      const graph = graphOf(
        [iface, shipMember, concrete, shipImpl, builder, consumer],
        [
          contains(iface.id, shipMember.id),
          contains(concrete.id, shipImpl.id),
          edge(concrete.id, iface.id, "implements"),
          edge(builder.id, concrete.id, "instantiates"),
          edge(builder.id, concrete.id, "references"), // el sitio de construcción: se descarta.
          edge(consumer.id, shipImpl.id, "references"), // uso real, cubierto, SIN construir B: sigue en pie.
        ],
      );
      const threshold = testContext(detector, "*").threshold("presence");
      const findings = buildConcreteOverAbstractionFindings(graph, threshold);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.locations[0]!.file).toBe("warehouse/warehouse.ts");
    });

    it("la evidencia de MIEMBRO sigue contando aunque el MISMO origen también construya B — sólo se excluye la referencia de CLASE, no la de miembro", () => {
      const iface = classNode("shipping/shipper.ts", "Shipper");
      const shipMember = memberNode("shipping/shipper.ts", "Shipper", "ship");
      const concrete = classNode("shipping/truck.ts", "TruckShipper");
      const shipImpl = memberNode("shipping/truck.ts", "TruckShipper", "ship");
      const consumer = classNode("warehouse/warehouse.ts", "Warehouse");
      const graph = graphOf(
        [iface, shipMember, concrete, shipImpl, consumer],
        [
          contains(iface.id, shipMember.id),
          contains(concrete.id, shipImpl.id),
          edge(concrete.id, iface.id, "implements"),
          edge(consumer.id, concrete.id, "instantiates"), // consumer construye B...
          edge(consumer.id, concrete.id, "references"), // ...la referencia de clase del propio `new`: se descarta...
          edge(consumer.id, shipImpl.id, "references"), // ...pero también llama un miembro cubierto: sigue contando.
        ],
      );
      const threshold = testContext(detector, "*").threshold("presence");
      const findings = buildConcreteOverAbstractionFindings(graph, threshold);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.detail).toContain("Verificado");
    });

    it("una `instantiates` `inferred` (path-proximity, p.ej. guava/BiMapValueSetGenerator con dos copias del árbol) SÍ excluye la referencia de clase — ver 'POR QUÉ ACEPTA INFERRED' en el docstring del módulo", () => {
      const { graph, ids } = baseFixture({});
      const withInstantiates: CodeGraph = {
        ...graph,
        edges: [...graph.edges, edge(ids.consumer, ids.concrete, "instantiates", { provenance: "inferred" })],
      };
      const threshold = testContext(detector, "*").threshold("presence");
      expect(buildConcreteOverAbstractionFindings(withInstantiates, threshold)).toHaveLength(0);
    });

    it("control negativo: una `instantiates` hacia un origen DISTINTO del consumidor no excluye la evidencia de MIEMBRO de éste", () => {
      // Ola R: el fixture pasa a usar la referencia de MIEMBRO (`ship`) en vez de la de clase —
      // la de clase sola ya no dispara por sí misma (ver "LA FORMA DÉBIL DEJA DE EMITIRSE"), así
      // que probar el descarte del sitio de construcción con ella no distinguiría una causa de la
      // otra. Lo que este control fija sigue siendo lo mismo: `collectInstantiationSites` empareja
      // por PAR (origen, B), no por B sola.
      const { graph, ids } = baseFixture({ consumerMember: "ship" });
      const otherOrigin = classNode("other/other.ts", "Other");
      const withInstantiates: CodeGraph = {
        ...graph,
        nodes: [...graph.nodes, otherOrigin],
        edges: [...graph.edges, edge(otherOrigin.id, ids.concrete, "instantiates")],
      };
      const threshold = testContext(detector, "*").threshold("presence");
      expect(buildConcreteOverAbstractionFindings(withInstantiates, threshold)).toHaveLength(1);
    });
  });

  it("no aplicable sin ninguna arista de abstracción en el grafo (equivalente honesto de 'needs' hasta que Contrato 4 aterrice)", () => {
    // Mismo caso que el control negativo de arriba, nombrado según la convención
    // `needs-evidence.test.ts` — este detector no declara `needs: [Capability]`
    // (no depende de una capacidad de LENGUAJE, ver docstring), pero sí depende
    // de una arista que hoy nunca aparece en producción (`graph/build.ts` no
    // cablea `EDGE_EXTRACTORS`) — el resultado es el mismo: 0 hallazgos, honesto.
    const concrete = classNode("a.ts", "A");
    const consumer = classNode("b.ts", "B");
    const graph = graphOf([concrete, consumer], [edge(consumer.id, concrete.id, "references")]);
    const threshold = testContext(detector, "*").threshold("presence");
    expect(buildConcreteOverAbstractionFindings(graph, threshold)).toHaveLength(0);
  });
});
