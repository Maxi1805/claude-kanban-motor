/**
 * `hypotheses/singleton.ts` — Ola 10 (CONTRATO-F10.md). Reescrito sobre grafos
 * SINTÉTICOS mínimos, mismo estilo que `wrapping-chain.test.ts`/`facade.test.ts`
 * (nodos/aristas a mano, sin `analyzeRepo`/parser real) — el ancla
 * (`scattered-instantiation`) sigue siendo la misma, así que `scatteredFinding`
 * se mantiene, pero el GRAFO ahora es la única fuente de verdad para
 * accessor/ranura de instancia/constructor/confinamiento: el `Finding` ancla
 * sólo aporta `className`/`file` (y, para el discriminador de dispersión, su
 * propio `trigger`) — decoupling deliberado, igual que
 * `facade.test.ts#orderFacadeGraph` desacopla su `Finding` sintético del
 * grafo que en verdad ejercita la forma bajo prueba.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding, RoleLocation } from "../detect/types.js";
import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis } from "./singleton.js";
import type { HypothesisContext } from "./types.js";

const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function threshold(minSites: number): Threshold {
  return resolveThreshold(pisoDeclarado(minSites, { rationale: "test" }), {
    language: "*",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

/** Mismo shape que produce `buildScatteredInstantiationFindings` — target +
 *  N sitios, con los roles EXACTOS que esa función emite (verificado ahí).
 *  Ola 10: estos `siteFiles` ya NO deciden confinamiento/puenteo — eso es un
 *  hecho de GRAFO ahora (`externalInstantiateFiles`) — sólo alimentan el
 *  discriminador de dispersión (`distinctSites`/`minSitesThreshold`). */
