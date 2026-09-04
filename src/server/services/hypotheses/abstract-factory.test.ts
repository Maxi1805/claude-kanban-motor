import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { CloneCandidate, Finding, RoleLocation } from "../detect/types.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode, Provenance } from "../graph/types.js";
import { buildNeighborhoodIndex, EMPTY_NEIGHBORHOOD, neighborhoodFor } from "../graph/neighborhood.js";
import { hypothesis } from "./abstract-factory.js";
import type { HypothesisContext } from "./types.js";

/**
 * Fixtures mínimas: NADA de AST, sólo la forma que `parallel-hierarchies`
 * (`detect/inter-file/parallel-hierarchies.ts`) realmente produce — mismo
 * criterio que `engine.test.ts`/`run.test.ts` (los `Problem`/`Graph`
 * sintéticos del motor son la unidad de prueba, no una extracción real de
 * un archivo). Los nombres de campo/texto (`"miembros por jerarquía"`,
 * `"raíces por jerarquía"`, el marcador de Bridge en `detail`) están
 * copiados VERBATIM del detector ancla para que `extractProblem` los lea
 * de verdad.
 */
function threshold(): Threshold {
  return resolveThreshold(pisoDeclarado(2, { rationale: "test" }), { language: "*", sampleSize: () => 0, corpusP95: () => null });
}

function familyLocation(file: string, symbol: string, i: number, total: number): RoleLocation {
  return { file, startLine: 1, endLine: 10, symbol, role: `familia ${i + 1} de ${total} (4 miembros, 1 raíz)` };
}

function parallelHierarchiesFinding(overrides: Partial<Finding> = {}, opts: { bridgeLikely?: boolean; families?: [string, string][] } = {}): Finding {
  const families = opts.families ?? ([
    ["a.ts", "WinFactory"],
    ["b.ts", "MacFactory"],
  ] as [string, string][]);
  const locations = families.map(([file, symbol], i) => familyLocation(file, symbol, i, families.length)) as [RoleLocation, ...RoleLocation[]];
  return {
    id: "f-parallel-1",
    detectorId: "parallel-hierarchies",
    kind: "parallel-hierarchies",
    scope: "inter-file",
    language: null,
    title: `${families.length} jerarquías con la misma forma`,
    detail: opts.bridgeLikely
      ? "Se encontró al menos una referencia cruzada entre archivos de estas familias, compatible con una implementación a propósito del patrón Bridge (...)."
      : "No se encontró ninguna referencia cruzada entre archivos de estas familias.",
    trigger: [{ label: "jerarquías con la misma forma", value: families.length, threshold: threshold() }],
    evidence: [
      { label: "miembros por jerarquía", value: 4 },
      { label: "raíces por jerarquía", value: 1 },
    ],
    locations,
    severity: 40,
    advice: { primary: { name: "Move Method", kind: "refactorizacion", why: "y", source: "z" } },
    ...overrides,
  };
}

function node(file: string, symbol: string): CodeGraphNode {
  return { id: `sym:${file}#${symbol}`, kind: "symbol", file, symbolPath: [symbol], family: "class-like", startLine: 1, endLine: 10 };
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"], provenance: Provenance = "declared"): CodeGraphEdge {
  return { from, to, kind, provenance, weight: 1 };
}

