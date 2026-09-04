import { describe, expect, it } from "vitest";

import { buildCouplingWithoutAbstractionFindings, detector } from "./coupling-without-abstraction.js";
import { testContext } from "../testing.js";
import type { RepoUnit } from "../types.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: igual que `dependency-cycle.test.ts`, no
 * hace falta tree-sitter — el detector sólo lee `RepoUnit.graph`, así que el
 * grafo se arma a mano. "≥3 lenguajes que emiten" no aplica: el detector no
 * clasifica por lenguaje (opera sobre la forma del grafo entre archivos);
 * `language` en `FileSummary` sólo entra para la reducción de severidad en
 * Java, cubierta por un test dedicado más abajo.
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"] = "references", provenance: Provenance = "declared"): CodeGraphEdge {
  return { from: fileNodeId(from), to: fileNodeId(to), kind, provenance, weight: 1 };
}

function graphOf(files: readonly string[], edges: readonly CodeGraphEdge[], extraNodes: readonly CodeGraphNode[] = []): CodeGraph {
  return {
    nodes: [...files.map(fileNode), ...extraNodes],
    edges,
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

function repoWith(
  files: readonly { path: string; language?: string }[],
  edges: readonly CodeGraphEdge[],
  lines = 20,
  extraNodes: readonly CodeGraphNode[] = [],
): RepoUnit {
  return {
    repoName: "test",
    files: files.map((f) => ({ path: f.path, lines, language: f.language ?? "typescript" })),
    functions: [],
    clones: [],
    graph: graphOf(
      files.map((f) => f.path),
      edges,
      extraNodes,
    ),
  };
}

/**
 * Ver "¿HACEN LO MISMO?" en el docstring de `coupling-without-abstraction.ts`: desde ese
 * cambio, un par sólo dispara si AMBOS extremos declaran, cada uno, un símbolo `class-like`
 * de primer nivel con al menos un miembro (fuera de `constructor`) de nombre compartido. Esta
 * fixture arma exactamente esa forma para dos archivos — un símbolo `class-like` con UN
 * miembro `function-like` de nombre `sharedMethod` en cada uno — y las aristas `contains`
 * (archivo -> clase -> miembro) que la hacen visible sin resolución cross-archivo.
 */
function sharedOperationFixture(a: string, b: string, methodName = "sharedMethod"): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  for (const file of [a, b]) {
    const classId = symbolNodeId(file, ["Impl"]);
    const methodId = symbolNodeId(file, ["Impl", methodName]);
    nodes.push(
      { id: classId, kind: "symbol", file, symbolPath: ["Impl"], family: "class-like" },
      { id: methodId, kind: "symbol", file, symbolPath: ["Impl", methodName], family: "function-like" },
    );
    edges.push(
      { from: fileNodeId(file), to: classId, kind: "contains", provenance: "declared", weight: 1 },
      { from: classId, to: methodId, kind: "contains", provenance: "declared", weight: 1 },
    );
  }
  return { nodes, edges };
}

/**
 * OLA O — una unidad declarante ANIDADA: `containerPath` son los contenedores desde el
 * archivo hasta la clase (el último elemento es la clase; los anteriores son
 * `namespace-like`, la forma de `namespace X { class Y }` de C# y de `module X; class Y`
 * de Ruby). Con `containerPath` de un solo elemento queda una clase de primer nivel.
 */
function nestedUnitFixture(file: string, containerPath: readonly string[], methodNames: readonly string[]): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  let parentId = fileNodeId(file);
  containerPath.forEach((segment, i) => {
    const path = containerPath.slice(0, i + 1);
    const id = symbolNodeId(file, path);
    nodes.push({ id, kind: "symbol", file, symbolPath: [...path], family: i === containerPath.length - 1 ? "class-like" : "namespace-like" });
    edges.push({ from: parentId, to: id, kind: "contains", provenance: "declared", weight: 1 });
    parentId = id;
  });
  for (const method of methodNames) {
    const path = [...containerPath, method];
    const id = symbolNodeId(file, path);
    nodes.push({ id, kind: "symbol", file, symbolPath: path, family: "function-like" });
    edges.push({ from: parentId, to: id, kind: "contains", provenance: "declared", weight: 1 });
  }
  return { nodes, edges };
}

/**
 * OLA O — el ARCHIVO COMO MÓDULO: funciones declaradas al nivel del archivo, fuera de toda
 * clase (el método con receptor de Go, el módulo de funciones de JS/Python). `nestedNames`
 * cuelga de la PRIMERA función, para probar que un closure no es una operación expuesta.
 */
function moduleUnitFixture(file: string, fnNames: readonly string[], nestedNames: readonly string[] = []): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  fnNames.forEach((fn, i) => {
    const id = symbolNodeId(file, [fn]);
    nodes.push({ id, kind: "symbol", file, symbolPath: [fn], family: "function-like" });
    edges.push({ from: fileNodeId(file), to: id, kind: "contains", provenance: "declared", weight: 1 });
    if (i > 0) return;
    for (const nested of nestedNames) {
      const nestedId = symbolNodeId(file, [fn, nested]);
      nodes.push({ id: nestedId, kind: "symbol", file, symbolPath: [fn, nested], family: "function-like" });
      edges.push({ from: id, to: nestedId, kind: "contains", provenance: "declared", weight: 1 });
    }
  });
  return { nodes, edges };
}

