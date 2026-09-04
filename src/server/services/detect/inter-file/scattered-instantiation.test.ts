import { describe, expect, it } from "vitest";

import { buildScatteredInstantiationFindings, detector } from "./scattered-instantiation.js";
import { testContext } from "../testing.js";
import type { RepoUnit } from "../types.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: el detector sólo lee `RepoUnit.graph`
 * (nodos+aristas planas), así que este test construye el grafo a mano, igual
 * que `dependency-cycle.test.ts`/`orphan-file.test.ts`. "≥3 lenguajes que
 * emiten" no aplica: el detector opera sobre la FORMA del grafo (conteo de
 * aristas `instantiates` por archivo de origen), sin clasificar por
 * lenguaje — `ctx.language` es el centinela `"*"` en producción.
 */
function classNode(file: string, name: string): CodeGraphNode {
  return { id: symbolNodeId(file, [name]), kind: "symbol", file, symbolPath: [name], family: "class-like", startLine: 1, endLine: 5 };
}

function siteNode(file: string, symbolPath: readonly string[], startLine = 1): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "function-like", startLine, endLine: startLine };
}

function instantiateEdge(
  from: CodeGraphNode,
  to: CodeGraphNode,
  overrides: Partial<Pick<CodeGraphEdge, "provenance" | "weight" | "kind">> = {},
): CodeGraphEdge {
  return {
    from: from.id,
    to: to.id,
    kind: overrides.kind ?? "instantiates",
    provenance: overrides.provenance ?? "declared",
    weight: overrides.weight ?? 1,
  };
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return {
    nodes,
    edges,
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

function repoWith(graph: CodeGraph | null): RepoUnit {
  return { repoName: "test", files: [], functions: [], clones: [], graph };
}

/**
 * SÉPTIMO CASO (ver docstring del módulo): un miembro `function-like` propio
 * de `target`, vía `contains` — evidencia de "tiene una implementación
 * propia". `scatteredGraph` se lo adjunta por defecto para que los tests de
 * OTRAS secciones (jerarquía, aggregator, umbral…) sigan representando un
 * tipo TÍPICO con comportamiento y no choquen con el filtro nuevo — el
 * describe "valor puro sin comportamiento propio" más abajo construye su
 * propio grafo SIN esto a propósito.
 */
function ownMethodEdge(target: CodeGraphNode): { member: CodeGraphNode; edge: CodeGraphEdge } {
  const member = siteNode(target.file, [...target.symbolPath, "method"], target.startLine ?? 1);
  return { member, edge: { from: target.id, to: member.id, kind: "contains", provenance: "declared", weight: 1 } };
}

/**
 * OCTAVO CASO (ver docstring del módulo): un binding de módulo/clase que
 * GUARDA una instancia de `target` (arista `stores`, `family: "other"` —
 * mismo `family` que `graph/symbols.ts` le da a un binding) y se LEE desde
 * un archivo DISTINTO al que lo declara (arista `references` entrante desde
 * otro archivo). `scatteredGraph` se lo adjunta por defecto, mismo motivo
 * que `ownMethodEdge`: para que los tests de OTRAS secciones (jerarquía,
 * aggregator, umbral…) no choquen con el filtro nuevo — el describe "cadena
 * de identidad" más abajo construye sus propios grafos SIN esto, o con una
 * variante rota, a propósito.
 */
function identityChainEdges(target: CodeGraphNode): { binding: CodeGraphNode; reader: CodeGraphNode; storesEdge: CodeGraphEdge; readEdge: CodeGraphEdge } {
  const binding: CodeGraphNode = {
    id: symbolNodeId(`${target.file}-holder.ts`, ["INSTANCE"]),
    kind: "symbol",
    file: `${target.file}-holder.ts`,
    symbolPath: ["INSTANCE"],
    family: "other",
    startLine: 1,
    endLine: 1,
  };
  const reader = siteNode("reader-of-instance.ts", ["run"]);
  const storesEdge: CodeGraphEdge = { from: binding.id, to: target.id, kind: "stores", provenance: "declared", weight: 1 };
  const readEdge: CodeGraphEdge = { from: reader.id, to: binding.id, kind: "references", provenance: "declared", weight: 1 };
  return { binding, reader, storesEdge, readEdge };
}

/** N sitios en N archivos distintos, cada uno construyendo `target` (con UN miembro propio y una cadena de identidad, ver `ownMethodEdge`/`identityChainEdges`). */
function scatteredGraph(target: CodeGraphNode, siteCount: number, provenance: Provenance = "declared"): CodeGraph {
  const sites = Array.from({ length: siteCount }, (_, i) => siteNode(`site${i}.ts`, ["run"]));
  const edges = sites.map((s) => instantiateEdge(s, target, { provenance }));
  const { member, edge: memberEdge } = ownMethodEdge(target);
  const { binding, reader, storesEdge, readEdge } = identityChainEdges(target);
  return graphOf([target, member, binding, reader, ...sites], [memberEdge, storesEdge, readEdge, ...edges]);
}

const THRESHOLDS = testContext(detector, "*");
const MIN_SITES = THRESHOLDS.threshold("minSites");
const MAX_INSTANTIATION_FANOUT = THRESHOLDS.threshold("maxInstantiationFanoutConsidered");

function run(graph: CodeGraph) {
  return buildScatteredInstantiationFindings(graph, MIN_SITES, MAX_INSTANTIATION_FANOUT);
}

describe("scattered-instantiation", () => {
  it("el umbral (citado: Regla de Tres, R3) resuelve a 3 — Ola 11a, recalibrado de 6 a 3 (ver el comentario de MIN_SITES_SPEC)", () => {
    expect(MIN_SITES.kind).toBe("citado");
    expect(MIN_SITES.value).toBe(3);
  });

  it("6 archivos distintos construyendo el mismo tipo: dispara, con trigger=6 y el rol correcto", () => {
    const target = classNode("shapes/Foo.ts", "Foo");
    const graph = scatteredGraph(target, 6);
    const findings = run(graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(6);
    expect(findings[0]!.title).toContain("Foo");
    expect(findings[0]!.locations[0]!.role).toBe("tipo construido directamente desde 6 archivos distintos");
    expect(findings[0]!.locations[0]!.file).toBe("shapes/Foo.ts");
    // 1 location por el tipo + 1 por cada sitio distinto.
    expect(findings[0]!.locations).toHaveLength(7);
    expect(findings[0]!.locations[1]!.role).toBe("sitio de instanciación directa");
  });

  it("control negativo: 2 archivos distintos (justo debajo del piso) no dispara", () => {
    const target = classNode("shapes/Foo.ts", "Foo");
    const graph = scatteredGraph(target, 2);
    expect(run(graph)).toHaveLength(0);
  });

  it("repetir la construcción muchas veces DENTRO de un mismo archivo no cuenta como dispersión (se cuentan archivos, no ocurrencias)", () => {
    const target = classNode("shapes/Foo.ts", "Foo");
    const site = siteNode("only-one-file.ts", ["run"]);
    const graph = graphOf(
      [target, site],
      Array.from({ length: 20 }, () => instantiateEdge(site, target)),
    );
    expect(run(graph)).toHaveLength(0);
  });

  it("una arista `instantiates` inferida (path-proximity) NO cuenta: evidencia positiva, se excluye por diseño", () => {
    const target = classNode("Foo.java", "Foo");
    // 2 declaradas + 1 inferida: si la inferida contara, llegaría a 3 y dispararía.
    const declaredGraph = scatteredGraph(target, 2, "declared");
    const inferredSite = siteNode("inferred-site.java", ["run"]);
    const graph = graphOf(
      [...declaredGraph.nodes, inferredSite],
      [...declaredGraph.edges, instantiateEdge(inferredSite, target, { provenance: "inferred" })],
    );
    expect(run(graph)).toHaveLength(0);
  });

  it("una arista `instantiates` ambigua NO cuenta: CONTRATO-F9.md §4.5, fuera de toda consulta por defecto", () => {
    const target = classNode("Foo.java", "Foo");
    // 2 declaradas + 1 ambigua: si la ambigua contara, llegaría a 3 y dispararía.
    const declaredGraph = scatteredGraph(target, 2, "declared");
    const ambiguousSite = siteNode("ambiguous-site.java", ["run"]);
    const graph = graphOf(
      [...declaredGraph.nodes, ambiguousSite],
      [...declaredGraph.edges, instantiateEdge(ambiguousSite, target, { provenance: "ambiguous" })],
    );
    expect(run(graph)).toHaveLength(0);
  });

  it("el destino tiene que ser `class-like`: instanciar algo clasificado function-like no cuenta", () => {
    const notAClass = siteNode("Helper.ts", ["Helper"]);
    const sites = Array.from({ length: 6 }, (_, i) => siteNode(`site${i}.ts`, ["run"]));
    const graph = graphOf([notAClass, ...sites], sites.map((s) => instantiateEdge(s, notAClass)));
    expect(run(graph)).toHaveLength(0);
  });

  it("una arista de otro `kind` (p.ej. `references`) no se confunde con instanciación", () => {
    const target = classNode("Foo.ts", "Foo");
    const sites = Array.from({ length: 6 }, (_, i) => siteNode(`site${i}.ts`, ["run"]));
    const graph = graphOf([target, ...sites], sites.map((s) => instantiateEdge(s, target, { kind: "references" })));
    expect(run(graph)).toHaveLength(0);
  });

  it("severidad crece con la cantidad de archivos distintos", () => {
    const target6 = classNode("Foo.ts", "Foo");
    const target20 = classNode("Bar.ts", "Bar");
    const f6 = run(scatteredGraph(target6, 6))[0]!;
    const f20 = run(scatteredGraph(target20, 20))[0]!;
    expect(f20.severity).toBeGreaterThan(f6.severity);
  });

  describe("participación en jerarquía (redefinición, ver docstring del módulo)", () => {
    it("un tipo que EXTIENDE otra cosa no cuenta como candidato — es una variante de una jerarquía, no un tipo que debería colapsar a una instancia compartida (nest: RuntimeException extends Error)", () => {
      const target = classNode("errors/RuntimeException.ts", "RuntimeException");
      const base = classNode("lib/Error.ts", "Error");
      const graph = scatteredGraph(target, 4);
      const withExtends = graphOf(
        [...graph.nodes, base],
        [...graph.edges, { from: target.id, to: base.id, kind: "extends", provenance: "declared", weight: 1 }],
      );
      expect(run(withExtends)).toHaveLength(0);
    });

    it("un tipo que IMPLEMENTA una interfaz no cuenta como candidato (C#: DefaultContractResolver implements IContractResolver)", () => {
      const target = classNode("DefaultContractResolver.cs", "DefaultContractResolver");
      const iface = classNode("IContractResolver.cs", "IContractResolver");
      const graph = scatteredGraph(target, 4);
      const withImplements = graphOf(
        [...graph.nodes, iface],
        [...graph.edges, { from: target.id, to: iface.id, kind: "implements", provenance: "declared", weight: 1 }],
      );
      expect(run(withImplements)).toHaveLength(0);
    });

    it("un tipo que SATISFACE una interfaz (Go, duck typing) no cuenta como candidato — 3+ variantes bajo un contrato es Strategy, no acoplamiento", () => {
      const target = classNode("commands/simpleCommand.go", "simpleCommand");
      const iface = classNode("simplecobra/Commander.go", "Commander");
      const graph = scatteredGraph(target, 4);
      const withSatisfies = graphOf(
        [...graph.nodes, iface],
        [...graph.edges, { from: target.id, to: iface.id, kind: "satisfies", provenance: "resolved", weight: 1 }],
      );
      expect(run(withSatisfies)).toHaveLength(0);
    });

    it("control positivo: SIN ninguna arista de jerarquía, el mismo tipo sigue disparando (la redefinición no apaga el caso genuino)", () => {
      const target = classNode("shapes/Foo.ts", "Foo");
      const graph = scatteredGraph(target, 4);
      expect(run(graph)).toHaveLength(1);
    });

    it("una arista de jerarquía `inferred` (baja confianza) NO alcanza para descartar el candidato — misma exigencia de evidencia positiva que el resto del archivo", () => {
      const target = classNode("shapes/Foo.ts", "Foo");
      const base = classNode("lib/Base.ts", "Base");
      const graph = scatteredGraph(target, 4);
      const withInferredExtends = graphOf(
        [...graph.nodes, base],
        [...graph.edges, { from: target.id, to: base.id, kind: "extends", provenance: "inferred", weight: 1 }],
      );
      expect(run(withInferredExtends)).toHaveLength(1);
    });

    it("una arista de jerarquía donde el tipo construido es DESTINO (otra cosa extiende/implementa AL tipo construido) SÍ lo descarta desde Ola P/SEXTO CASO — ANTES (hasta Ola O) la exclusión miraba sólo el ORIGEN y este mismo caso disparaba; ver el describe 'tipo base con variantes con nombre' para la cobertura completa del caso nuevo", () => {
      const target = classNode("shapes/Base.ts", "Base"); // Base es la INTERFAZ/clase base, no la que extiende
      const child = classNode("shapes/Child.ts", "Child");
      const graph = scatteredGraph(target, 4);
      const withReverseExtends = graphOf(
        [...graph.nodes, child],
        [...graph.edges, { from: child.id, to: target.id, kind: "extends", provenance: "declared", weight: 1 }],
      );
      expect(run(withReverseExtends)).toHaveLength(0);
    });
  });

  describe("tipo base con variantes con nombre (SEXTO CASO, ver docstring del módulo)", () => {
    it("un tipo que es DESTINO de una arista extends (otra cosa lo extiende) no cuenta como candidato — T es la base de una variante con nombre (guava real: FakeTicker extends Ticker)", () => {
      const target = classNode("base/Ticker.ts", "Ticker");
      const variant = classNode("test/FakeTicker.ts", "FakeTicker");
      const graph = scatteredGraph(target, 4);
      const withIncomingExtends = graphOf(
        [...graph.nodes, variant],
        [...graph.edges, { from: variant.id, to: target.id, kind: "extends", provenance: "declared", weight: 1 }],
      );
      expect(run(withIncomingExtends)).toHaveLength(0);
    });

    it("un tipo que es DESTINO de una arista implements (otra cosa lo implementa) no cuenta como candidato — mismo mecanismo, jerarquía por interfaz", () => {
      const target = classNode("base/Handler.ts", "Handler");
      const variant = classNode("impl/JsonHandler.ts", "JsonHandler");
      const graph = scatteredGraph(target, 4);
      const withIncomingImplements = graphOf(
        [...graph.nodes, variant],
        [...graph.edges, { from: variant.id, to: target.id, kind: "implements", provenance: "resolved", weight: 1 }],
      );
      expect(run(withIncomingImplements)).toHaveLength(0);
    });

    it("una arista ENTRANTE `inferred` (baja confianza) NO alcanza para descartar el candidato — misma exigencia de evidencia positiva que el resto del archivo", () => {
      const target = classNode("base/Ticker.ts", "Ticker");
      const variant = classNode("test/FakeTicker.ts", "FakeTicker");
      const graph = scatteredGraph(target, 4);
      const withInferredIncomingExtends = graphOf(
        [...graph.nodes, variant],
        [...graph.edges, { from: variant.id, to: target.id, kind: "extends", provenance: "inferred", weight: 1 }],
      );
      expect(run(withInferredIncomingExtends)).toHaveLength(1);
    });

    it("control positivo: sin ninguna variante con nombre (ninguna arista de jerarquía entrante NI saliente), el mismo tipo sigue disparando", () => {
      const target = classNode("shapes/Foo.ts", "Foo");
      const graph = scatteredGraph(target, 4);
      expect(run(graph)).toHaveLength(1);
    });
  });

  describe("valor puro sin comportamiento propio (SÉPTIMO CASO, ver docstring del módulo)", () => {
    it("un tipo SIN ningún miembro function-like propio no cuenta como candidato — no hay una implementación que una fábrica pudiera centralizar, sólo datos (hugo real: configKey, verificado sin un solo método propio)", () => {
      const target = classNode("commands/configKey.go", "configKey");
      const sites = Array.from({ length: 4 }, (_, i) => siteNode(`site${i}.go`, ["run"]));
      // A propósito SIN pasar por `scatteredGraph`/`ownMethodEdge`: este es
      // exactamente el caso que ese helper por defecto NO representa.
      const graph = graphOf([target, ...sites], sites.map((s) => instantiateEdge(s, target)));
      expect(run(graph)).toHaveLength(0);
    });

    it("un miembro `contains` que NO es function-like (p.ej. un campo) no cuenta como comportamiento propio — sigue sin disparar", () => {
      const target = classNode("commands/configKey.go", "configKey");
      const field = { id: symbolNodeId("commands/configKey.go", ["configKey", "Key"]), kind: "symbol" as const, file: "commands/configKey.go", symbolPath: ["configKey", "Key"], family: "other" as const, startLine: 2, endLine: 2 };
      const sites = Array.from({ length: 4 }, (_, i) => siteNode(`site${i}.go`, ["run"]));
      const graph = graphOf(
        [target, field, ...sites],
        [{ from: target.id, to: field.id, kind: "contains", provenance: "declared", weight: 1 }, ...sites.map((s) => instantiateEdge(s, target))],
      );
      expect(run(graph)).toHaveLength(0);
    });

    it("control positivo: el mismo tipo CON un miembro propio (scatteredGraph lo adjunta por defecto, ver ownMethodEdge) sigue disparando — la redefinición no apaga el caso genuino", () => {
      const target = classNode("shapes/Foo.ts", "Foo");
      const graph = scatteredGraph(target, 4);
      expect(run(graph)).toHaveLength(1);
    });
  });

  describe("la cadena de identidad (OCTAVO CASO, Ola R/R6, ver docstring del módulo)", () => {
    it("un tipo SIN ninguna arista `stores` no cuenta como candidato — no hay evidencia, en ningún punto del repo, de que algo lo trate como identidad compartida (hugo real: FeatureNotAvailableError SIN el centinela contaría acá)", () => {
      const target = classNode("shapes/Foo.ts", "Foo");
      const { member, edge: memberEdge } = ownMethodEdge(target);
      // A propósito SIN `identityChainEdges`: este es exactamente el caso que
      // `scatteredGraph` por defecto NO representa.
      const sites = Array.from({ length: 4 }, (_, i) => siteNode(`site${i}.ts`, ["run"]));
      const graph = graphOf([target, member, ...sites], [memberEdge, ...sites.map((s) => instantiateEdge(s, target))]);
      expect(run(graph)).toHaveLength(0);
    });

    it("un `stores` SIN ningún lector (ninguna arista `references`/`calls` entrante al binding) no cuenta — 'guarda' sin 'lee' no es la cadena completa", () => {
      const target = classNode("shapes/Foo.ts", "Foo");
      const { member, edge: memberEdge } = ownMethodEdge(target);
      const { binding, storesEdge } = identityChainEdges(target);
      const sites = Array.from({ length: 4 }, (_, i) => siteNode(`site${i}.ts`, ["run"]));
      // binding y storesEdge SIN readEdge: se guarda, nadie lo lee.
      const graph = graphOf([target, member, binding, ...sites], [memberEdge, storesEdge, ...sites.map((s) => instantiateEdge(s, target))]);
      expect(run(graph)).toHaveLength(0);
    });

    it("un `stores` leído SÓLO desde su propio archivo no cuenta — un único lector que además es el mismo archivo declarante no es 'leído desde otro punto' (jekyll real: SITE de un script de benchmark, un solo lector, él mismo)", () => {
      const target = classNode("shapes/Foo.ts", "Foo");
      const { member, edge: memberEdge } = ownMethodEdge(target);
      const { binding, storesEdge } = identityChainEdges(target);
      // El lector vive en el MISMO archivo que declara el binding — autorreferencia, no lectura externa.
      const selfReader = siteNode(binding.file, ["selfRead"]);
      const selfReadEdge: CodeGraphEdge = { from: selfReader.id, to: binding.id, kind: "references", provenance: "declared", weight: 1 };
      const sites = Array.from({ length: 4 }, (_, i) => siteNode(`site${i}.ts`, ["run"]));
      const graph = graphOf(
        [target, member, binding, selfReader, ...sites],
        [memberEdge, storesEdge, selfReadEdge, ...sites.map((s) => instantiateEdge(s, target))],
      );
      expect(run(graph)).toHaveLength(0);
    });

    it("una arista `stores` ambigua no cuenta — CONTRATO-F9.md §4.5, `edgeIsAmbiguous` la deja fuera de toda consulta por defecto, mismo criterio que el resto del archivo aplica a `instantiates`/jerarquía", () => {
      const target = classNode("shapes/Foo.ts", "Foo");
      const { member, edge: memberEdge } = ownMethodEdge(target);
      const { binding, reader, storesEdge, readEdge } = identityChainEdges(target);
      const ambiguousStores: CodeGraphEdge = { ...storesEdge, provenance: "ambiguous" };
      const sites = Array.from({ length: 4 }, (_, i) => siteNode(`site${i}.ts`, ["run"]));
      const graph = graphOf(
        [target, member, binding, reader, ...sites],
        [memberEdge, ambiguousStores, readEdge, ...sites.map((s) => instantiateEdge(s, target))],
      );
      expect(run(graph)).toHaveLength(0);
    });

    it("control positivo: `stores` + lector desde OTRO archivo (scatteredGraph lo adjunta por defecto, ver identityChainEdges) sigue disparando — la redefinición no apaga el caso genuino", () => {
      const target = classNode("shapes/Foo.ts", "Foo");
      const graph = scatteredGraph(target, 4);
      expect(run(graph)).toHaveLength(1);
    });
  });

  describe("archivo agregador / composition-root (QUINTO CASO, ver docstring del módulo)", () => {
    /**
     * Ver "QUINTO CASO" en el docstring de `scattered-instantiation.ts`. Un
     * archivo que construye, ÉL MISMO, más de `maxInstantiationFanoutConsidered`
     * tipos DISTINTOS actúa como ensamblador/composition-root (nest:
     * `nest-application.ts` construye `Injector`+`ApplicationConfig`+
     * `GuardsConsumer`+... en el mismo bootstrap) — sus sitios de construcción NO
     * cuentan como dispersión de negocio, mismo concepto que
     * `coupling-without-abstraction.ts#maxFanoutConsidered` aplica a dependencias.
     */
    function aggregatorSite(file: string, targetCount: number): { site: CodeGraphNode; targets: CodeGraphNode[]; edges: CodeGraphEdge[] } {
      const site = siteNode(file, ["bootstrap"]);
      const targets = Array.from({ length: targetCount }, (_, i) => classNode(`${file}-Other${i}.ts`, `Other${i}`));
      const edges = targets.map((t) => instantiateEdge(site, t));
      return { site, targets, edges };
    }

    it("un origen que construye MÁS tipos distintos que el piso no aporta sitio a NINGÚN tipo que construye (aggregator puro: todos sus sitios quedan excluidos)", () => {
      const target = classNode("shared/Widget.ts", "Widget");
      // SÉPTIMO/OCTAVO CASO: miembro propio + cadena de identidad para que la
      // única razón de "0" en juego acá sea el filtro de aggregator que este
      // test ejercita, no alguno de los otros dos.
      const { member, edge: memberEdge } = ownMethodEdge(target);
      const { binding, reader, storesEdge, readEdge } = identityChainEdges(target);
      // minSites-1 sitios normales (no alcanzan el piso solos) + 1 origen agregador
      // que construye Widget ADEMÁS de más tipos que el piso de fan-out.
      const normalSites = Array.from({ length: MIN_SITES.value - 1 }, (_, i) => siteNode(`normal${i}.ts`, ["run"]));
      const aggregator = aggregatorSite("aggregator.ts", MAX_INSTANTIATION_FANOUT.value + 1);
      const graph = graphOf(
        [target, member, binding, reader, ...normalSites, aggregator.site, ...aggregator.targets],
        [
          memberEdge,
          storesEdge,
          readEdge,
          ...normalSites.map((s) => instantiateEdge(s, target)),
          instantiateEdge(aggregator.site, target),
          ...aggregator.edges,
        ],
      );
      // Sin la exclusión: minSites-1 (normales) + 1 (aggregator) === minSites, dispararía.
      // Con la exclusión: el aggregator se descarta como sitio de Widget -> queda en minSites-1, no dispara.
      expect(run(graph)).toHaveLength(0);
    });

    it("control positivo: el mismo origen, con fan-out JUSTO EN el piso (no por encima), SÍ aporta sitio — el piso es un techo, no una prohibición de construir más de un tipo", () => {
      const target = classNode("shared/Widget.ts", "Widget");
      // SÉPTIMO/OCTAVO CASO (ver docstring del módulo): este test no construye
      // `target` vía `scatteredGraph` (arma su propio grafo a mano, como el
      // resto de este describe), así que necesita su propio miembro propio y
      // su propia cadena de identidad para no chocar con esos dos filtros —
      // no son lo que este test ejercita.
      const { member, edge: memberEdge } = ownMethodEdge(target);
      const { binding, reader, storesEdge, readEdge } = identityChainEdges(target);
      const normalSites = Array.from({ length: MIN_SITES.value - 1 }, (_, i) => siteNode(`normal${i}.ts`, ["run"]));
      // fan-out === piso (no lo excede) -> cuenta como sitio "normal" de Widget.
      const atCeiling = aggregatorSite("at-ceiling.ts", MAX_INSTANTIATION_FANOUT.value - 1);
      const graph = graphOf(
        [target, member, binding, reader, ...normalSites, atCeiling.site, ...atCeiling.targets],
        [
          memberEdge,
          storesEdge,
          readEdge,
          ...normalSites.map((s) => instantiateEdge(s, target)),
          instantiateEdge(atCeiling.site, target),
          ...atCeiling.edges,
        ],
      );
      expect(run(graph)).toHaveLength(1);
    });

    it("control negativo: dispersión genuina SIN ningún origen agregador sigue disparando (la exclusión no apaga el caso normal)", () => {
      const target = classNode("shapes/Foo.ts", "Foo");
      const graph = scatteredGraph(target, MIN_SITES.value);
      expect(run(graph)).toHaveLength(1);
    });

    it("el piso (medido: p90≈5-6 de fan-out de instanciación por archivo en nest y en hugo) se pide a testContext: no hay número suelto en el test", () => {
      expect(MAX_INSTANTIATION_FANOUT.kind).toBe("piso-declarado");
      expect(MAX_INSTANTIATION_FANOUT.value).toBeGreaterThan(0);
    });
  });

  it("sin grafo: detector.run devuelve [] de forma defensiva (run.ts ya reporta 'sin-grafo' antes de llegar acá)", () => {
    const repo = repoWith(null);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(0);
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const target = classNode("Foo.ts", "Foo");
    const graph = scatteredGraph(target, 6);
    const repo = repoWith(graph);
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(1);
  });

  it("hoy, sin ninguna arista `instantiates` en el grafo (ver docstring: EDGE_EXTRACTORS no tiene llamador de producción), el detector devuelve 0 — brecha reportada, no esta prueba la que la tapa", () => {
    // Mismo grafo que vería este detector en CUALQUIER repo real hoy: sólo
    // `references`/`contains`, nunca `instantiates` (verificado por grep en
    // `graph/build.ts`, ver el docstring del módulo). Este test DOCUMENTA la
    // brecha en vez de esconderla: `needsEdges`/`sin-aristas` (CONTRATO-F4.md
    // §4.3) no existe todavía en `detect/types.ts`, así que hoy esto es
    // indistinguible, para el runner, de "no hay dispersión".
    const a = { id: fileNodeId("a.ts"), kind: "file" as const, file: "a.ts", symbolPath: [] };
    const b = { id: fileNodeId("b.ts"), kind: "file" as const, file: "b.ts", symbolPath: [] };
    const graph = graphOf([a, b], [{ from: a.id, to: b.id, kind: "references", provenance: "declared", weight: 1 }]);
    expect(run(graph)).toHaveLength(0);
  });
});