function graphWith(nodes: CodeGraphNode[], edges: CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

const WIN = node("a.ts", "WinFactory");
const MAC = node("b.ts", "MacFactory");

/**
 * P4: `crossFamilyRelation` (`required`) ahora exige evidencia real de que
 * las dos familias se tocan — sin esto ningún test de `appliedState`/la
 * escalera de discriminadores llegaría siquiera a candidata. `kind: "calls"`
 * a propósito: no es `references`/`instantiates` HACIA una raíz, así que
 * NO se cuenta como "cliente" en `directTrustedClientsOf` y no contamina el
 * cálculo de `parcial`/`ausente`/`ya-aplicado` que cada test ejercita —
 * sólo satisface el nuevo excluder.
 */
const CROSS_FAMILY_EDGE = edge(WIN.id, MAC.id, "calls");

function baseGraph(extraNodes: CodeGraphNode[] = [], extraEdges: CodeGraphEdge[] = []): CodeGraph {
  return graphWith([WIN, MAC, ...extraNodes], [CROSS_FAMILY_EDGE, ...extraEdges]);
}

function cloneCandidate(file: string, fingerprint: string): CloneCandidate {
  return { fingerprint, file, startLine: 1, endLine: 5, nodes: 5, type: "class_declaration", functionName: null, className: null, superclassName: null, normalized: "x" };
}

function ctxWith(
  capabilities: ReadonlySet<Capability> = new Set(["unidad-tipo-clase"]),
  clones: readonly CloneCandidate[] = [],
  neighborhood: HypothesisContext["neighborhood"] = EMPTY_NEIGHBORHOOD,
): HypothesisContext {
  return {
    file: null,
    fileAt: () => null,
    repo: { repoName: "r", files: [], functions: [], clones, graph: null },
    capabilities,
    setsFor: () => ({
      functionNodes: new Set(),
      branchNodes: new Set(),
      chainNodes: new Set(),
      cloneNodes: new Set(),
      classNodes: new Set(),
      nestingNodes: new Set(),
      constructorNodes: new Set(),
      exceptionNodes: new Set(),
      switchContainerNodes: new Set(),
    }),
    neighborhood,
    branches: () => null,
  };
}

describe("hypotheses/abstract-factory", () => {
  it("anclas: sólo `hardwired-subtype-combination` (OLA AE, AE3) — `parallel-hierarchies` la retiró AL1 con 0/18 verdaderas y ancla TOPEADA", () => {
    // AE3 midió `parallel-hierarchies` sobre las dos poblaciones (13
    // bibliotecas + las 8 aplicaciones de `corpus-app/`): 18 hipótesis, las 18
    // `parcial` — `ausente` CERO, `ya-aplicado` CERO, `aplicado-eludido` CERO.
    //
    // OLA AL (AL1) — SE RETIRA `parallel-hierarchies`, y es la primera vez que
    // este array RESTA. Las 18 recomendaciones están juzgadas, las 18, y
    // **ninguna es verdadera** (0/12 en biblioteca, 0/6 en aplicación). Y no
    // hay nada que construir del otro lado: el ancla mide **0 de 14**
    // verdaderos de NIVEL 1 en biblioteca, o sea que está TOPEADA. Costo en
    // cobertura: **0 huérfanos** en las dos poblaciones.
    expect(hypothesis.anchors).toEqual(["hardwired-subtype-combination"]);
    expect(hypothesis.anchors).not.toContain("parallel-hierarchies");
    expect(hypothesis.pattern).toBe("Abstract Factory");
  });

  it("required: <2 miembros por jerarquía (proxy de slots compartidos) ⇒ null", () => {
    const finding = parallelHierarchiesFinding({ evidence: [{ label: "miembros por jerarquía", value: 1 }, { label: "raíces por jerarquía", value: 1 }] });
    const h = hypothesis.build(finding, baseGraph(), ctxWith());
    expect(h).toBeNull();
  });

  it("required (P4): dos familias sin NINGUNA arista real entre sí ⇒ null — falso positivo cross-fixture (GUIFactory/abstract_factory vs DataMiner/template_method, corpus de 101 fixtures)", () => {
    const finding = parallelHierarchiesFinding();
    // Sin `CROSS_FAMILY_EDGE`: sólo las dos raíces, cero aristas — exactamente
    // la forma que tiene el grafo real entre los dos archivos de fixture
    // (verificado a mano: cero aristas entre `abstract_factory/javascript.js`
    // y `template_method/javascript.js`).
    const graph = graphWith([WIN, MAC], []);
    expect(hypothesis.build(finding, graph, ctxWith())).toBeNull();
  });

  it("required (P4): consumidor que referencia UNA sola familia no alcanza — hace falta que TOQUE a la otra familia", () => {
    const client = node("client.ts", "OnlyWinClient");
    const finding = parallelHierarchiesFinding();
    const graph = graphWith([WIN, MAC, client], [edge(client.id, WIN.id, "references")]);
    expect(hypothesis.build(finding, graph, ctxWith())).toBeNull();
  });

  it("required (P4): `bridgeLikely` del propio ancla alcanza SIN arista propia en este grafo — segunda fuente de la misma señal", () => {
    const finding = parallelHierarchiesFinding({}, { bridgeLikely: true });
    const graph = graphWith([WIN, MAC], []);
    const h = hypothesis.build(finding, graph, ctxWith());
    expect(h).not.toBeNull();
  });

  it("required (P4): un consumidor EXTERNO que referencia raíces de AMBAS familias sí alcanza (consumidor compartido)", () => {
    const coord = node("coord.ts", "GuiFactory");
    const finding = parallelHierarchiesFinding();
    const graph = graphWith([WIN, MAC, coord], [edge(coord.id, WIN.id, "references"), edge(coord.id, MAC.id, "references")]);
    expect(hypothesis.build(finding, graph, ctxWith())).not.toBeNull();
  });

  it("required (P4): una arista directa entre miembros de familias DISTINTAS alcanza (no hace falta que sea raíz-a-raíz)", () => {
    const winButton = node("a.ts", "WinButton");
    const finding = parallelHierarchiesFinding();
    const graph = graphWith(
      [WIN, MAC, winButton],
      [edge(winButton.id, WIN.id, "extends"), edge(winButton.id, MAC.id, "references")],
    );
    expect(hypothesis.build(finding, graph, ctxWith())).not.toBeNull();
  });

  it("required (P4): un miembro (subclase) de la PROPIA familia referenciando su propia raíz NO cuenta como relación cruzada", () => {
    // Reproduce el mecanismo exacto del falso positivo: `WinFactory extends
    // GUIFactory` genera además una arista `references` HACIA `GUIFactory` —
    // ruido de la propia familia, no evidencia de relación con la OTRA.
    const finding = parallelHierarchiesFinding();
    const winSub = node("a.ts", "WinFactorySub");
    const macSub = node("b.ts", "MacFactorySub");
    const graph = graphWith(
      [WIN, MAC, winSub, macSub],
      [edge(winSub.id, WIN.id, "extends"), edge(winSub.id, WIN.id, "references"), edge(macSub.id, MAC.id, "extends"), edge(macSub.id, MAC.id, "references")],
    );
    expect(hypothesis.build(finding, graph, ctxWith())).toBeNull();
  });

  /* ────────────────────────────────────────────────────────────────────────
   * Ola 11a — P4: `crossFamilyRelation` consume `ctx.neighborhood` (además
   * del grafo crudo) como TERCERA vía de evidencia positiva. Ver el
   * docstring de `neighborhoodRelationHolds` en `abstract-factory.ts`.
   * ──────────────────────────────────────────────────────────────────────── */

  it("required (Ola 11a, vecindario): CERO arista propia entre familias, pero `ctx.neighborhood.findingsInFile` expone un hallazgo real que toca AMBOS archivos ⇒ alcanza (sin el vecindario esto sería null, ver el test P4 equivalente sin vecindario)", () => {
    const finding = parallelHierarchiesFinding();
    const graph = graphWith([WIN, MAC], []); // exactamente el caso que, SIN vecindario, ya se probó `null` arriba.
    const sharedDuplication: Finding = {
      id: "f-dup-shared",
      detectorId: "duplication",
      kind: "duplication",
      scope: "inter-file",
      language: null,
      title: "código duplicado entre a.ts y b.ts",
      detail: "detalle",
      trigger: [{ label: "líneas duplicadas", value: 10, threshold: threshold() }],
      evidence: [],
      locations: [
        { file: "a.ts", startLine: 1, endLine: 5, role: "copia #1" },
        { file: "b.ts", startLine: 1, endLine: 5, role: "copia #2" },
      ],
      severity: 30,
      advice: { primary: { name: "Extract Method", kind: "refactorizacion", why: "y", source: "z" } },
    };
    const index = buildNeighborhoodIndex(graph, [finding, sharedDuplication], null);
    const neighborhood = neighborhoodFor(index, finding);
    // Confirma que el vecindario de verdad expone el hallazgo compartido antes de usarlo como evidencia.
    expect(neighborhood.findingsInFile("a.ts").some((f) => f.id === "f-dup-shared")).toBe(true);
    const h = hypothesis.build(finding, graph, ctxWith(new Set(["unidad-tipo-clase"]), [], neighborhood));
    expect(h).not.toBeNull();
    const crossCheck = h!.checks.find((c) => c.label.startsWith("Las familias se TOCAN"));
    expect(crossCheck?.passed).toBe(true);
    expect(crossCheck?.why).toContain("hallazgo del vecindario");
  });

  it("required (Ola 11a, vecindario): CERO arista directa/1-salto entre familias, pero `ctx.neighborhood.ego(ancla,2)` alcanza un miembro de la otra familia por una cadena de 2 saltos ⇒ alcanza", () => {
    const midNode = node("mid.ts", "Intermediary");
    const macButton = node("b.ts", "MacButton"); // miembro de la familia MAC (vía extends), NO la raíz.
    const finding = parallelHierarchiesFinding();
    // WIN --references--> midNode --instantiates--> macButton --extends--> MAC.
    // Ni (a) ni (b) del excluder crudo lo ven: `midNode` no es miembro de
    // ninguna familia (descarta (a), que sólo mira member-a-member), y
    // ninguna arista apunta HACIA una raíz (descarta (b), que sólo mira
    // clientes directos de la raíz). Sólo `ego(WIN, 2)` alcanza `macButton`.
    const graph = graphWith(
      [WIN, MAC, midNode, macButton],
      [edge(WIN.id, midNode.id, "references"), edge(midNode.id, macButton.id, "instantiates"), edge(macButton.id, MAC.id, "extends")],
    );
    // Confirmar primero, sin vecindario, que este grafo es EXACTAMENTE el caso mudo (mismo mecanismo que el test P4 sin ego).
    expect(hypothesis.build(finding, graph, ctxWith())).toBeNull();

    const index = buildNeighborhoodIndex(graph, [finding], null);
    const neighborhood = neighborhoodFor(index, finding);
    const ego = neighborhood.ego({ file: "a.ts", symbolPath: ["WinFactory"] }, 2);
    expect(ego?.nodes.some((n) => n.node.id === macButton.id && n.hops === 2)).toBe(true);

    const h = hypothesis.build(finding, graph, ctxWith(new Set(["unidad-tipo-clase"]), [], neighborhood));
    expect(h).not.toBeNull();
    const crossCheck = h!.checks.find((c) => c.label.startsWith("Las familias se TOCAN"));
    expect(crossCheck?.passed).toBe(true);
  });

  it("required: una arista extends directa entre las raíces reportadas ⇒ null (ya unificadas, contradice el ancla)", () => {
    const finding = parallelHierarchiesFinding();
    const graph = baseGraph([], [edge(WIN.id, MAC.id, "extends")]);
    expect(hypothesis.build(finding, graph, ctxWith())).toBeNull();
  });

  it("required: dos raíces con el MISMO nombre de símbolo ⇒ null (compatible con archivo duplicado, no con variantes) — hallazgo de la verificación manual sobre guava", () => {
    const finding = parallelHierarchiesFinding({}, { families: [["a.ts", "TestStringListGenerator"], ["b.ts", "TestStringListGenerator"]] });
    const graph = graphWith([node("a.ts", "TestStringListGenerator"), node("b.ts", "TestStringListGenerator")], []);
    expect(hypothesis.build(finding, graph, ctxWith())).toBeNull();
  });

  it("required: `mirror-tree` detecta el MISMO archivo duplicado (jre/android) aunque los símbolos tengan nombre DISTINTO — P4, reusa detect/mirror-tree.ts en vez de sólo el nombre", () => {
    const fileA = "guava/pkg/sub/Foo.java";
    const fileB = "android/guava/pkg/sub/Foo.java"; // mismo sufijo de ruta (3 segmentos): sub/Foo.java bajo otra raíz.
    const finding = parallelHierarchiesFinding({}, { families: [[fileA, "FooProviderA"], [fileB, "FooProviderB"]] });
    const graph = graphWith([node(fileA, "FooProviderA"), node(fileB, "FooProviderB")], []);
    const clones = [
      cloneCandidate(fileA, "fp1"),
      cloneCandidate(fileA, "fp2"),
      cloneCandidate(fileA, "fp3"),
      cloneCandidate(fileB, "fp1"),
      cloneCandidate(fileB, "fp2"),
      cloneCandidate(fileB, "fp3"),
    ];
    const h = hypothesis.build(finding, graph, ctxWith(new Set(["unidad-tipo-clase"]), clones));
    expect(h).toBeNull();
  });

  it("`mirror-tree` sin pares gemelos (fingerprints no relacionados) no interfiere — sigue siendo una oportunidad", () => {
    const finding = parallelHierarchiesFinding();
    const clones = [cloneCandidate("a.ts", "unrelated-1"), cloneCandidate("b.ts", "unrelated-2")];
    const h = hypothesis.build(finding, baseGraph(), ctxWith(new Set(["unidad-tipo-clase"]), clones));
    expect(h!.state).toBe("ausente");
  });

  it("capacidad faltante (sin unidad-tipo-clase) ⇒ no-aplicable, confidence null", () => {
    const finding = parallelHierarchiesFinding();
    const h = hypothesis.build(finding, baseGraph(), ctxWith(new Set()));
    expect(h).not.toBeNull();
    expect(h!.confidence).toBeNull();
    expect(h!.missingCapabilities).toEqual(["unidad-tipo-clase"]);
  });

  it("ausente: ningún cliente referencia ninguna familia ⇒ oportunidad clásica, compite con confianza", () => {
    const finding = parallelHierarchiesFinding();
    const h = hypothesis.build(finding, baseGraph(), ctxWith());
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).not.toBeNull();
    expect(h!.ceiling).toBe("media");
  });

  it("parcial: hay cliente para UNA familia pero no la otra — el caso que la regla vieja silenciaba del todo", () => {
    const client = node("client.ts", "OnlyWinClient");
    const graph = baseGraph([client], [edge(client.id, WIN.id, "references")]);
    const h = hypothesis.build(parallelHierarchiesFinding(), graph, ctxWith());
    expect(h!.state).toBe("parcial");
    expect(h!.confidence).not.toBeNull();
  });

  it("parcial también cuando el propio ancla ya sospechó Bridge (bridgeLikely) sin cliente compartido", () => {
    const h = hypothesis.build(parallelHierarchiesFinding({}, { bridgeLikely: true }), baseGraph(), ctxWith());
    expect(h!.state).toBe("parcial");
  });

  it("OLA 10 — parcial (ya NO ya-aplicado): un coordinador referencia/instancia AMBAS raíces pero SIN interfaz F común con miembros redeclarados", () => {
    // Antes de CONTRATO-F10.md esto daba `ya-aplicado`: un sitio que conoce
    // ambas familias directamente (`GuiFactory` acá NO implementa/satisface
    // nada — es sólo una función/objeto que las referencia), sin que ninguna
    // raíz de familia tenga una interfaz implementada en común. Eso es
    // exactamente la forma PARCIAL del contrato ("un sitio que sabe de
    // todas, no un tipo de fábrica") — ya no es información positiva.
    const coord = node("coord.ts", "GuiFactory");
    const graph = baseGraph([coord], [edge(coord.id, WIN.id, "instantiates"), edge(coord.id, MAC.id, "instantiates")]);
    const h = hypothesis.build(parallelHierarchiesFinding(), graph, ctxWith());
    expect(h!.state).toBe("parcial");
    expect(h!.confidence).not.toBeNull();
    expect(h!.checks.some((c) => c.label.includes("SIN interfaz F común") && c.passed)).toBe(true);
    expect(h!.checks.some((c) => c.label.includes("forma COMPLETA") && !c.passed)).toBe(true);
  });

  it("OLA 10 — sigue siendo parcial (nunca aplicado-eludido) cuando además otro cliente puentea el coordinador: sin interfaz F, puentear y coordinar sin interfaz son la misma dispersión", () => {
    const coord = node("coord.ts", "GuiFactory");
    const rogue = node("rogue.ts", "RogueClient");
    const graph = baseGraph(
      [coord, rogue],
      [edge(coord.id, WIN.id, "instantiates"), edge(coord.id, MAC.id, "instantiates"), edge(rogue.id, WIN.id, "instantiates")],
    );
    const h = hypothesis.build(parallelHierarchiesFinding(), graph, ctxWith());
    expect(h!.state).toBe("parcial");
    expect(h!.confidence).not.toBeNull();
    expect(h!.checks.some((c) => c.label.includes("además puentea") && c.passed)).toBe(true);
  });

  it("aristas `inferred` NO cuentan para el excluder — evita silenciar por ruido de path-proximity (guava)", () => {
    const coord = node("coord.ts", "GuiFactory");
    const graph = baseGraph([coord], [edge(coord.id, WIN.id, "instantiates", "inferred"), edge(coord.id, MAC.id, "instantiates", "inferred")]);
    const h = hypothesis.build(parallelHierarchiesFinding(), graph, ctxWith());
    expect(h!.state).toBe("ausente"); // ninguna arista CONFIABLE conecta un cliente a ninguna familia
  });

  it("escalera de discriminadores: raíz con ≥2 implementadores reales (OLA 10, reemplaza el nombre *Factory) + raíz única + solapamiento rico ⇒ alta (dentro del techo media)", () => {
    const families: [string, string][] = [
      ["a.ts", "WinWidgetRoot"],
      ["b.ts", "MacWidgetRoot"],
    ];
    const finding = parallelHierarchiesFinding(
      { evidence: [{ label: "miembros por jerarquía", value: 5 }, { label: "raíces por jerarquía", value: 1 }] },
      { families },
    );
    const winWidget = node("a.ts", "WinWidgetRoot");
    const macWidget = node("b.ts", "MacWidgetRoot");
    // OLA 10: dos implementadores REALES de `winWidget` — la forma estructural
    // que reemplaza el nombre `*Factory/*Builder/*Creator/*Provider`. Sin
    // `contains` de miembros en `winWidget`, `findCompletaMatch` no llega a
    // completar la cadena (se queda en `fMembers.length < 2`), así que esto
    // sólo alimenta el DISCRIMINADOR, no decide el estado.
    const implA = node("implA.ts", "WidgetImplA");
    const implB = node("implB.ts", "WidgetImplB");
    // P4: `crossFamilyRelation` — mismo `kind: "calls"` que `CROSS_FAMILY_EDGE`, ver su comentario.
    const graph = graphWith(
      [winWidget, macWidget, implA, implB],
      [edge(winWidget.id, macWidget.id, "calls"), edge(implA.id, winWidget.id, "implements"), edge(implB.id, winWidget.id, "implements")],
    );
    const h = hypothesis.build(finding, graph, ctxWith());
    // ceiling "media" ⇒ el techo gana aunque la escalera diera "alta".
    expect(h!.ceiling).toBe("media");
    expect(h!.confidence).toBe("media");
    expect(h!.discriminators.filter((d) => d.passed).length).toBe(3);
    expect(h!.discriminators.some((d) => d.label.includes("implements/satisfies ENTRANTES") && d.passed)).toBe(true);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * OLA 10 (CONTRATO-F10.md) — LA FORMA COMPLETA: interfaz F con ≥2 fábricas
   * concretas, ≥2 miembros redeclarados, productos disjuntos por familia, y
   * un cliente que usa F sin instanciar ningún producto concreto.
   * ──────────────────────────────────────────────────────────────────────── */

  function memberNode(file: string, ownerSymbol: string, name: string, arity: number | null): CodeGraphNode {
    return { id: `sym:${file}#${ownerSymbol}.${name}`, kind: "symbol", file, symbolPath: [ownerSymbol, name], family: "function-like", arity, startLine: 1, endLine: 2 };
  }

  /**
   * `WIN` ("a.ts#WinFactory", una de las dos raíces que reporta el ancla)
   * juega el papel de `F`: dos fábricas concretas (`ConcreteA`/`ConcreteB`)
   * la implementan, redeclaran `createA`/`createB` (arity 0) y cada una
   * instancia productos DISJUNTOS. `MAC` sigue siendo la segunda "familia"
   * reportada por el ancla — sin estructura propia, sólo necesaria para que
   * `atLeastTwoFamilies`/`crossFamilyRelation` (vía `CROSS_FAMILY_EDGE` de
   * `baseGraph`) se cumplan; `findCompletaMatch` la ignora porque ya
   * encuentra la cadena completa en `WIN` primero.
   */
  function completaFixture(): {
    nodes: CodeGraphNode[];
    edges: CodeGraphEdge[];
    productA1: CodeGraphNode;
    client: CodeGraphNode;
  } {
    const concreteA = node("implA.ts", "ConcreteA");
    const concreteB = node("implB.ts", "ConcreteB");
    const fCreateA = memberNode("a.ts", "WinFactory", "createA", 0);
    const fCreateB = memberNode("a.ts", "WinFactory", "createB", 0);
    const aCreateA = memberNode("implA.ts", "ConcreteA", "createA", 0);
    const aCreateB = memberNode("implA.ts", "ConcreteA", "createB", 0);
    const bCreateA = memberNode("implB.ts", "ConcreteB", "createA", 0);
    const bCreateB = memberNode("implB.ts", "ConcreteB", "createB", 0);
    const productA1 = node("prodA.ts", "ProductA1");
    const productA2 = node("prodA.ts", "ProductA2");
    const productB1 = node("prodB.ts", "ProductB1");
    const productB2 = node("prodB.ts", "ProductB2");
    const client = node("client.ts", "ClientCode");

    const nodes = [concreteA, concreteB, fCreateA, fCreateB, aCreateA, aCreateB, bCreateA, bCreateB, productA1, productA2, productB1, productB2, client];
    const edges: CodeGraphEdge[] = [
      edge(concreteA.id, WIN.id, "implements"),
      edge(concreteB.id, WIN.id, "implements"),
      edge(WIN.id, fCreateA.id, "contains"),
      edge(WIN.id, fCreateB.id, "contains"),
      edge(concreteA.id, aCreateA.id, "contains"),
      edge(concreteA.id, aCreateB.id, "contains"),
      edge(concreteB.id, bCreateA.id, "contains"),
      edge(concreteB.id, bCreateB.id, "contains"),
      edge(aCreateA.id, productA1.id, "instantiates"),
      edge(aCreateB.id, productA2.id, "instantiates"),
      edge(bCreateA.id, productB1.id, "instantiates"),
      edge(bCreateB.id, productB2.id, "instantiates"),
      edge(client.id, WIN.id, "references"),
    ];
    return { nodes, edges, productA1, client };
  }

  it("ya-aplicado (forma COMPLETA): interfaz F con ≥2 fábricas concretas, miembros redeclarados, productos disjuntos y un cliente limpio ⇒ información positiva, NUNCA sugerencia", () => {
    const f = completaFixture();
    const graph = baseGraph(f.nodes, f.edges);
    const h = hypothesis.build(parallelHierarchiesFinding(), graph, ctxWith());
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
    expect(h!.checks.some((c) => c.label.includes("interfaz de fábrica") && c.passed)).toBe(true);
    expect(h!.checks.some((c) => c.label.includes("productos DISJUNTOS") && c.passed)).toBe(true);
    expect(h!.checks.some((c) => c.label.includes("cliente que usa la interfaz") && c.passed)).toBe(true);
  });

  it("aplicado-eludido (forma COMPLETA + fuga): además del cliente limpio, otro sitio instancia un producto concreto directamente", () => {
    const f = completaFixture();
    const rogue = node("rogue.ts", "RogueClient");
    const graph = baseGraph([...f.nodes, rogue], [...f.edges, edge(rogue.id, f.productA1.id, "instantiates")]);
    const h = hypothesis.build(parallelHierarchiesFinding(), graph, ctxWith());
    expect(h!.state).toBe("aplicado-eludido");
    expect(h!.confidence).toBeNull();
    expect(h!.checks.some((c) => c.label.includes("puentea la fábrica") && c.passed)).toBe(true);
  });

  it("requisito 3 — declarado, no adivinado: sin NINGÚN cliente limpio de F (el único referenciador también instancia un producto), la forma COMPLETA no se confirma y el check lo dice explícitamente", () => {
    const f = completaFixture();
    const graph = baseGraph(f.nodes, [...f.edges, edge(f.client.id, f.productA1.id, "instantiates")]);
    const h = hypothesis.build(parallelHierarchiesFinding(), graph, ctxWith());
    expect(h!.state).not.toBe("ya-aplicado");
    expect(h!.state).not.toBe("aplicado-eludido");
    expect(h!.checks.some((c) => c.label.includes("forma COMPLETA") && !c.passed)).toBe(true);
  });

  it("places = las ubicaciones del Finding ancla, anchorFindingId = su id", () => {
    const finding = parallelHierarchiesFinding();
    const h = hypothesis.build(finding, baseGraph(), ctxWith());
    expect(h!.anchorFindingId).toBe("f-parallel-1");
    expect(h!.places).toEqual(finding.locations);
  });

  it("checks siempre traen why, también cuando passed es false", () => {
    const h = hypothesis.build(parallelHierarchiesFinding(), baseGraph(), ctxWith());
    for (const c of [...h!.checks, ...h!.discriminators]) {
      expect(c.why.length).toBeGreaterThan(0);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA AE (frente AE3) — EL CAMINO DEL ANCLA-FUERZA `hardwired-subtype-combination`.
 * Fixtures con los textos de `trigger`/`evidence`/`role` copiados VERBATIM del
 * detector, para que `extractHardwired` los lea de verdad.
 * ──────────────────────────────────────────────────────────────────────── */

function hardwiredFinding(over: { familias?: number; lugares?: number; archivos?: number; huecosResueltos?: number; sitios?: [string, string][] } = {}): Finding {
  const sitios = over.sitios ?? ([
    ["srv/k.ts", "SrvK"],
    ["srv/m.ts", "SrvM"],
    ["srv/n.ts", "SrvN"],
  ] as [string, string][]);
  const locations: RoleLocation[] = [
    ...sitios.map(([file, symbol]) => ({ file, startLine: 1, endLine: 9, symbol, role: "cablea la elección de familia: instancia KCtx y KSer él mismo" })),
    { file: "base/ctx.ts", startLine: 1, endLine: 4, symbol: "Ctx", role: "hueco de producto: 3 variante(s) elegidas entre los lugares — KCtx, MCtx, NCtx" },
    { file: "base/ser.ts", startLine: 1, endLine: 4, symbol: "Ser", role: "hueco de producto: 3 variante(s) elegidas entre los lugares — KSer, MSer, NSer" },
  ];
  return {
    id: "f-hardwired-1",
    detectorId: "hardwired-subtype-combination",
    kind: "hardwired-subtype-combination",
    scope: "inter-file",
    language: null,
    variant: "Ctx|Ser",
    title: "3 lugares eligen, cada uno por su cuenta, una de 3 combinaciones",
    detail: "…",
    trigger: [
      { label: "huecos de producto que cada lugar cubre", value: 2, threshold: threshold() },
      { label: "combinaciones distintas realmente elegidas", value: over.familias ?? 3, threshold: threshold() },
      { label: "lugares que cablean la elección", value: over.lugares ?? sitios.length, threshold: threshold() },
      { label: "archivos distintos donde vive la elección", value: over.archivos ?? sitios.length, threshold: threshold() },
    ],
    evidence: [
      { label: "variantes del primer hueco", value: 3 },
      { label: "variantes del segundo hueco", value: 3 },
      { label: "huecos que YA tienen un miembro compartido que los crea", value: over.huecosResueltos ?? 0 },
    ],
    locations: locations as [RoleLocation, ...RoleLocation[]],
    severity: 50,
    advice: { primary: { name: "Extract Class", kind: "refactorizacion", why: "…", source: "https://refactoring.com/catalog/extractClass.html" } },
  };
}

/** Un grafo donde los tres lugares SÍ instancian: lo que el `required`
 *  `creacion-en-el-lugar-mismo` re-verifica contra `graph.edges` en crudo. */
function hardwiredGraph(files: readonly string[] = ["srv/k.ts", "srv/m.ts", "srv/n.ts"], provenance: Provenance = "resolved"): CodeGraph {
  const nodes: CodeGraphNode[] = files.map((file, i) => ({
    id: `sym:${file}#crea${i}`,
    kind: "symbol",
    file,
    symbolPath: [`crea${i}`],
    family: "function-like",
    startLine: 1,
    endLine: 3,
  }));
  const producto: CodeGraphNode = { id: "sym:base/ctx.ts#Ctx", kind: "symbol", file: "base/ctx.ts", symbolPath: ["Ctx"], family: "class-like", startLine: 1, endLine: 3 };
  const edges: CodeGraphEdge[] = nodes.map((n) => ({ from: n.id, to: producto.id, kind: "instantiates", provenance, weight: 1 }));
  return { nodes: [...nodes, producto], edges, resolution: {} as never };
}

describe("hypotheses/abstract-factory — camino del ancla-fuerza (OLA AE, AE3)", () => {
  it("la forma completa sin ningún hueco resuelto ⇒ `ausente`, el estado que el ancla vieja NUNCA produjo", () => {
    const h = hypothesis.build(hardwiredFinding(), hardwiredGraph(), ctxWith());
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.pattern).toBe("Abstract Factory");
  });

  it("con un hueco ya resuelto ⇒ `parcial`: hay MEDIA fábrica y la mitigación es completarla", () => {
    const h = hypothesis.build(hardwiredFinding({ huecosResueltos: 1 }), hardwiredGraph(), ctxWith());
    expect(h!.state).toBe("parcial");
    expect(h!.checks.some((c) => c.label.startsWith("media fábrica"))).toBe(true);
  });

  it("required: con UNA sola combinación elegida no hay nada que varíe ⇒ null", () => {
    expect(hypothesis.build(hardwiredFinding({ familias: 1 }), hardwiredGraph(), ctxWith())).toBeNull();
  });

  it("required: con DOS lugares la mitigación barata es una función con un condicional ⇒ null", () => {
    const sitios: [string, string][] = [
      ["srv/k.ts", "SrvK"],
      ["srv/m.ts", "SrvM"],
    ];
    expect(hypothesis.build(hardwiredFinding({ sitios, lugares: 2, archivos: 2 }), hardwiredGraph(["srv/k.ts", "srv/m.ts"]), ctxWith())).toBeNull();
  });

  it("required: si la elección NO cruza el archivo ⇒ null", () => {
    expect(hypothesis.build(hardwiredFinding({ archivos: 1 }), hardwiredGraph(), ctxWith())).toBeNull();
  });

  it("required NO permisivo: si el grafo no muestra la creación en cada lugar, NO aprueba por no poder mirar ⇒ null", () => {
    expect(hypothesis.build(hardwiredFinding(), hardwiredGraph(["srv/k.ts"]), ctxWith())).toBeNull();
    // …y tampoco cuando la única instanciación visible es de procedencia no confiable.
    expect(hypothesis.build(hardwiredFinding(), hardwiredGraph(undefined, "inferred"), ctxWith())).toBeNull();
  });

  it("un `Finding` sin las ubicaciones del ancla no construye nada (nunca se inventa un problema)", () => {
    const roto = { ...hardwiredFinding(), locations: [{ file: "x.ts", startLine: 1, endLine: 2, role: "otra cosa" }] as [RoleLocation, ...RoleLocation[]] };
    expect(hypothesis.build(roto, hardwiredGraph(), ctxWith())).toBeNull();
  });

  it("EL CAMINO VIEJO SIGUE INTACTO: un `Finding` de `parallel-hierarchies` no pasa por el camino nuevo", () => {
    const h = hypothesis.build(parallelHierarchiesFinding(), baseGraph(), ctxWith());
    // Mismo resultado que antes de la Ola AE: lo decide `appliedState` viejo,
    // y sus checks son los suyos — ninguno del camino nuevo.
    expect(h?.checks.some((c) => c.label.startsWith("media fábrica"))).toBeFalsy();
    expect(h?.checks.some((c) => c.label.startsWith("ningún creador compartido"))).toBeFalsy();
  });
});