function scatteredFinding(opts: { className: string; targetFile: string; siteFiles: readonly string[]; minSites?: number }): Finding {
  const minSites = opts.minSites ?? 6;
  const target: RoleLocation = {
    file: opts.targetFile,
    startLine: 1,
    endLine: 10,
    symbol: opts.className,
    role: `tipo construido directamente desde ${opts.siteFiles.length} archivos distintos`,
  };
  const sites: RoleLocation[] = opts.siteFiles.map((f) => ({
    file: f,
    startLine: 1,
    endLine: 1,
    role: "sitio de instanciación directa",
  }));
  return {
    id: "scattered-instantiation:1",
    detectorId: "scattered-instantiation",
    kind: "scattered-instantiation",
    scope: "inter-file",
    language: null,
    title: `"${opts.className}" se construye directamente`,
    detail: "detalle",
    trigger: [{ label: "archivos distintos", value: opts.siteFiles.length, threshold: threshold(minSites) }],
    locations: [target, ...sites],
    severity: 60,
    advice: { primary: { name: "Replace Constructor with Factory Method", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function symbolNode(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, startLine: 2, endLine: 8, ...overrides };
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight: 1, ...overrides };
}

function containsAll(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
  return memberIds.map((m) => edge(ownerId, m, "contains"));
}

function graphWith(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_RESOLUTION };
}

function ctxWith(capabilities: readonly Capability[] = []): HypothesisContext {
  return {
    file: null,
    fileAt: () => null,
    repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
    capabilities: new Set(capabilities),
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
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

const SIX_SITES = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"];

/**
 * Réplica de la forma EXACTA de `fixtures-multi/singleton/typescript.ts`:
 *
 *   class AppConfig {
 *     private static instance: AppConfig | null = null;
 *     private loadedAt: number;
 *     private constructor() { this.loadedAt = Date.now(); }
 *     static getInstance(): AppConfig { AppConfig.instance ||= new AppConfig(); return AppConfig.instance; }
 *   }
 *
 * MEDIDO por lectura directa de `graph/symbols.ts` (no supuesto): TypeScript
 * SÍ expone `accessibility_modifier`, así que `private`/`static` producen
 * `visibility` real en el grafo — es, de las 6 variantes de lenguaje de esa
 * fixture, la ÚNICA con slot de visibilidad real sobre el constructor (ver
 * docstring de `singleton.ts`). `externalCaller` es OPCIONAL: sin él, cero
 * `instantiates` externos ⇒ confinado (la fixture real no tiene caller
 * externo tampoco). Con él, se agrega un archivo que construye `AppConfig`
 * directamente desde afuera (bypass).
 */
function tsAppConfigGraph(opts: { externalCaller?: boolean } = {}): CodeGraph {
  const file = "app-config.ts";
  const cls = symbolNode(file, ["AppConfig"], { family: "class-like" });
  const instanceField = symbolNode(file, ["AppConfig", "instance"], { family: "other" });
  const loadedAtField = symbolNode(file, ["AppConfig", "loadedAt"], { family: "other" });
  const ctor = symbolNode(file, ["AppConfig", "constructor"], { family: "function-like", arity: 0, visibility: "private" });
  const getInstance = symbolNode(file, ["AppConfig", "getInstance"], { family: "function-like", arity: 0 }); // sin modificador ⇒ visibility ausente, per contrato "pública o ausente"

  const nodes: CodeGraphNode[] = [cls, instanceField, loadedAtField, ctor, getInstance];
  const edges: CodeGraphEdge[] = [...containsAll(cls.id, [instanceField.id, loadedAtField.id, ctor.id, getInstance.id])];

  if (opts.externalCaller) {
    const otherFile = "reset-for-tests.ts";
    const externalFn = symbolNode(otherFile, ["resetAppConfig"], { family: "function-like", arity: 0 });
    nodes.push(externalFn);
    edges.push(edge(externalFn.id, cls.id, "instantiates"));
  }

  return graphWith(nodes, edges);
}

/**
 * Misma forma EXACTA, pero sin ningún slot de visibilidad — mismo texto que
 * `fixtures-multi/singleton/javascript.js`/`vue.vue`: JS puro nunca expone
 * modificador de visibilidad (`graph/symbols.ts#computeVisibility`), así que
 * el `constructor()` sale con `visibility: undefined` aunque la intención de
 * privacidad sea idéntica a la variante TypeScript.
 */
function jsAppConfigGraph(): CodeGraph {
  const file = "app-config.js";
  const cls = symbolNode(file, ["AppConfig"], { family: "class-like" });
  const instanceField = symbolNode(file, ["AppConfig", "instance"], { family: "other" });
  const ctor = symbolNode(file, ["AppConfig", "constructor"], { family: "function-like", arity: 0 }); // sin visibility: JS no tiene el nodo
  const getInstance = symbolNode(file, ["AppConfig", "getInstance"], { family: "function-like", arity: 0 });
  const nodes: CodeGraphNode[] = [cls, instanceField, ctor, getInstance];
  const edges: CodeGraphEdge[] = [...containsAll(cls.id, [instanceField.id, ctor.id, getInstance.id])];
  return graphWith(nodes, edges);
}

describe("hypotheses/singleton", () => {
  it("id/pattern/anchors — cuelga SOLO de scattered-instantiation, sin ancla propia", () => {
    expect(hypothesis.id).toBe("singleton");
    expect(hypothesis.pattern).toBe("Singleton");
    expect(hypothesis.anchors).toEqual(["scattered-instantiation"]);
  });

  it("grafo null ⇒ null (no hay dato para siquiera localizar el tipo — required falla)", () => {
    const finding = scatteredFinding({ className: "Foo", targetFile: "shapes/Foo.ts", siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, null, ctxWith());
    expect(h).toBeNull();
  });

  it("tipo no localizable en el grafo (nombre no coincide con ningún nodo class-like) ⇒ null", () => {
    const finding = scatteredFinding({ className: "Foo", targetFile: "shapes/Foo.ts", siteFiles: SIX_SITES });
    const graph = graphWith([symbolNode("shapes/Other.ts", ["Bar"], { family: "class-like" })], []);
    const h = hypothesis.build(finding, graph, ctxWith());
    expect(h).toBeNull();
  });

  // ── Ola 10: las cuatro formas ───────────────────────────────────────────

  it("AUSENTE: ningún miembro accessor de aridad 0 (sólo la dispersión del ancla) ⇒ SUGIERE — CAMBIO respecto de la versión F6, que acá devolvía null (silencio)", () => {
    const finding = scatteredFinding({ className: "Foo", targetFile: "shapes/Foo.ts", siteFiles: SIX_SITES });
    const cls = symbolNode("shapes/Foo.ts", ["Foo"], { family: "class-like" });
    const draw = symbolNode("shapes/Foo.ts", ["Foo", "draw"], { family: "function-like", arity: 2 });
    const graph = graphWith([cls, draw], containsAll(cls.id, [draw.id]));
    const h = hypothesis.build(finding, graph, ctxWith())!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
    expect(h.confidence).not.toBeNull();
    expect(h.missingCapabilities).toEqual([]);
    expect(h.anchorFindingId).toBe(finding.id);
    const accessorCheck = h.checks.find((c) => c.label.includes("existe-accessor-arity0"))!;
    expect(accessorCheck.passed).toBe(false);
  });

  it("PARCIAL: accessor + ranura de instancia existen, pero el lenguaje no expone visibilidad (JS) ⇒ ctorCheck falla DECLARANDO por qué, nunca adivina", () => {
    const finding = scatteredFinding({ className: "AppConfig", targetFile: "app-config.js", siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, jsAppConfigGraph(), ctxWith([]))!; // sin capacidad "visibilidad"
    expect(h.state).toBe("parcial");
    expect(h.confidence).not.toBeNull();
    const ctorCheck = h.checks.find((c) => c.label.includes("constructor-realmente-privado"))!;
    expect(ctorCheck.passed).toBe(false);
    expect(ctorCheck.why).toContain("no expone");
    const instanceSlotCheck = h.checks.find((c) => c.label.includes("existe-ranura-de-instancia"))!;
    expect(instanceSlotCheck.passed).toBe(true);
  });

  it("PARCIAL: visibilidad SÍ disponible en el lenguaje, pero no se identificó ningún constructor ⇒ declara 'no se identificó', no confunde con 'no aplica'", () => {
    const file = "app-config.ts";
    const cls = symbolNode(file, ["AppConfig"], { family: "class-like" });
    const instanceField = symbolNode(file, ["AppConfig", "instance"], { family: "other" });
    const getInstance = symbolNode(file, ["AppConfig", "getInstance"], { family: "function-like", arity: 0 });
    const graph = graphWith([cls, instanceField, getInstance], containsAll(cls.id, [instanceField.id, getInstance.id]));
    const finding = scatteredFinding({ className: "AppConfig", targetFile: file, siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, graph, ctxWith(["visibilidad"]))!;
    expect(h.state).toBe("parcial");
    const ctorCheck = h.checks.find((c) => c.label.includes("constructor-realmente-privado"))!;
    expect(ctorCheck.passed).toBe(false);
    expect(ctorCheck.why).toContain("No se identificó");
  });

  it("PARCIAL: constructor identificado pero su visibilidad es pública, no private/internal ⇒ 'la unicidad es convención, no garantía'", () => {
    const file = "app-config.ts";
    const cls = symbolNode(file, ["AppConfig"], { family: "class-like" });
    const instanceField = symbolNode(file, ["AppConfig", "instance"], { family: "other" });
    const ctor = symbolNode(file, ["AppConfig", "constructor"], { family: "function-like", arity: 0, visibility: "public" });
    const getInstance = symbolNode(file, ["AppConfig", "getInstance"], { family: "function-like", arity: 0 });
    const graph = graphWith([cls, instanceField, ctor, getInstance], containsAll(cls.id, [instanceField.id, ctor.id, getInstance.id]));
    const finding = scatteredFinding({ className: "AppConfig", targetFile: file, siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, graph, ctxWith(["visibilidad"]))!;
    expect(h.state).toBe("parcial");
    const ctorCheck = h.checks.find((c) => c.label.includes("constructor-realmente-privado"))!;
    expect(ctorCheck.passed).toBe(false);
    expect(ctorCheck.why).toContain("convención");
  });

  it("PARCIAL: accessor + constructor privado, pero SIN ninguna ranura de family \"other\" ⇒ no asciende a completa", () => {
    const file = "app-config.ts";
    const cls = symbolNode(file, ["AppConfig"], { family: "class-like" });
    const ctor = symbolNode(file, ["AppConfig", "constructor"], { family: "function-like", arity: 0, visibility: "private" });
    const getInstance = symbolNode(file, ["AppConfig", "getInstance"], { family: "function-like", arity: 0 });
    const graph = graphWith([cls, ctor, getInstance], containsAll(cls.id, [ctor.id, getInstance.id]));
    const finding = scatteredFinding({ className: "AppConfig", targetFile: file, siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, graph, ctxWith(["visibilidad"]))!;
    expect(h.state).toBe("parcial");
    const instanceSlotCheck = h.checks.find((c) => c.label.includes("existe-ranura-de-instancia"))!;
    expect(instanceSlotCheck.passed).toBe(false);
  });

  it("YA-APLICADO sobre la MISMA forma que la fixture canónica fixtures-multi/singleton/typescript.ts — nunca sugiere, confidence null", () => {
    const finding = scatteredFinding({ className: "AppConfig", targetFile: "app-config.ts", siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, tsAppConfigGraph(), ctxWith(["visibilidad"]))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull(); // información positiva, nunca una sugerencia (regla 1 de la tarea)
    const [accessorCheck, instanceSlotCheck, ctorCheck, confinementCheck] = h.checks.filter((c) => c.role === "applied");
    expect(accessorCheck!.passed).toBe(true);
    expect(instanceSlotCheck!.passed).toBe(true);
    expect(ctorCheck!.passed).toBe(true);
    expect(confinementCheck!.passed).toBe(true);
  });

  it("YA-APLICADO nunca compite en el ranking incluso con severity alta en el hallazgo ancla", () => {
    const finding: Finding = { ...scatteredFinding({ className: "AppConfig", targetFile: "app-config.ts", siteFiles: SIX_SITES }), severity: 95 };
    const h = hypothesis.build(finding, tsAppConfigGraph(), ctxWith(["visibilidad"]))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
  });

  it("APLICADO-ELUDIDO: misma forma completa, PERO ≥1 archivo externo instancia el tipo directamente (bypass real, hecho de grafo) ⇒ alerta de fuga, no sugerencia", () => {
    const finding = scatteredFinding({ className: "AppConfig", targetFile: "app-config.ts", siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, tsAppConfigGraph({ externalCaller: true }), ctxWith(["visibilidad"]))!;
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull();
    const confinementCheck = h.checks.find((c) => c.label.includes("instanciacion-confinada"))!;
    expect(confinementCheck.passed).toBe(false);
    expect(confinementCheck.why).toContain("reset-for-tests.ts");
    expect(h.places.some((p) => p.file === "reset-for-tests.ts" && p.role === "cliente que construye directamente, puenteando el accessor candidato")).toBe(true);
  });

  it("el confinamiento/puenteo se decide por ARISTAS `instantiates` del grafo, no por los `siteFiles` del Finding ancla — misma forma con distintos siteFiles da el mismo resultado", () => {
    const finding = scatteredFinding({ className: "AppConfig", targetFile: "app-config.ts", siteFiles: ["z1.ts", "z2.ts", "z3.ts", "z4.ts", "z5.ts", "z6.ts"] });
    const h = hypothesis.build(finding, tsAppConfigGraph(), ctxWith(["visibilidad"]))!;
    expect(h.state).toBe("ya-aplicado"); // el Finding "dice" que hay 6 sitios dispersos, pero el GRAFO no tiene ningún `instantiates` externo real
  });

  it("aristas `instantiates` con provenance 'inferred' o 'ambiguous' NO cuentan como puenteo (misma exclusión que el propio ancla)", () => {
    const file = "app-config.ts";
    const base = tsAppConfigGraph();
    const otherFile = "guess.ts";
    const guesser = symbolNode(otherFile, ["maybeMakesOne"], { family: "function-like", arity: 0 });
    const clsId = symbolNodeId(file, ["AppConfig"]);
    const graph = graphWith(
      [...base.nodes, guesser],
      [...base.edges, edge(guesser.id, clsId, "instantiates", { provenance: "inferred" })],
    );
    const finding = scatteredFinding({ className: "AppConfig", targetFile: file, siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, graph, ctxWith(["visibilidad"]))!;
    expect(h.state).toBe("ya-aplicado");
  });

  // ── Ola U (PLAN-INTENCIONES.md §1): forma canónica INSTANCE-como-CAMPO ──

  /**
   * Réplica de la forma EXACTA de
   * `guava/guava/src/com/google/common/reflect/TypeResolver.java:470-482`
   * (`WildcardCapturer`, verificado abriendo el archivo real):
   *
   *   private static class WildcardCapturer {
   *     static final WildcardCapturer INSTANCE = new WildcardCapturer();
   *     private final AtomicInteger id;
   *     private WildcardCapturer() { this(new AtomicInteger()); }
   *     private WildcardCapturer(AtomicInteger id) { this.id = id; }
   *     final Type capture(Type type) { ... }
   *   }
   *
   * Campo `INSTANCE` público (sin modificador ⇒ visibility ausente en el
   * grafo, ver docstring del módulo), campo `id` también `family: "other"`
   * (dato interno — MISMA forma de grafo que `INSTANCE`, el grafo no puede
   * distinguirlos, ver docstring de `scanMembers`), constructor `private`
   * (la fixture real tiene DOS sobrecargados, ambos `private` — un solo
   * nodo alcanza para probar `hasPrivateConstructor`, y `symbolNodeId` sólo
   * usa `file`+`symbolPath`, así que dos miembros con el mismo nombre
   * colisionarían de id en este grafo sintético), CERO método de aridad 0
   * en la clase (`capture` tiene aridad 1). Usado en `:494` como
   * `WildcardCapturer.INSTANCE.capture(...)`, ningún `new WildcardCapturer()`
   * fuera de la clase (verificado con `grep`, esta tarea).
   */
  function wildcardCapturerGraph(): CodeGraph {
    const file = "TypeResolver.java";
    const cls = symbolNode(file, ["WildcardCapturer"], { family: "class-like" });
    const instanceField = symbolNode(file, ["WildcardCapturer", "INSTANCE"], { family: "other" });
    const idField = symbolNode(file, ["WildcardCapturer", "id"], { family: "other" });
    const ctor = symbolNode(file, ["WildcardCapturer", "WildcardCapturer"], { family: "function-like", arity: 0, visibility: "private" });
    const capture = symbolNode(file, ["WildcardCapturer", "capture"], { family: "function-like", arity: 1 });
    const nodes: CodeGraphNode[] = [cls, instanceField, idField, ctor, capture];
    const edges: CodeGraphEdge[] = [...containsAll(cls.id, [instanceField.id, idField.id, ctor.id, capture.id])];
    return graphWith(nodes, edges);
  }

  it("YA-APLICADO — WildcardCapturer de guava (INSTANCE como CAMPO, sin getInstance()): antes caía a AUSENTE porque scanMembers nunca miraba family:\"other\" como accessor — CORREGIDO esta ola", () => {
    const finding = scatteredFinding({ className: "WildcardCapturer", targetFile: "TypeResolver.java", siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, wildcardCapturerGraph(), ctxWith(["visibilidad"]))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const accessorCheck = h.checks.find((c) => c.label.includes("existe-accessor-arity0"))!;
    expect(accessorCheck.passed).toBe(true);
    expect(accessorCheck.why).toContain("INSTANCE");
    expect(h.places.some((p) => p.symbol === "INSTANCE" && p.role.includes("accessor candidato"))).toBe(true);
  });

  it("el accessor de CAMPO es de RESPALDO: si además hay un método getInstance(), el campo NO se agrega como candidato extra (preserva accessor-unico)", () => {
    const finding = scatteredFinding({ className: "AppConfig", targetFile: "app-config.ts", siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, tsAppConfigGraph(), ctxWith(["visibilidad"]))!;
    const accessorCheck = h.checks.find((c) => c.label.includes("existe-accessor-arity0"))!;
    // Sólo "getInstance" — "instance"/"loadedAt" (family "other") NO entran
    // porque ya hay un accessor de método.
    expect(accessorCheck.why).toContain("getInstance");
    expect(accessorCheck.why).not.toContain("loadedAt");
  });

  it("un campo público SIN constructor privado NO cuenta como accessor — un dato público cualquiera no prueba intención de instancia única", () => {
    const file = "config.ts";
    const cls = symbolNode(file, ["Config"], { family: "class-like" });
    const versionField = symbolNode(file, ["Config", "version"], { family: "other" });
    const graph = graphWith([cls, versionField], containsAll(cls.id, [versionField.id]));
    const finding = scatteredFinding({ className: "Config", targetFile: file, siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, graph, ctxWith(["visibilidad"]))!;
    expect(h.state).toBe("ausente"); // sin constructor privado, el campo no es accessor candidato
    const accessorCheck = h.checks.find((c) => c.label.includes("existe-accessor-arity0"))!;
    expect(accessorCheck.passed).toBe(false);
  });

  // ── discriminadores / techo / evidencia ─────────────────────────────────

  it("discriminador 'accessor-unico': exactamente un candidato sube el peldaño", () => {
    const finding = scatteredFinding({ className: "AppConfig", targetFile: "app-config.ts", siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, tsAppConfigGraph(), ctxWith(["visibilidad"]))!;
    const d = h.discriminators.find((c) => c.label.includes("accessor-unico"))!;
    expect(d.passed).toBe(true);
  });

  it("discriminador 'dispersion-muy-por-encima-del-piso': se evalúa incluso cuando el estado no es una oportunidad (ya-aplicado)", () => {
    const finding = scatteredFinding({
      className: "AppConfig",
      targetFile: "app-config.ts",
      siteFiles: [...SIX_SITES, "g.ts", "h.ts", "i.ts", "j.ts", "k.ts", "l.ts"], // 12 vs piso 6 ⇒ 2x
    });
    const h = hypothesis.build(finding, tsAppConfigGraph(), ctxWith(["visibilidad"]))!;
    const d = h.discriminators.find((c) => c.label.includes("piso"))!;
    expect(d.passed).toBe(true);
  });

  it("ceiling nunca supera 'media'", () => {
    const finding = scatteredFinding({
      className: "AppConfig",
      targetFile: "app-config.ts",
      siteFiles: [...SIX_SITES, "g.ts", "h.ts", "i.ts", "j.ts", "k.ts", "l.ts"],
    });
    const graph = graphWith(
      [symbolNode("app-config.ts", ["AppConfig"], { family: "class-like" }), symbolNode("app-config.ts", ["AppConfig", "getInstance"], { family: "function-like", arity: 0 })],
      containsAll(symbolNodeId("app-config.ts", ["AppConfig"]), [symbolNodeId("app-config.ts", ["AppConfig", "getInstance"])]),
    );
    const h = hypothesis.build(finding, graph, ctxWith(["visibilidad"]))!;
    expect(h.ceiling).toBe("media");
    expect(h.confidence === null || h.confidence === "media" || h.confidence === "baja").toBe(true);
  });

  it("evidence SIEMPRE no-vacía en cada check y discriminador, también cuando passed=false", () => {
    const finding = scatteredFinding({ className: "AppConfig", targetFile: "app-config.js", siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, jsAppConfigGraph(), ctxWith([]))!;
    for (const c of [...h.checks, ...h.discriminators]) {
      expect(c.why.length).toBeGreaterThan(0);
    }
  });

  it("forma en lenguaje SIN clases (Go, réplica de fixtures-multi/singleton/go.go): el accessor de PAQUETE (`GetSite`) NO cuelga de `Site` vía `contains` (container:[] ⇒ hijo del ARCHIVO, no del struct) ⇒ CERO miembros visibles ⇒ null — CORREGIDO (esta tarea): antes esto era 'ausente' con confidence no nula (SUGERÍA Singleton) pese a que la búsqueda de accessor NUNCA PUDO MIRAR ni un solo miembro de T; medido en hugo real, 7 hipótesis Singleton falsas sobre structs de VALOR de Go con exactamente esta forma (`todos los hijos contains directos: 0`) — ver TABLA-ARISTAS.md §6 y el nuevo `typeHasAnyMember` required check.", () => {
    const file = "pkg/site.go";
    const cls = symbolNode(file, ["Site"], { family: "class-like" });
    const getSite = symbolNode(file, ["GetSite"], { family: "function-like", arity: 0 });
    const graph = graphWith([cls, getSite], []); // sin `contains` cls->getSite: es exactamente lo que `graph/build.ts` produce para Go
    const finding = scatteredFinding({ className: "Site", targetFile: file, siteFiles: SIX_SITES });
    const h = hypothesis.build(finding, graph, ctxWith());
    // CERO hijos `contains` de `Site` en el grafo ⇒ `typeHasAnyMember` (required) no se cumple ⇒
    // ni siquiera candidata (misma semántica que "grafo null"/"tipo no localizable" arriba):
    // sin UN SOLO hecho que mirar, "ausente" ya no se afirma — silencio honesto, no una sugerencia
    // sobre una búsqueda que nunca pudo empezar.
    expect(h).toBeNull();
  });

  it("réplica directa del caso real medido en hugo (PageGroup — 'represents a group of pages'): struct de VALOR con `instantiates` disperso, sin NINGÚN hijo `contains` (grafo real de hugo, verificado con sonda ad-hoc esta tarea) ⇒ null, ya no 7 falsos 'ausente'", () => {
    const file = "resources/page/pagegroup.go";
    const cls = symbolNode(file, ["PageGroup"], { family: "class-like" });
    // El grafo real de hugo no anida NI SIQUIERA los campos (Key, Pages) como
    // `contains` de PageGroup — verificado con sonda ad-hoc sobre el grafo de
    // producción, esta tarea (0 hijos `contains` para los 7 casos falsos).
    const graph = graphWith([cls], []);
    const finding = scatteredFinding({ className: "PageGroup", targetFile: file, siteFiles: ["a.go", "b.go", "c.go", "d.go"], minSites: 3 });
    const h = hypothesis.build(finding, graph, ctxWith());
    expect(h).toBeNull();
  });

  it("required 'tipo-tiene-algun-miembro-visible': T con UN miembro cualquiera (aunque no sea accessor) SIGUE pasando el gate ⇒ sigue sugiriendo 'ausente' — el gate nuevo sólo saca del juego el CERO absoluto, no reemplaza el chequeo de accessor existente", () => {
    const finding = scatteredFinding({ className: "Foo", targetFile: "shapes/Foo.ts", siteFiles: SIX_SITES });
    const cls = symbolNode("shapes/Foo.ts", ["Foo"], { family: "class-like" });
    const draw = symbolNode("shapes/Foo.ts", ["Foo", "draw"], { family: "function-like", arity: 2 });
    const graph = graphWith([cls, draw], containsAll(cls.id, [draw.id]));
    const h = hypothesis.build(finding, graph, ctxWith())!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
    const memberGate = h.checks.find((c) => c.label.includes("tipo-tiene-algun-miembro-visible"))!;
    expect(memberGate.passed).toBe(true);
  });
});