/** OLA O — `count` archivos, cada uno con una unidad que declara `methodNames`: es lo que vuelve UBICUO a un nombre. */
function unitsDeclaring(prefix: string, count: number, methodNames: readonly string[]): { files: { path: string }[]; nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const files: { path: string }[] = [];
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  for (let i = 0; i < count; i++) {
    const path = `${prefix}${i}.ts`;
    files.push({ path });
    const unit = nestedUnitFixture(path, ["Otro"], methodNames);
    nodes.push(...unit.nodes);
    edges.push(...unit.edges);
  }
  return { files, nodes, edges };
}

/** N clientes, cada uno con una arista hacia `a` y hacia `b`. */
function coupledClientsEdges(clients: readonly string[], a: string, b: string): CodeGraphEdge[] {
  return clients.flatMap((c) => [edge(c, a), edge(c, b)]);
}

/**
 * Archivos de relleno SIN ninguna arista: existen sólo para que el TOTAL de
 * archivos del repo sea realista (como en el corpus real, de cientos/miles
 * de archivos) y `maxUbiquitousFanInRatio` no dispare por el tamaño
 * artificialmente chico de una fixture — un repo real de 3 clientes contra
 * 2 concreciones nunca tiene sólo 5 archivos en total.
 */
function filler(n: number, prefix = "filler"): { path: string }[] {
  return Array.from({ length: n }, (_, i) => ({ path: `${prefix}${i}.ts` }));
}

/**
 * Cuántos archivos de relleno hacen falta para que `depCount` dependientes
 * NUNCA se lean como "infraestructura ubicua" — se PIDE al umbral vigente
 * (nunca un número suelto, ver `MAX_UBIQUITOUS_RATIO` abajo), con un
 * márgen 2x para que el ratio resultante quede cómodo bajo el piso, no
 * pegado a él (JUICIO DE PRECISIÓN, `coupling-without-abstraction.ts`: el
 * piso bajó de 0.25 a 0.10 tras medir el corpus real, así que una fixture
 * calibrada a mano para el valor viejo deja de alcanzar con el nuevo).
 */
function safeFillerFor(depCount: number): { path: string }[] {
  const total = Math.ceil((depCount / MAX_UBIQUITOUS_RATIO) * 2);
  return filler(total);
}

const THRESHOLDS = testContext(detector, "*");
const MIN_CLIENTS = THRESHOLDS.threshold("minClients").value;
const MAX_UBIQUITOUS_RATIO = THRESHOLDS.threshold("maxUbiquitousFanInRatio").value;
const MAX_FANOUT = THRESHOLDS.threshold("maxFanoutConsidered").value;
const MIN_CLIENT_SHARE = THRESHOLDS.threshold("minClientShareOfFanIn").value;
const MIN_SHARED_OPERATIONS = THRESHOLDS.threshold("minSharedOperations").value;

function run(repo: RepoUnit) {
  return buildCouplingWithoutAbstractionFindings(
    repo,
    THRESHOLDS.threshold("minClients"),
    THRESHOLDS.threshold("maxUbiquitousFanInRatio"),
    THRESHOLDS.threshold("maxFanoutConsidered"),
    THRESHOLDS.threshold("minClientShareOfFanIn"),
    THRESHOLDS.threshold("minSharedOperations"),
    THRESHOLDS.threshold("minSharedProtocolShare"),
    THRESHOLDS.threshold("maxOperationUbiquity"),
    THRESHOLDS.threshold("minAbstractionProtocol"),
  );
}

describe("coupling-without-abstraction", () => {
  it(`${MIN_CLIENTS} clientes que dependen del mismo par sin abstracción: un hallazgo`, () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts");
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...shared.edges],
      20,
      shared.nodes,
    );
    const findings = run(repo);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("ConcreteA.ts");
    expect(findings[0]!.title).toContain("ConcreteB.ts");
    expect(findings[0]!.trigger[0]!.value).toBe(MIN_CLIENTS);
    expect(findings[0]!.trigger[1]!.value).toBe(1); // "sharedMethod", ver sharedOperationFixture
    expect(findings[0]!.locations[0]!.role).toBe("primera unidad concreta del par acoplado");
    expect(findings[0]!.locations[1]!.role).toBe("segunda unidad concreta del par acoplado");
    expect(findings[0]!.locations[2]!.role).toBe("cliente que depende de ambas unidades sin que nada las una");
  });

  it("control negativo: co-ocurrencia concentrada pero NINGÚN símbolo class-like en ninguno de los dos extremos — no dispara (co-ocurrir no es acoplarse)", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"),
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("control negativo: AMBOS extremos son class-like pero no comparten NINGÚN método declarado (dos responsabilidades ortogonales) — no dispara", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const nodes: CodeGraphNode[] = [
      { id: symbolNodeId("ConcreteA.ts", ["Cycles"]), kind: "symbol", file: "ConcreteA.ts", symbolPath: ["Cycles"], family: "class-like" },
      {
        id: symbolNodeId("ConcreteA.ts", ["Cycles", "detectCycles"]),
        kind: "symbol",
        file: "ConcreteA.ts",
        symbolPath: ["Cycles", "detectCycles"],
        family: "function-like",
      },
      { id: symbolNodeId("ConcreteB.ts", ["Rank"]), kind: "symbol", file: "ConcreteB.ts", symbolPath: ["Rank"], family: "class-like" },
      {
        id: symbolNodeId("ConcreteB.ts", ["Rank", "computeRank"]),
        kind: "symbol",
        file: "ConcreteB.ts",
        symbolPath: ["Rank", "computeRank"],
        family: "function-like",
      },
    ];
    const containsEdges: CodeGraphEdge[] = [
      { from: fileNodeId("ConcreteA.ts"), to: symbolNodeId("ConcreteA.ts", ["Cycles"]), kind: "contains", provenance: "declared", weight: 1 },
      {
        from: symbolNodeId("ConcreteA.ts", ["Cycles"]),
        to: symbolNodeId("ConcreteA.ts", ["Cycles", "detectCycles"]),
        kind: "contains",
        provenance: "declared",
        weight: 1,
      },
      { from: fileNodeId("ConcreteB.ts"), to: symbolNodeId("ConcreteB.ts", ["Rank"]), kind: "contains", provenance: "declared", weight: 1 },
      {
        from: symbolNodeId("ConcreteB.ts", ["Rank"]),
        to: symbolNodeId("ConcreteB.ts", ["Rank", "computeRank"]),
        kind: "contains",
        provenance: "declared",
        weight: 1,
      },
    ];
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...containsEdges],
      20,
      nodes,
    );
    expect(run(repo)).toHaveLength(0);
  });

  /* ────────────────────────────────────────────────────────────────────
   * OLA O, frente N5 — la superficie de operaciones vale igual en los 8
   * lenguajes, y "vocabulario universal" se MIDE en vez de listarse.
   * Ver el bloque "OLA O, FRENTE N5" del docstring del detector.
   * ──────────────────────────────────────────────────────────────────── */

  it("un nombre que declara casi todo el repo (constructor, contrato de objeto, convención del framework) no cuenta como operación compartida", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts", "constructor");
    // El MISMO nombre declarado por muchas otras unidades del repo: eso, y sólo eso, es lo
    // que lo vuelve universal — no una lista de nombres reservados por lenguaje.
    const ubiquitous = unitsDeclaring("ubicuo", 12, ["constructor"]);
    const repo = repoWith(
      [
        ...clients.map((c) => ({ path: c })),
        { path: "ConcreteA.ts" },
        { path: "ConcreteB.ts" },
        ...ubiquitous.files,
        ...safeFillerFor(MIN_CLIENTS),
      ],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...shared.edges, ...ubiquitous.edges],
      20,
      [...shared.nodes, ...ubiquitous.nodes],
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("el MISMO nombre, cuando no lo declara casi nadie más, sí cuenta: la exclusión es por frecuencia, no por el nombre", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts", "constructor");
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...shared.edges],
      20,
      shared.nodes,
    );
    expect(run(repo)).toHaveLength(1);
  });

  it("la clase anidada en un contenedor (namespace de C#, module de Ruby) SÍ aporta su superficie", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const a = nestedUnitFixture("ConcreteA.cs", ["Ns", "Impl"], ["resolveContract"]);
    const b = nestedUnitFixture("ConcreteB.cs", ["Ns", "Otro"], ["resolveContract"]);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.cs" }, { path: "ConcreteB.cs" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.cs", "ConcreteB.cs"), ...a.edges, ...b.edges],
      20,
      [...a.nodes, ...b.nodes],
    );
    expect(run(repo)).toHaveLength(1);
  });

  // P4 (Ola P) — UNA IMPLEMENTACIÓN ES UN TIPO. Este par de tests reemplaza al de la Ola O
  // ("el archivo como MÓDULO aporta su superficie", que esperaba 1): los dos afirman el
  // mecanismo NUEVO y juntos son más fuertes que el que sucedieron, porque el MISMO par de
  // archivos, con las MISMAS operaciones compartidas, dispara o no según la única cosa que
  // de verdad decide si `Extract Interface` es aplicable — que haya un tipo sobre el cual
  // despachar.
  it("dos paquetes de funciones libres que comparten un nombre NO son dos implementaciones de un protocolo", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const a = moduleUnitFixture("concrete_a.go", ["Encode", "Decode"]);
    const b = moduleUnitFixture("concrete_b.go", ["Encode", "Decode"]);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "concrete_a.go" }, { path: "concrete_b.go" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "concrete_a.go", "concrete_b.go"), ...a.edges, ...b.edges],
      20,
      [...a.nodes, ...b.nodes],
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("los MISMOS dos archivos, con los métodos agrupados bajo su tipo (el receptor que `graph/symbols.ts` pone en container), SÍ emiten", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const a = nestedUnitFixture("concrete_a.go", ["Encoder"], ["Encode", "Decode"]);
    const b = nestedUnitFixture("concrete_b.go", ["Decoder"], ["Encode", "Decode"]);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "concrete_a.go" }, { path: "concrete_b.go" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "concrete_a.go", "concrete_b.go"), ...a.edges, ...b.edges],
      20,
      [...a.nodes, ...b.nodes],
    );
    expect(run(repo)).toHaveLength(1);
  });

  it("una función anidada DENTRO de un método (closure) no es una operación que el tipo exponga", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    // Cada tipo declara UNA operación distinta; el único nombre en común (`oculta`) vive
    // dentro del cuerpo de un método, así que no es superficie de nadie.
    const a = nestedUnitFixture("concrete_a.go", ["Encoder"], ["Encode"]);
    const b = nestedUnitFixture("concrete_b.go", ["Decoder"], ["Decode"]);
    const closureOf = (file: string, type: string, method: string): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } => {
      const id = symbolNodeId(file, [type, method, "oculta"]);
      return {
        nodes: [{ id, kind: "symbol", file, symbolPath: [type, method, "oculta"], family: "function-like" }],
        edges: [{ from: symbolNodeId(file, [type, method]), to: id, kind: "contains", provenance: "declared", weight: 1 }],
      };
    };
    const ca = closureOf("concrete_a.go", "Encoder", "Encode");
    const cb = closureOf("concrete_b.go", "Decoder", "Decode");
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "concrete_a.go" }, { path: "concrete_b.go" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "concrete_a.go", "concrete_b.go"), ...a.edges, ...b.edges, ...ca.edges, ...cb.edges],
      20,
      [...a.nodes, ...b.nodes, ...ca.nodes, ...cb.nodes],
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("un módulo de funciones libres tampoco cuenta como LA ABSTRACCIÓN que ya existe: la abstracción es un tipo", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const a = nestedUnitFixture("ConcreteA.ts", ["ImplA"], ["encode", "decode"]);
    const b = nestedUnitFixture("ConcreteB.ts", ["ImplB"], ["encode", "decode"]);
    // Un TERCER archivo declara las dos operaciones, pero como funciones sueltas: no es
    // una interfaz que ImplA e ImplB puedan implementar, así que no suprime nada.
    const tercero = moduleUnitFixture("helpers.ts", ["encode", "decode"]);
    // Unidades de relleno con vocabulario ajeno: sin ellas el repo de la fixture tiene 3
    // unidades y `encode` sería "universal" por declararlo 3 de 3 (la frecuencia
    // documental es una proporción, y una fixture chica la satura).
    const relleno = unitsDeclaring("relleno", 60, ["nadaQueVer"]);
    const repo = repoWith(
      [
        ...clients.map((c) => ({ path: c })),
        { path: "ConcreteA.ts" },
        { path: "ConcreteB.ts" },
        { path: "helpers.ts" },
        ...relleno.files,
        ...safeFillerFor(MIN_CLIENTS),
      ],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...a.edges, ...b.edges, ...tercero.edges, ...relleno.edges],
      20,
      [...a.nodes, ...b.nodes, ...tercero.nodes, ...relleno.nodes],
    );
    expect(run(repo)).toHaveLength(1);
  });

  it("una arista nominal de baja confianza (inferred) SÍ suprime el hallazgo: como evidencia NEGATIVA, lo conservador es mirarla", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts");
    const repo = repoWith(
      [
        ...clients.map((c) => ({ path: c })),
        { path: "ConcreteA.ts" },
        { path: "ConcreteB.ts" },
        { path: "Contrato.ts" },
        ...safeFillerFor(MIN_CLIENTS),
      ],
      [
        ...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"),
        ...shared.edges,
        edge("ConcreteA.ts", "Contrato.ts", "implements", "inferred"),
        edge("ConcreteB.ts", "Contrato.ts", "implements", "inferred"),
      ],
      20,
      shared.nodes,
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("el supertipo común TRANSITIVO suprime el hallazgo (A extiende X, B extiende Y, X e Y implementan Z)", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts");
    const repo = repoWith(
      [
        ...clients.map((c) => ({ path: c })),
        { path: "ConcreteA.ts" },
        { path: "ConcreteB.ts" },
        { path: "BaseX.ts" },
        { path: "BaseY.ts" },
        { path: "Contrato.ts" },
        ...safeFillerFor(MIN_CLIENTS),
      ],
      [
        ...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"),
        ...shared.edges,
        edge("ConcreteA.ts", "BaseX.ts", "extends"),
        edge("ConcreteB.ts", "BaseY.ts", "extends"),
        edge("BaseX.ts", "Contrato.ts", "implements"),
        edge("BaseY.ts", "Contrato.ts", "implements"),
      ],
      20,
      shared.nodes,
    );
    expect(run(repo)).toHaveLength(0);
  });

  /**
   * EL CASO TESTIGO de la Ola N (guava `HashBiMap` / `ImmutableBiMap`, las dos
   * `implements BiMap`): la interfaz existe y el grafo NO tiene la arista — medido, los 19
   * archivos `*BiMap*.java` de guava emiten cero aristas nominales de cualquier
   * `provenance`. Sin arista, lo único que queda por leer es la superficie de la interfaz.
   */
  it("una unidad de un tercer archivo cuyo protocolo ENTERO declaran las dos: la abstracción ya existe aunque el grafo no tenga la arista", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const a = nestedUnitFixture("HashBiMap.java", ["HashBiMap"], ["put", "forcePut", "inverse", "extraA"]);
    const b = nestedUnitFixture("ImmutableBiMap.java", ["ImmutableBiMap"], ["put", "forcePut", "inverse", "extraB"]);
    const contrato = nestedUnitFixture("BiMap.java", ["BiMap"], ["put", "forcePut", "inverse"]);
    const repo = repoWith(
      [
        ...clients.map((c) => ({ path: c })),
        { path: "HashBiMap.java" },
        { path: "ImmutableBiMap.java" },
        { path: "BiMap.java" },
        ...safeFillerFor(MIN_CLIENTS),
      ],
      [...coupledClientsEdges(clients, "HashBiMap.java", "ImmutableBiMap.java"), ...a.edges, ...b.edges, ...contrato.edges],
      20,
      [...a.nodes, ...b.nodes, ...contrato.nodes],
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("sin esa tercera unidad, el MISMO par sí se reporta: lo que suprime es el protocolo ya declarado, no el nombre de los archivos", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const a = nestedUnitFixture("HashBiMap.java", ["HashBiMap"], ["put", "forcePut", "inverse", "extraA"]);
    const b = nestedUnitFixture("ImmutableBiMap.java", ["ImmutableBiMap"], ["put", "forcePut", "inverse", "extraB"]);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "HashBiMap.java" }, { path: "ImmutableBiMap.java" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "HashBiMap.java", "ImmutableBiMap.java"), ...a.edges, ...b.edges],
      20,
      [...a.nodes, ...b.nodes],
    );
    expect(run(repo)).toHaveLength(1);
  });

  /* ────────────────────────────────────────────────────────────────────
   * OLA Z, frente Z1 — un nombre compartido es una coincidencia de idioma;
   * dos ya son un protocolo. SALVO que ese único nombre sea la mayoría del
   * protocolo de las DOS unidades. Ver el bloque "OLA Z, FRENTE Z1" del
   * docstring del detector.
   * ──────────────────────────────────────────────────────────────────── */

  it("el piso de operaciones compartidas es DOS (un solo nombre es el idioma del lenguaje, no un protocolo) — se pide a testContext", () => {
    expect(MIN_SHARED_OPERATIONS).toBe(2);
    expect(THRESHOLDS.threshold("minSharedOperations").kind).toBe("citado");
  });

  it("UN solo nombre compartido entre dos tipos con muchas operaciones propias (el idioma del lenguaje: `IsZero`) NO dispara", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    // Cada extremo declara 5 operaciones y comparte UNA: la fracción de protocolo
    // compartido es 0,2 en los dos, muy por debajo del piso — es vocabulario, no contrato.
    const a = nestedUnitFixture("ConcreteA.ts", ["Formato"], ["IsZero", "Render", "Parse", "Merge", "Clone"]);
    const b = nestedUnitFixture("ConcreteB.ts", ["Metadatos"], ["IsZero", "Titulo", "Fecha", "Autor", "Resumen"]);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...a.edges, ...b.edges],
      20,
      [...a.nodes, ...b.nodes],
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("los MISMOS dos tipos, compartiendo DOS nombres, SÍ disparan: dos nombres en común ya son un protocolo", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const a = nestedUnitFixture("ConcreteA.ts", ["Formato"], ["IsZero", "Render", "Parse", "Merge", "Clone"]);
    const b = nestedUnitFixture("ConcreteB.ts", ["Metadatos"], ["IsZero", "Render", "Fecha", "Autor", "Resumen"]);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...a.edges, ...b.edges],
      20,
      [...a.nodes, ...b.nodes],
    );
    const findings = run(repo);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[1]!.value).toBe(2);
  });

  it("LA EXCEPCIÓN: un solo nombre compartido SÍ cuenta cuando es el protocolo ENTERO de las dos unidades (dos contratos funcionales del mismo protocolo)", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts");
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...shared.edges],
      20,
      shared.nodes,
    );
    const findings = run(repo);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[1]!.value).toBe(1); // por debajo del piso de operaciones…
    expect(findings[0]!.trigger[2]!.value).toBe(1); // …pero el protocolo compartido es el 100 % de los dos
    expect(findings[0]!.detail).toContain("comparten su contrato entero");
  });

  it("la excepción exige AMBOS extremos: un tipo de UNA operación contra otro de cinco no pasa (asimétrico)", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const a = nestedUnitFixture("ConcreteA.ts", ["Contrato"], ["run"]);
    const b = nestedUnitFixture("ConcreteB.ts", ["Grande"], ["run", "b", "c", "d", "e"]);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...a.edges, ...b.edges],
      20,
      [...a.nodes, ...b.nodes],
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("el piso de la excepción (fracción del protocolo compartida en AMBOS extremos) se pide a testContext: no hay número suelto en el test", () => {
    const min = THRESHOLDS.threshold("minSharedProtocolShare").value;
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    // Dos operaciones de tres compartidas en los dos extremos: 2/3 > el piso; pero la
    // fixture entra igual por el piso de operaciones, así que lo que se comprueba es que
    // el umbral existe, viene del registro y es una fracción entre 0 y 1.
    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThan(1);
    expect(clients).toHaveLength(MIN_CLIENTS);
  });

  it("control negativo: un cliente menos que el umbral no dispara (borde exacto del umbral)", () => {
    const clients = Array.from({ length: MIN_CLIENTS - 1 }, (_, i) => `client${i}.ts`);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }],
      coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"),
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("control negativo: cada cliente depende de un solo archivo (no hay PAR compartido)", () => {
    const repo = repoWith(
      [{ path: "client0.ts" }, { path: "client1.ts" }, { path: "client2.ts" }, { path: "ConcreteA.ts" }],
      ["client0.ts", "client1.ts", "client2.ts"].map((c) => edge(c, "ConcreteA.ts")),
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("control negativo: A y B ya comparten abstracción común (ambos implementan la misma interfaz) — no dispara", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, { path: "Shared.ts" }],
      [
        ...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"),
        edge("ConcreteA.ts", "Shared.ts", "implements"),
        edge("ConcreteB.ts", "Shared.ts", "implements"),
      ],
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("control negativo: A extiende directamente a B — ya hay relación nominal, no dispara", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), edge("ConcreteA.ts", "ConcreteB.ts", "extends")],
    );
    expect(run(repo)).toHaveLength(0);
  });

  /* ────────────────────────────────────────────────────────────────────
   * OLA R, FRENTE R4 — TODO-Y-PARTE: `carries`/`instantiates` entre A y B
   * son evidencia de que forman un par deliberado (uno construye o porta al
   * otro), no dos piezas intercambiables sin abstracción — ver "TODO-Y-PARTE"
   * en el docstring del módulo. Las dos fixtures de abajo parten del MISMO
   * caso que el primer test de este describe ("clientes que dependen del
   * mismo par sin abstracción: un hallazgo", que SÍ dispara con esta exacta
   * superficie de operaciones compartida) y sólo agregan la arista
   * TODO-Y-PARTE, para aislar su efecto y no confundirlo con el filtro de
   * operaciones compartidas.
   * ──────────────────────────────────────────────────────────────────── */

  it("control negativo: A instancia a B (`instantiates`, TODO-Y-PARTE) — no dispara aunque compartan superficie de operaciones y clientela", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts");
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...shared.edges, edge("ConcreteA.ts", "ConcreteB.ts", "instantiates")],
      20,
      shared.nodes,
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("control negativo: un símbolo de A porta (`carries`) un invocable de B (TODO-Y-PARTE) — no dispara aunque compartan superficie de operaciones y clientela", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts");
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...shared.edges, edge("ConcreteA.ts", "ConcreteB.ts", "carries")],
      20,
      shared.nodes,
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("control negativo: `carries`/`instantiates` de baja confianza (`inferred`) SIGUEN suprimiendo — evidencia NEGATIVA, mismo criterio que las aristas nominales", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts");
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [
        ...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"),
        ...shared.edges,
        edge("ConcreteA.ts", "ConcreteB.ts", "instantiates", "inferred"),
      ],
      20,
      shared.nodes,
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("control: `carries`/`instantiates` hacia un TERCER archivo (no A ni B) no suprime nada — el par sigue disparando", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts");
    const repo = repoWith(
      [
        ...clients.map((c) => ({ path: c })),
        { path: "ConcreteA.ts" },
        { path: "ConcreteB.ts" },
        { path: "Unrelated.ts" },
        ...safeFillerFor(MIN_CLIENTS),
      ],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...shared.edges, edge("ConcreteA.ts", "Unrelated.ts", "instantiates")],
      20,
      shared.nodes,
    );
    expect(run(repo)).toHaveLength(1);
  });

  it("control negativo: A tiene MUCHOS otros dependientes fuera de este grupo (baja concentración) — no dispara aunque su ratio quede por debajo del piso de ubicuidad total", () => {
    // A es popular por su cuenta en un repo grande: 3 clientes lo comparten con B,
    // pero OTROS 12 archivos (ajenos al grupo, y que no tocan B) también dependen
    // de A — de los 15 archivos que dependen de A, sólo 3 (20%) son este grupo.
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const otherDependentsOfA = Array.from({ length: 12 }, (_, i) => `unrelated${i}.ts`);
    const edges: CodeGraphEdge[] = [
      ...coupledClientsEdges(clients, "A.ts", "B.ts"),
      ...otherDependentsOfA.map((f) => edge(f, "A.ts")),
    ];
    // Filler suficiente para que el RATIO de A (15/total) siga bajo maxUbiquitousFanInRatio —
    // la única razón para que este caso no dispare tiene que ser la concentración nueva.
    const fanInA = clients.length + otherDependentsOfA.length;
    const filler = safeFillerFor(fanInA);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), ...otherDependentsOfA.map((f) => ({ path: f })), { path: "A.ts" }, { path: "B.ts" }, ...filler],
      edges,
    );
    expect(fanInA / repo.files.length).toBeLessThan(MAX_UBIQUITOUS_RATIO); // confirma que NO es el filtro de ubicuidad el que actúa acá
    expect(run(repo)).toHaveLength(0);
  });

  it("control positivo: si los mismos clientes son (casi) todo el fan-in de A Y de B, la concentración no lo bloquea", () => {
    // Mismo armado que el caso de arriba, pero esta vez los "otros dependientes"
    // TAMBIÉN son parte del grupo que comparte {A, B} — la concentración es 1.0.
    const manyClients = Array.from({ length: MIN_CLIENTS + 12 }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("A.ts", "B.ts");
    const repo = repoWith(
      [...manyClients.map((c) => ({ path: c })), { path: "A.ts" }, { path: "B.ts" }, ...safeFillerFor(manyClients.length)],
      [...coupledClientsEdges(manyClients, "A.ts", "B.ts"), ...shared.edges],
      20,
      shared.nodes,
    );
    expect(run(repo)).toHaveLength(1);
  });

  it("el piso de concentración de clientela (medido contra el escalón real de hugo, no una mayoría elegida por analogía) se pide a testContext: no hay número suelto en el test", () => {
    expect(MIN_CLIENT_SHARE).toBe(0.3);
    expect(THRESHOLDS.threshold("minClientShareOfFanIn").kind).toBe("piso-declarado");
  });

  it("control negativo: infraestructura ubicua — un objetivo con fan-in por encima del umbral se excluye", () => {
    // Muchos archivos del repo dependen de "Logger.ts" (ubicuo); sólo unos pocos dependen TAMBIÉN de "ConcreteB.ts".
    const totalOtherFiles = 20;
    const allFiles = Array.from({ length: totalOtherFiles }, (_, i) => `f${i}.ts`);
    const coupledClients = allFiles.slice(0, MIN_CLIENTS);
    const edges: CodeGraphEdge[] = [
      ...allFiles.map((f) => edge(f, "Logger.ts")), // fan-in de Logger.ts = 100% del repo >> umbral
      ...coupledClients.map((f) => edge(f, "ConcreteB.ts")),
    ];
    const repo = repoWith(
      [...allFiles.map((f) => ({ path: f })), { path: "Logger.ts" }, { path: "ConcreteB.ts" }],
      edges,
    );
    expect(MAX_UBIQUITOUS_RATIO).toBeLessThan(1);
    expect(run(repo)).toHaveLength(0);
  });

  it("control negativo: archivo agregador (fan-out por encima de maxFanoutConsidered) no aporta pares", () => {
    const targets = Array.from({ length: MAX_FANOUT + 5 }, (_, i) => `Concrete${i}.ts`);
    const aggregatorEdges = targets.map((t) => edge("aggregator.ts", t));
    // Otros MIN_CLIENTS-1 clientes "normales" comparten sólo el primer par para no disparar por otra vía.
    const otherClients = Array.from({ length: MIN_CLIENTS - 1 }, (_, i) => `client${i}.ts`);
    const repo = repoWith(
      [
        { path: "aggregator.ts" },
        ...otherClients.map((c) => ({ path: c })),
        ...targets.map((t) => ({ path: t })),
      ],
      [...aggregatorEdges, ...coupledClientsEdges(otherClients, targets[0]!, targets[1]!)],
    );
    // El agregador NO cuenta como cliente adicional del par (targets[0], targets[1]) porque su fan-out excede el tope.
    expect(run(repo)).toHaveLength(0);
  });

  it("sin grafo (RepoUnit.graph === null): la función devuelve vacío, nunca lanza", () => {
    const repo: RepoUnit = { repoName: "r", files: [], functions: [], clones: [], graph: null };
    expect(run(repo)).toHaveLength(0);
  });

  it("provenance 'inferred' no cuenta como evidencia de acoplamiento (brecha de Java, path-proximity)", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const inferredEdges = clients.flatMap((c) => [edge(c, "ConcreteA.ts", "references", "inferred"), edge(c, "ConcreteB.ts", "references", "inferred")]);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }],
      inferredEdges,
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("provenance 'ambiguous' no cuenta como evidencia de acoplamiento (CONTRATO-F9.md §4.5, fuera de toda consulta por defecto)", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const ambiguousEdges = clients.flatMap((c) => [edge(c, "ConcreteA.ts", "references", "ambiguous"), edge(c, "ConcreteB.ts", "references", "ambiguous")]);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      ambiguousEdges,
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("severidad acotada cuando la MAYORÍA de las aristas cliente→{a,b} son 'inferred' (criterio medido, no por nombre de lenguaje)", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const sharedTs = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts");
    const confidentRepo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...sharedTs.edges],
      20,
      sharedTs.nodes,
    );
    // Por cliente: 1 arista declared hacia A + 3 'inferred' extra hacia A (ruido) + 1 declared hacia B.
    // dependsOn (sólo declared/resolved) sigue viendo {A, B} -> el par SÍ dispara; pero el TOTAL
    // cliente→{a,b} (5 aristas, 3 inferred) es mayoría 'inferred' (0.6 > 0.5) -> severidad acotada.
    const mixedEdges = clients.flatMap((c) => [
      edge(c, "ConcreteA.java"),
      edge(c, "ConcreteA.java", "references", "inferred"),
      edge(c, "ConcreteA.java", "references", "inferred"),
      edge(c, "ConcreteA.java", "references", "inferred"),
      edge(c, "ConcreteB.java"),
    ]);
    const sharedJava = sharedOperationFixture("ConcreteA.java", "ConcreteB.java");
    const mixedRepo = repoWith(
      [
        ...clients.map((c) => ({ path: c })),
        { path: "ConcreteA.java", language: "java" },
        { path: "ConcreteB.java", language: "java" },
        ...safeFillerFor(MIN_CLIENTS),
      ],
      [...mixedEdges, ...sharedJava.edges],
      20,
      sharedJava.nodes,
    );
    const confidentFindings = run(confidentRepo);
    const lowConfidenceFindings = run(mixedRepo);
    expect(confidentFindings).toHaveLength(1);
    expect(lowConfidenceFindings).toHaveLength(1);
    expect(lowConfidenceFindings[0]!.severity).toBeLessThan(confidentFindings[0]!.severity);
    expect(lowConfidenceFindings[0]!.severity).toBeLessThanOrEqual(35);
    expect(lowConfidenceFindings[0]!.detail).toContain("path-proximity");
  });

  it("un par .java bien resuelto (mayoría declared/resolved) NO se penaliza sólo por el nombre del lenguaje", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const sharedJava = sharedOperationFixture("ConcreteA.java", "ConcreteB.java");
    const javaRepo = repoWith(
      [
        ...clients.map((c) => ({ path: c })),
        { path: "ConcreteA.java", language: "java" },
        { path: "ConcreteB.java", language: "java" },
        ...safeFillerFor(MIN_CLIENTS),
      ],
      [...coupledClientsEdges(clients, "ConcreteA.java", "ConcreteB.java"), ...sharedJava.edges],
      20,
      sharedJava.nodes,
    );
    const sharedTs = sharedOperationFixture("ConcreteA.ts", "ConcreteB.ts");
    const tsRepo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "ConcreteA.ts" }, { path: "ConcreteB.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "ConcreteA.ts", "ConcreteB.ts"), ...sharedTs.edges],
      20,
      sharedTs.nodes,
    );
    const javaFindings = run(javaRepo);
    const tsFindings = run(tsRepo);
    expect(javaFindings).toHaveLength(1);
    expect(javaFindings[0]!.severity).toBe(tsFindings[0]!.severity);
  });

  it("más clientes ⇒ mayor severidad (monótona en la magnitud), acotada por debajo de 100", () => {
    const fewClients = Array.from({ length: MIN_CLIENTS }, (_, i) => `few${i}.ts`);
    const manyClients = Array.from({ length: MIN_CLIENTS + 10 }, (_, i) => `many${i}.ts`);
    const shared = sharedOperationFixture("A.ts", "B.ts");
    const fewRepo = repoWith(
      [...fewClients.map((c) => ({ path: c })), { path: "A.ts" }, { path: "B.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(fewClients, "A.ts", "B.ts"), ...shared.edges],
      20,
      shared.nodes,
    );
    const manyRepo = repoWith(
      [...manyClients.map((c) => ({ path: c })), { path: "A.ts" }, { path: "B.ts" }, ...safeFillerFor(MIN_CLIENTS + 10)],
      [...coupledClientsEdges(manyClients, "A.ts", "B.ts"), ...shared.edges],
      20,
      shared.nodes,
    );
    const fewFindings = run(fewRepo);
    const manyFindings = run(manyRepo);
    expect(manyFindings[0]!.severity).toBeGreaterThan(fewFindings[0]!.severity);
    expect(manyFindings[0]!.severity).toBeLessThan(100);
  });

  it("aristas 'contains' se ignoran: una jerarquía carpeta→archivo no es una dependencia", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "A.ts" }, { path: "B.ts" }],
      clients.flatMap((c) => [edge(c, "A.ts", "contains"), edge(c, "B.ts", "contains")]),
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("el borde de minClients (citado: Regla de Tres, Roberts/Fowler) se pide a testContext: no hay número suelto en el test", () => {
    expect(MIN_CLIENTS).toBe(3);
    expect(THRESHOLDS.threshold("minClients").kind).toBe("citado");
    expect(THRESHOLDS.threshold("minClients").label).toContain("Fowler");
  });

  it("el detector declara needsGraph:true y needs:[] (no depende de ninguna capacidad de lenguaje)", () => {
    expect(detector.needsGraph).toBe(true);
    expect(detector.needs).toEqual([]);
    expect(detector.scope).toBe("inter-file");
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const clients = Array.from({ length: MIN_CLIENTS }, (_, i) => `client${i}.ts`);
    const shared = sharedOperationFixture("A.ts", "B.ts");
    const repo = repoWith(
      [...clients.map((c) => ({ path: c })), { path: "A.ts" }, { path: "B.ts" }, ...safeFillerFor(MIN_CLIENTS)],
      [...coupledClientsEdges(clients, "A.ts", "B.ts"), ...shared.edges],
      20,
      shared.nodes,
    );
    const ctx = testContext(detector, "*");
    const findings = detector.run(repo, ctx);
    expect(findings).toHaveLength(1);
  });
});
