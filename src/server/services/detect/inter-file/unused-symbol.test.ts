import { describe, expect, it } from "vitest";

import {
  carrierNodeId,
  symbolNodeId,
  EDGE_ROLE_BARE,
  EDGE_ROLE_RECEIVER_MEMBER,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphNode,
} from "../../graph/types.js";
import { runDetectorSet } from "../run.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoUnit } from "../types.js";
import { detector } from "./unused-symbol.js";

/**
 * `inter-file`, `needsGraph: true`: este detector no lee ni una gramática —
 * corre enteramente sobre `CodeGraph` (nodos/aristas ya resueltos por F3/F4),
 * así que, igual que `duplication.test.ts` documenta para su propio caso, "≥3
 * lenguajes que emiten" no aplica acá: se construye el grafo A MANO, sin
 * tree-sitter, y `language` sólo importa para el caso Java (ver el docstring
 * del módulo) — cubierto explícitamente más abajo.
 */

function symNode(
  file: string,
  symbolPath: readonly string[],
  overrides: Partial<CodeGraphNode> = {},
): CodeGraphNode {
  return {
    id: symbolNodeId(file, symbolPath),
    kind: "symbol",
    file,
    symbolPath,
    family: "function-like",
    startLine: 1,
    endLine: 5,
    ...overrides,
  };
}

/** Hermano homónimo — mismo `symbolPath`, id con sufijo `@n`. Ver el docstring del módulo. */
function dupSibling(file: string, symbolPath: readonly string[], n: number, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  const base = symNode(file, symbolPath, overrides);
  return { ...base, id: `${symbolNodeId(file, symbolPath)}@${n}` };
}

function refEdge(
  fromFile: string,
  fromScope: readonly string[],
  toFile: string,
  toSymbolPath: readonly string[],
  weight = 1,
  provenance: CodeGraphEdge["provenance"] = "resolved",
): CodeGraphEdge {
  return {
    from: symbolNodeId(fromFile, fromScope),
    to: symbolNodeId(toFile, toSymbolPath),
    kind: "references",
    provenance,
    weight,
  };
}

const EMPTY_STATS = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_STATS };
}

function repoWith(graph: CodeGraph | null, files: readonly FileSummary[] = []): RepoUnit {
  return { repoName: "test", files, functions: [], clones: [], graph };
}

/**
 * OLA O — PUERTA 3 (`memberUseSeenIn`). El detector sólo se pronuncia sobre un
 * MIEMBRO si la corrida demostró que, EN ESE LENGUAJE, una llamada
 * `receptor.miembro(...)` puede llegar a producir arista — o sea, si llegó al
 * menos una arista de consumo con el rol `receiver-member`. Sin este testigo,
 * "nadie lo usa" no está medido: está fuera de lo que el grafo puede ver (ver
 * el docstring del módulo, con la cita de `graph/resolve.ts#syntacticRoleStage`).
 *
 * Va en `baseline()` porque casi todos los tests de este archivo hablan de
 * miembros y NO es lo que cada uno quiere medir; los dos tests que sí miden
 * esta puerta la controlan explícitamente.
 */
function memberUseWitness(file = "a.ts", toSymbolPath: readonly string[] = ["usedA"]): CodeGraphEdge {
  return {
    from: symbolNodeId(file, ["caller"]),
    to: symbolNodeId(file, toSymbolPath),
    kind: "calls",
    provenance: "resolved",
    weight: 1,
    roles: EDGE_ROLE_RECEIVER_MEMBER,
  };
}

/**
 * Línea base "sana": 3 funciones de nivel superior en `a.ts`, 2 usadas
 * (`usedA`/`usedB`, referenciadas desde `caller`) y 1 sin uso (`unusedC`) —
 * proporción 1/3 (~33%), por debajo de `libraryRatio` (50%), así que ninguno
 * de estos tests dispara por accidente la supresión de "forma de biblioteca".
 * `caller` es `family: "other"` a propósito: es sólo el ORIGEN de las
 * referencias de esta fixture, no un candidato — si fuera `function-like`
 * (top-level, sin nadie que lo llame a él) se contaría a sí mismo como
 * "top-level sin uso" y desbalancearía la proporción que el test controla.
 * Cada test agrega SUS PROPIOS nodos/aristas encima de esta base.
 */
function baseline(): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const nodes: CodeGraphNode[] = [
    symNode("a.ts", ["caller"], { family: "other" }),
    symNode("a.ts", ["usedA"]),
    symNode("a.ts", ["usedB"]),
    symNode("a.ts", ["unusedC"]),
  ];
  const edges: CodeGraphEdge[] = [
    refEdge("a.ts", ["caller"], "a.ts", ["usedA"]),
    refEdge("a.ts", ["caller"], "a.ts", ["usedB"]),
    memberUseWitness(), // ver `memberUseWitness`: habilita la PUERTA 3 en typescript
  ];
  return { nodes, edges };
}

const FILES: FileSummary[] = [{ path: "a.ts", lines: 20, language: "typescript" }];

describe("unused-symbol", () => {
  it("función de nivel superior con fan-in 0 es un hallazgo, con rol y ancla", async () => {
    const { nodes, edges } = baseline();
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("unusedC");
    expect(findings[0]!.locations[0]!.role).toBe("símbolo de nivel superior sin consumidores");
    expect(findings[0]!.locations[0]!.anchor).toEqual({ file: "a.ts", symbolPath: ["unusedC"] });
    expect(findings[0]!.trigger[0]!.value).toBe(0);
  });

  /**
   * OLA O — PUERTA 1. CAMBIO DE CONTRATO, no de umbral: hasta esta ola el
   * detector filtraba las aristas ambiguas con `confidentEdges` y seguía
   * reportando el símbolo, o sea que FABRICABA el fan-in cero. Una arista
   * `ambiguous` es un uso que la cascada VIO y no supo atribuir
   * (CONTRATO-F9.md §4.1): sigue sin sumar fan-in — no sabemos de quién es —
   * pero descalifica a los candidatos que nombra, porque "nadie lo usa" deja
   * de estar medido.
   */
  it("una arista de consumo `ambiguous` no suma fan-in, pero DESCALIFICA al candidato que nombra", async () => {
    const { nodes, edges } = baseline();
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["unusedC"], 1, "ambiguous"));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.map((f) => f.locations[0]!.symbol)).not.toContain("unusedC");
  });

  it("PUERTA 1: también descalifica al que aparece sólo en `alternatives`, no en `to`", async () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["otroCandidato"]));
    edges.push({
      ...refEdge("a.ts", ["caller"], "a.ts", ["unusedC"], 1, "ambiguous"),
      alternatives: [symbolNodeId("a.ts", ["otroCandidato"])],
    });
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const names = detector.run(repo, testContext(detector, "*")).map((f) => f.locations[0]!.symbol);
    expect(names).not.toContain("unusedC");
    expect(names).not.toContain("otroCandidato");
  });

  /**
   * OLA O — PUERTA 2. La cascada resuelve por NOMBRE (`SymbolRef` es sólo
   * `{file, symbolPath}`, sin ordinal) y `syntacticRoleStage` rechaza
   * `x.nombre()` con receptor no constante: con dos declaraciones del mismo
   * nombre, un cero no distingue "no lo usa nadie" de "el uso se le acreditó
   * al otro". Medido en el corpus: 45–69 % de los candidatos.
   */
  it("PUERTA 2: dos declaraciones con el MISMO nombre final ⇒ ninguna de las dos es candidata", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("b.ts", ["unusedC"])); // homónimo en otro archivo, también sin consumidores
    const repo = repoWith(graphOf(nodes, edges), [...FILES, { path: "b.ts", lines: 20, language: "typescript" }]);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.map((f) => f.locations[0]!.symbol)).not.toContain("unusedC");
  });

  it("control de la PUERTA 2: un nombre ÚNICO en el repo sigue siendo candidato", () => {
    const { nodes, edges } = baseline();
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.map((f) => f.locations[0]!.symbol)).toContain("unusedC");
  });

  it("control negativo: funciones referenciadas dentro del mismo repo no son un hallazgo", async () => {
    const { nodes, edges } = baseline();
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    const names = findings.map((f) => f.locations[0]!.symbol);
    expect(names).not.toContain("usedA");
    expect(names).not.toContain("usedB");
  });

  it("clase con fan-in 0 también es un hallazgo (familia class-like)", async () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["usedB2"], { family: "function-like" }));
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["usedB2"]));
    nodes.push(symNode("a.ts", ["UnusedClass"], { family: "class-like" }));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    const found = findings.find((f) => f.locations[0]!.symbol === "UnusedClass");
    expect(found).toBeDefined();
    expect(found!.title).toContain("UnusedClass");
  });

  it("miembro anidado (método de una clase) con fan-in 0 es un hallazgo y no cuenta para 'forma de biblioteca'", async () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["Widget"], { family: "class-like" }));
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["Widget"]));
    nodes.push(symNode("a.ts", ["Widget", "helper"], { family: "function-like" }));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    const found = findings.find((f) => f.locations[0]!.symbol === "helper");
    expect(found).toBeDefined();
    expect(found!.locations[0]!.role).toBe("miembro sin consumidores");
    expect(found!.locations[0]!.anchor).toEqual({ file: "a.ts", symbolPath: ["Widget", "helper"] });
  });

  it("hermano homónimo (@2, sobrecarga/reapertura) con fan-in 0 se excluye de la candidatura", async () => {
    const { nodes, edges } = baseline();
    const before = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*")).length;
    nodes.push(dupSibling("a.ts", ["usedA"], 2)); // "usedA@2": nunca puede ser destino de una arista, ver docstring
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    // El duplicado (fan-in 0 por construcción, ver docstring) NO agrega un
    // hallazgo nuevo respecto de la misma base sin el duplicado.
    expect(findings).toHaveLength(before);
    expect(findings.some((f) => f.locations[0]!.symbol === "usedA")).toBe(false);
  });

  it("convención de entrada 'main' de nivel superior sin consumidores no es un hallazgo", async () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["main"]));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "main")).toBe(false);
  });

  /**
   * OLA O — el heurístico de repo pasó de SUPRIMIR a REBAJAR LA CONFIANZA. Ver
   * el `rationale` de `libraryRatio`: suprimir dejaba al detector emitiendo
   * SÓLO miembros (la única clase de símbolo cuyo uso el grafo no puede ver)
   * en todo repo con forma de biblioteca — que es el 100 % del corpus medido.
   */
  it("repo con forma de biblioteca: los candidatos de nivel superior se reportan con la confianza rebajada y la razón escrita", async () => {
    // Mayoría de símbolos de nivel superior sin consumidor ⇒ "parece biblioteca".
    const nodes: CodeGraphNode[] = [
      symNode("lib.ts", ["publicA"]),
      symNode("lib.ts", ["publicB"]),
      symNode("lib.ts", ["publicC"]),
      symNode("lib.ts", ["Widget"], { family: "class-like" }),
    ];
    const edges: CodeGraphEdge[] = [
      // Sólo el propio "Widget" (nivel superior) tiene un consumidor; los otros 3 no.
      refEdge("lib.ts", ["consumer"], "lib.ts", ["Widget"]),
      memberUseWitness("lib.ts", ["Widget"]), // PUERTA 3, ver `memberUseWitness`
    ];
    nodes.push(symNode("lib.ts", ["Widget", "privateHelper"], { family: "function-like" }));
    const repo = repoWith(graphOf(nodes, edges), [{ path: "lib.ts", lines: 20, language: "typescript" }]);
    const findings = detector.run(repo, testContext(detector, "*"));

    const topLevel = findings.filter((f) => f.locations[0]!.role === "símbolo de nivel superior sin consumidores");
    expect(topLevel.map((f) => f.locations[0]!.symbol).sort()).toEqual(["publicA", "publicB", "publicC"]);
    for (const f of topLevel) expect(f.detail).toContain("forma de biblioteca");

    // El miembro anidado se sigue reportando y NO paga la rebaja de
    // "forma de biblioteca": el heurístico es sobre superficie de nivel
    // superior, no sobre miembros.
    const nested = findings.find((f) => f.locations[0]!.symbol === "privateHelper");
    expect(nested).toBeDefined();
    expect(nested!.detail).not.toContain("forma de biblioteca");
  });

  it("umbral de 'forma de biblioteca': justo en el umbral rebaja la confianza de todo top-level, justo debajo no", async () => {
    const ratio = testContext(detector, "*").threshold("libraryRatio").value;
    const total = 100;
    const unusedAtThreshold = Math.round(total * ratio);
    const unusedBelowThreshold = unusedAtThreshold - 1;

    function buildRepo(unusedCount: number): RepoUnit {
      const nodes: CodeGraphNode[] = [];
      const edges: CodeGraphEdge[] = [];
      nodes.push(symNode("f.ts", ["consumer"], { family: "other" })); // sólo origen de referencias, ver docstring de `baseline()`
      for (let i = 0; i < total; i++) {
        nodes.push(symNode("f.ts", [`fn${i}`]));
        if (i >= unusedCount) edges.push(refEdge("f.ts", ["consumer"], "f.ts", [`fn${i}`]));
      }
      return repoWith(graphOf(nodes, edges), [{ path: "f.ts", lines: 500, language: "typescript" }]);
    }

    const atThreshold = detector.run(buildRepo(unusedAtThreshold), testContext(detector, "*"));
    const belowThreshold = detector.run(buildRepo(unusedBelowThreshold), testContext(detector, "*"));

    const topLevelAt = atThreshold.filter((f) => f.locations[0]!.role === "símbolo de nivel superior sin consumidores");
    const topLevelBelow = belowThreshold.filter((f) => f.locations[0]!.role === "símbolo de nivel superior sin consumidores");

    // En los DOS lados se reporta todo lo que no tiene consumidores: lo que
    // cambia es la confianza, no la existencia del hallazgo.
    expect(topLevelAt.length).toBe(unusedAtThreshold);
    expect(topLevelBelow.length).toBe(unusedBelowThreshold);
    for (const f of topLevelAt) expect(f.detail).toContain("forma de biblioteca");
    for (const f of topLevelBelow) expect(f.detail).not.toContain("forma de biblioteca");
    expect(topLevelAt[0]!.severity).toBeLessThan(topLevelBelow[0]!.severity);
  });

  it("en Java la severidad baja frente al mismo caso en otro lenguaje (brecha de path-proximity, ver docstring)", async () => {
    const { nodes: jNodes, edges: jEdges } = baseline();
    const javaRepo = repoWith(graphOf(jNodes, jEdges), [{ path: "a.ts", lines: 20, language: "java" }]);
    const javaFindings = detector.run(javaRepo, testContext(detector, "*"));

    const { nodes: tNodes, edges: tEdges } = baseline();
    const tsRepo = repoWith(graphOf(tNodes, tEdges), FILES);
    const tsFindings = detector.run(tsRepo, testContext(detector, "*"));

    expect(javaFindings[0]!.severity).toBeLessThan(tsFindings[0]!.severity);
    expect(javaFindings[0]!.detail).toContain("path-proximity");
  });

  it("sin grafo: el runner reporta 'sin-grafo', nunca 'cero hallazgos'", async () => {
    const repo = repoWith(null, FILES);
    const { coverage, findings } = await runDetectorSet([detector], {
      repo,
      languages: new Map([["typescript", { capabilities: new Set(), sets: {} as never }]]),
      benchmarks: null,
      only: ["unused-symbol"],
    });
    expect(findings).toHaveLength(0);
    const own = coverage.find((c) => c.detectorId === "unused-symbol")!;
    expect(own.status).toBe("sin-grafo");
  });

  it("presupuesto propio: el volumen de hallazgos se puede topear vía maxFindings", () => {
    expect(detector.maxFindings).toBeDefined();
  });

  /*
   * OLA 11b (frente B1) — QUÉ CUENTA COMO "USO". Ver la sección homónima del
   * docstring del módulo: hasta esta ola el fan-in contaba SÓLO `references`,
   * y eso dejó de ser "todas las formas de uso" hace varias olas. El caso más
   * grave es `calls`: `graph/build.ts#partitionCandidatesByCallee` manda todo
   * candidato en posición de llamada a la partición `calls`, así que una
   * llamada RESUELTA ya no produce `references` — o sea que "una función que
   * alguien LLAMA" contaba como función sin consumidores.
   */
  function useEdge(kind: CodeGraphEdge["kind"], fromScope: readonly string[], toSymbolPath: readonly string[]): CodeGraphEdge {
    return { from: symbolNodeId("a.ts", fromScope), to: symbolNodeId("a.ts", toSymbolPath), kind, provenance: "resolved", weight: 1 };
  }

  for (const kind of ["calls", "instantiates", "invokes-indirect"] as const) {
    it(`una arista \`${kind}\` cuenta como consumidor: el símbolo deja de ser un hallazgo`, () => {
      const { nodes, edges } = baseline();
      edges.push(useEdge(kind, ["caller"], ["unusedC"]));
      const repo = repoWith(graphOf(nodes, edges), FILES);
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.map((f) => f.locations[0]!.symbol)).not.toContain("unusedC");
    });
  }

  it("control: `contains` NO cuenta como consumidor — quien te declara no es quien te usa", () => {
    // Si `contains` contara, TODO símbolo tendría fan-in >= 1 (el archivo o
    // la clase que lo declara) y este detector quedaría apagado entero.
    const { nodes, edges } = baseline();
    edges.push({ from: "file:a.ts", to: symbolNodeId("a.ts", ["unusedC"]), kind: "contains", provenance: "declared", weight: 1 });
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.map((f) => f.locations[0]!.symbol)).toContain("unusedC");
  });

  /**
   * OLA O — PUERTA 5, CAMBIO DE CONTRATO. Antes `extends`/`implements`/
   * `satisfies`/`mixes-in` estaban excluidas a propósito ("una jerarquía muerta
   * sigue siendo superficie a mantener"). Pero el hallazgo AFIRMA, textualmente,
   * "Ningún archivo del repo referencia X" — y con una subclase en el repo eso
   * es falso. Una jerarquía muerta entera es otro olor, con sus propios
   * detectores; éste no puede comprarse volumen mintiendo. Es además la única
   * señal de nivel de TIPO que el grafo emite hoy.
   */
  for (const kind of ["extends", "implements", "satisfies", "mixes-in"] as const) {
    it(`una arista \`${kind}\` ENTRANTE cuenta como consumidor: heredar/implementar/satisfacer un tipo ES usarlo`, () => {
      const { nodes, edges } = baseline();
      // Tres usados de relleno: sin ellos la proporción de nivel superior sin
      // consumidores cruza `libraryRatio` (50%) y descarta TODOS los candidatos
      // de nivel superior, tapando lo que este test mide.
      for (const name of ["usedD", "usedE", "usedF"]) {
        nodes.push(symNode("a.ts", [name]));
        edges.push(refEdge("a.ts", ["caller"], "a.ts", [name]));
      }
      nodes.push(symNode("a.ts", ["UnusedBase"], { family: "class-like" }));
      nodes.push(symNode("a.ts", ["UnusedSub"], { family: "class-like" }));
      edges.push({ from: symbolNodeId("a.ts", ["UnusedSub"]), to: symbolNodeId("a.ts", ["UnusedBase"]), kind, provenance: "declared", weight: 1 });
      const repo = repoWith(graphOf(nodes, edges), FILES);
      const findings = detector.run(repo, testContext(detector, "*"));
      expect(findings.map((f) => f.locations[0]!.symbol)).not.toContain("UnusedBase");
      // La subclase, que no recibe ninguna arista, sigue siendo candidata.
      expect(findings.map((f) => f.locations[0]!.symbol)).toContain("UnusedSub");
    });
  }

  it("confianza de `class-like`: la rebaja por instanciación sólo aplica donde la señal NO se observó en esta corrida", () => {
    // El docstring viejo rebajaba SIEMPRE la severidad de una clase "porque
    // nadie emite `instantiates`". Eso venció: `graph/edges/instanciacion.ts`
    // la emite. La rebaja pasa a derivarse de la corrida, no de una lista de
    // lenguajes escrita a mano (que quedaría vencida igual que la anterior).
    const conSenal = baseline();
    conSenal.nodes.push(symNode("a.ts", ["OtraClase"], { family: "class-like" }));
    conSenal.nodes.push(symNode("a.ts", ["UnusedClass"], { family: "class-like" }));
    conSenal.edges.push(useEdge("instantiates", ["caller"], ["OtraClase"])); // instanciación real en este lenguaje: la señal existe
    const findingsConSenal = detector.run(repoWith(graphOf(conSenal.nodes, conSenal.edges), FILES), testContext(detector, "*"));
    const conSenalHit = findingsConSenal.find((f) => f.locations[0]!.symbol === "UnusedClass")!;

    const sinSenal = baseline();
    sinSenal.nodes.push(symNode("a.ts", ["OtraClase"], { family: "class-like" }));
    sinSenal.nodes.push(symNode("a.ts", ["UnusedClass"], { family: "class-like" }));
    sinSenal.edges.push(refEdge("a.ts", ["caller"], "a.ts", ["OtraClase"]));
    const findingsSinSenal = detector.run(repoWith(graphOf(sinSenal.nodes, sinSenal.edges), FILES), testContext(detector, "*"));
    const sinSenalHit = findingsSinSenal.find((f) => f.locations[0]!.symbol === "UnusedClass")!;

    expect(conSenalHit.severity).toBeGreaterThan(sinSenalHit.severity);
    expect(sinSenalHit.detail).toContain("no aterrizó ni una sola relación de instanciación");
    expect(conSenalHit.detail).not.toContain("no aterrizó ni una sola relación de instanciación");
  });

  /**
   * ESTA TAREA — `graph/edges/instanciacion.ts` resuelve `instantiates` contra
   * la CLASE (`toName` = el nombre de `ClassName` en `ClassName.new(...)`),
   * nunca contra el símbolo ANIDADO de su constructor. Confirmado a mano
   * sobre el corpus (jekyll: `DataReader#initialize`, `ERBRenderer#initialize`,
   * los dos genuinamente instanciados en otro archivo, los dos con fan-in 0
   * antes de este arreglo). Ver `isConstructorLikeMember`.
   */
  it("constructor (`initialize`) con fan-in 0 NO es un hallazgo si la clase que lo contiene SÍ tiene consumidores", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["Widget"], { family: "class-like" }));
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["Widget"])); // la CLASE tiene consumidores...
    nodes.push(symNode("a.ts", ["Widget", "initialize"], { family: "function-like" })); // ...pero su constructor, fan-in 0 en el grafo
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "initialize")).toBe(false);
  });

  it("constructor (`initialize`) con fan-in 0 SIGUE siendo un hallazgo si la clase que lo contiene TAMBIÉN tiene fan-in 0", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" })); // sin consumidores
    nodes.push(symNode("a.ts", ["DeadWidget", "initialize"], { family: "function-like" }));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "initialize")).toBe(true);
  });

  it("constructor por nombre-de-clase (C#: `constructor_declaration` con el mismo nombre que la clase) también se excluye cuando la clase tiene consumidores", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["Widget"], { family: "class-like" }));
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["Widget"]));
    nodes.push(symNode("a.ts", ["Widget", "Widget"], { family: "function-like" })); // C#: el ctor se llama igual que la clase
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "Widget" && f.locations[0]!.role === "miembro sin consumidores")).toBe(false);
  });

  /**
   * BUG ARREGLADO (medido contra click, Python): un método especial ("dunder")
   * se invoca IMPLÍCITAMENTE por el protocolo del lenguaje (acceso a
   * atributo, `==`, `len(x)`, `for`/`in`, `with`, …) — nunca hay un sitio de
   * llamada textual con ese nombre exacto, así que fan-in 0 no significa
   * "muerto". Ver `isPythonDunderMethod` y el punto (d) del docstring.
   */
  it("un método especial de Python a nivel de MÓDULO (`__getattr__`, PEP 562) con fan-in 0 no es un hallazgo", () => {
    // Reproduce `src/click/core.py:3771#__getattr__` — nivel de archivo
    // (`symbolPath.length === 1`), no un miembro de clase.
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["__getattr__"]));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "__getattr__")).toBe(false);
  });

  it("un método especial de Python a nivel de CLASE (`__eq__`) con fan-in 0 no es un hallazgo, aunque la clase misma tenga consumidores", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["Widget"], { family: "class-like" }));
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["Widget"]));
    nodes.push(symNode("a.ts", ["Widget", "__eq__"], { family: "function-like" }));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "__eq__")).toBe(false);
  });

  it("un método especial de Python con fan-in 0 se descarta AUNQUE la clase que lo contiene TAMBIÉN tenga fan-in 0 (a diferencia de `__init__`/`isConstructorLikeMember`)", () => {
    // Distinto de `initialize`/`__init__`: el dunder no depende del fan-in
    // del dueño — el dispatch que lo invoca (`==`, `repr()`, …) nunca deja
    // arista posible, exista o no un consumidor textual de la clase.
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" })); // sin consumidores
    nodes.push(symNode("a.ts", ["DeadWidget", "__repr__"], { family: "function-like" }));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "__repr__")).toBe(false);
  });

  it("control negativo: un nombre con UN solo guion bajo a cada lado, o con guion bajo asimétrico, no matchea la convención dunder y sigue reportando", () => {
    const { nodes, edges } = baseline();
    // Rellenos usados, mismo motivo que el test de `extends`: sin ellos la
    // proporción de nivel superior sin consumidores cruza `libraryRatio` y
    // tapa lo que este test mide.
    for (const name of ["usedD", "usedE", "usedF"]) {
      nodes.push(symNode("a.ts", [name]));
      edges.push(refEdge("a.ts", ["caller"], "a.ts", [name]));
    }
    nodes.push(symNode("a.ts", ["_helper_"])); // un solo `_`, no dunder
    nodes.push(symNode("a.ts", ["__onlyLeading"])); // sin cierre
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    const names = findings.map((f) => f.locations[0]!.symbol);
    expect(names).toContain("_helper_");
    expect(names).toContain("__onlyLeading");
  });

  /*
   * ESTA TAREA (frente A4a) — `carries` cuenta como consumidor. Ver "QUÉ
   * CUENTA COMO USO" punto (d) del docstring del módulo: un literal
   * función/arrow SIN nombre propio (`<anon@N>`, `graph/edges/portador.ts`)
   * NUNCA puede ser destino de `references`/`calls`/`instantiates`/
   * `invokes-indirect` — no tiene nombre que una referencia textual pueda
   * apuntar — así que `carries` (la arista que SIEMPRE conecta un portador
   * con el literal anónimo que envuelve) es la ÚNICA señal de uso posible
   * para este caso. Reproduce el patrón real confirmado en
   * `tests/golden/precision/ck-analyzer.verdicts.csv`: "función anónima
   * usada en su propio sitio de definición" / "warn:(m)=>... implementa
   * CleanupLogger.warn ... propiedad de interfaz, no símbolo con nombre".
   */
  function carrierEdge(carrierId: string, toFile: string, toSymbolPath: readonly string[], weight = 1): CodeGraphEdge {
    return { from: carrierId, to: symbolNodeId(toFile, toSymbolPath), kind: "carries", provenance: "declared", weight };
  }

  it("una arista `carries` cuenta como consumidor: un literal anónimo (`<anon@N>`) usado como valor de un campo/callback deja de ser un hallazgo", () => {
    const { nodes, edges } = baseline();
    const carrierId = carrierNodeId("a.ts", ["Widget", "warn"], 0);
    nodes.push(symNode("a.ts", ["Widget"], { family: "class-like" }));
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["Widget"])); // relleno para que Widget no infle libraryRatio
    nodes.push({ id: carrierId, kind: "carrier", file: "a.ts", symbolPath: ["Widget", "warn"], carrierForm: "field" });
    nodes.push(symNode("a.ts", ["Widget", "<anon@0>"], { family: "function-like" }));
    edges.push(carrierEdge(carrierId, "a.ts", ["Widget", "<anon@0>"]));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "<anon@0>")).toBe(false);
  });

  it("control: un literal anónimo SIN arista `carries` (hipotético, no ocurre en producción — `materializeCarrierFacts` siempre la crea) sigue siendo un hallazgo", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["Widget"], { family: "class-like" }));
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["Widget"]));
    nodes.push(symNode("a.ts", ["Widget", "<anon@0>"], { family: "function-like" }));
    // Sin arista `carries` hacia el anónimo.
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "<anon@0>")).toBe(true);
  });

  it("control: `carries` no cambia el fan-in de un símbolo NOMBRADO ya cubierto por `references` (redundante, ver docstring)", () => {
    const { nodes, edges } = baseline();
    // `usedA` ya tiene un consumidor por `references` (de la baseline); agregar
    // una `carries` extra hacia él no debería cambiar nada observable.
    const carrierId = carrierNodeId("a.ts", ["someField"], 0);
    nodes.push({ id: carrierId, kind: "carrier", file: "a.ts", symbolPath: ["someField"], carrierForm: "field" });
    edges.push(carrierEdge(carrierId, "a.ts", ["usedA"]));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.map((f) => f.locations[0]!.symbol)).not.toContain("usedA");
    expect(findings.map((f) => f.locations[0]!.symbol)).toContain("unusedC"); // el resto de la baseline sigue igual
  });

  /*
   * ESTA TAREA (frente A4a) — MIEMBRO APLANADO. Ver el docstring de
   * `flattenedContainersOf` en el módulo: un método con nombre propio
   * declarado DENTRO de un literal de objeto (`export const detector = {
   * id: "...", run(...) {...} }`) queda con `symbolPath: ["run"]` —
   * TOP-LEVEL por construcción del grafo (`graph/symbols.ts` no abre scope
   * para un literal de objeto) — pese a estar anidado textualmente. Estos
   * tests reproducen esa forma A MANO: dos nodos top-level en el MISMO
   * archivo cuyo rango de líneas se solapa (el "contenedor" envuelve al
   * "miembro").
   */
  function containerNode(file: string, name: string, startLine: number, endLine: number, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
    return { id: symbolNodeId(file, [name]), kind: "symbol", file, symbolPath: [name], family: "other", startLine, endLine, ...overrides };
  }

  it("miembro aplanado: severidad de miembro (no de nivel superior) y rol 'miembro sin consumidores', aunque symbolPath sea de un solo segmento", () => {
    const { nodes, edges } = baseline();
    nodes.push(containerNode("a.ts", "widget", 20, 30)); // contenedor SIN fan-in — no debería suprimir, sólo rebajar
    nodes.push(symNode("a.ts", ["run"], { startLine: 22, endLine: 24 })); // anidado DENTRO del rango del contenedor
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    const found = findings.find((f) => f.locations[0]!.symbol === "run");
    expect(found).toBeDefined();
    expect(found!.locations[0]!.role).toBe("miembro sin consumidores");
    expect(found!.severity).toBeLessThan(60); // nunca la base 55+ de un top-level genuino
    expect(found!.detail).toContain("está declarado dentro de otra declaración de este mismo archivo");
  });

  it("miembro aplanado: se descarta del todo cuando el contenedor SÍ mide fan-in > 0 en esta corrida", () => {
    const { nodes, edges } = baseline();
    nodes.push(containerNode("a.ts", "widget", 20, 30));
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["widget"])); // el contenedor SÍ tiene un consumidor real
    nodes.push(symNode("a.ts", ["run"], { startLine: 22, endLine: 24 }));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "run")).toBe(false);
  });

  it("miembro aplanado: sigue reportado si el contenedor TAMBIÉN tiene fan-in 0 (muertos juntos es información real, mismo principio que el constructor)", () => {
    const { nodes, edges } = baseline();
    nodes.push(containerNode("a.ts", "widget", 20, 30)); // sin consumidores
    nodes.push(symNode("a.ts", ["run"], { startLine: 22, endLine: 24 }));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "run")).toBe(true);
  });

  it("control: dos declaraciones top-level con rango de líneas IDÉNTICO no se marcan contenedor la una de la otra (evita falsos por coincidencia de rango)", () => {
    const { nodes, edges } = baseline();
    // Relleno usado, mismo motivo que otros tests de este archivo: agregar
    // un segundo top-level sin consumidores (`unusedAlso`) por sí solo
    // cruzaría `libraryRatio` (2 de 4 = 50%) y suprimiría TODO top-level —
    // no lo que este test mide.
    for (const name of ["usedD", "usedE"]) {
      nodes.push(symNode("a.ts", [name]));
      edges.push(refEdge("a.ts", ["caller"], "a.ts", [name]));
    }
    // `unusedC` (de la baseline) y este nuevo nodo comparten el rango 1-5
    // por defecto de `symNode` — ninguno debe tratar al otro como contenedor.
    nodes.push(symNode("a.ts", ["unusedAlso"]));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    const unusedC = findings.find((f) => f.locations[0]!.symbol === "unusedC");
    const unusedAlso = findings.find((f) => f.locations[0]!.symbol === "unusedAlso");
    expect(unusedC!.locations[0]!.role).toBe("símbolo de nivel superior sin consumidores");
    expect(unusedAlso!.locations[0]!.role).toBe("símbolo de nivel superior sin consumidores");
  });

  it("control: un miembro GENUINAMENTE anidado (symbolPath.length >= 2) sigue reportado aunque su clase contenedora tenga fan-in 0 (no confundir con el caso aplanado)", () => {
    // Ya cubierto por otros tests de este archivo, repetido acá para dejar
    // explícito el contraste con "miembro aplanado": un miembro anidado de
    // VERDAD nunca pasa por `flattenedContainersOf` (no es `isTopLevel`).
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["Widget"], { family: "class-like" })); // sin consumidores
    nodes.push(symNode("a.ts", ["Widget", "helper"], { family: "function-like" }));
    const repo = repoWith(graphOf(nodes, edges), FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "helper")).toBe(true);
  });

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * OLA O — PUERTA 3 (`memberUseSeenIn`) y PUERTA 4 (`exposureOf`).
   * ═══════════════════════════════════════════════════════════════════════
   */

  /** La baseline SIN el testigo de uso por receptor — para medir la PUERTA 3. */
  function baselineSinTestigo(): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
    const { nodes, edges } = baseline();
    return { nodes, edges: edges.filter((e) => ((e.roles ?? 0) & EDGE_ROLE_RECEIVER_MEMBER) === 0) };
  }

  it("PUERTA 3: sin ninguna arista de consumo con rol `receiver-member` en este lenguaje, un miembro NO se reporta", () => {
    const { nodes, edges } = baselineSinTestigo();
    // Relleno usado: sin él, agregar `DeadWidget` lleva la proporción de nivel
    // superior sin consumidores a 2/4 (50%) y `libraryRatio` suprimiría TODO
    // top-level, tapando la segunda aserción de este test.
    for (const name of ["usedD", "usedE"]) {
      nodes.push(symNode("a.ts", [name]));
      edges.push(refEdge("a.ts", ["caller"], "a.ts", [name]));
    }
    nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" }));
    nodes.push(symNode("a.ts", ["DeadWidget", "helper"], { family: "function-like" }));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "helper")).toBe(false);
    // El símbolo de NIVEL SUPERIOR de la misma corrida sigue reportándose: la
    // puerta es sobre miembros, no un apagado del detector.
    expect(findings.some((f) => f.locations[0]!.symbol === "unusedC")).toBe(true);
  });

  /**
   * MEDIDO contra newtonsoft-json: en C# `symbolPath[0]` es el NAMESPACE, y la
   * primera CLASE real aparece recién en el tercer segmento. Con el criterio de
   * PROFUNDIDAD, toda clase de C# contaba como "miembro" y la PUERTA 3 la
   * callaba — el detector emitía UN hallazgo en todo el repo. El criterio es la
   * FAMILIA DEL DUEÑO, no la profundidad: ver `isMemberOfType`.
   */
  it("PUERTA 3: una clase dentro de un namespace NO es un miembro — el criterio es la familia del dueño, no la profundidad", () => {
    const { nodes, edges } = baselineSinTestigo();
    nodes.push(symNode("ns.cs", ["Espacio"], { family: "namespace-like" }));
    nodes.push(symNode("ns.cs", ["Espacio", "ClaseMuerta"], { family: "class-like" }));
    nodes.push(symNode("ns.cs", ["Espacio", "ClaseMuerta", "metodo"], { family: "function-like" }));
    const files = [...FILES, { path: "ns.cs", lines: 40, language: "csharp" }];
    const findings = detector.run(repoWith(graphOf(nodes, edges), files), testContext(detector, "*"));
    const clase = findings.find((f) => f.locations[0]!.symbol === "ClaseMuerta");
    expect(clase, "una clase anidada en un namespace se alcanza por su nombre, no por un receptor").toBeDefined();
    expect(clase!.locations[0]!.role).toBe("símbolo de nivel superior sin consumidores");
    // Su MÉTODO sí es un miembro, y sin testigo en csharp queda callado.
    expect(findings.some((f) => f.locations[0]!.symbol === "metodo")).toBe(false);
  });

  /**
   * La otra mitad del mismo criterio, también medida: una función declarada
   * DENTRO de otra función tampoco es alcanzable por su cuenta — sus llamadores
   * están todos dentro del contenedor, que es justo el punto ciego que
   * `graph/build.ts` documenta como "AUTO-REFERENCIA". Con el criterio "sólo
   * miembros de CLASE", lodash pasaba de 254 candidatos a 244: su `lodash.js`
   * es una única función envolvente con cientos de funciones anidadas adentro,
   * todas usadas y todas con fan-in 0.
   */
  it("PUERTA 3: una función anidada DENTRO de otra función también es un miembro (no es alcanzable por su cuenta)", () => {
    const { nodes, edges } = baselineSinTestigo();
    nodes.push(symNode("a.ts", ["envolvente"], { family: "function-like" }));
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["envolvente"]));
    nodes.push(symNode("a.ts", ["envolvente", "ayudante"], { family: "function-like" }));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "ayudante")).toBe(false);
  });

  it("PUERTA 3: con el testigo, el mismo miembro sí se reporta", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" }));
    nodes.push(symNode("a.ts", ["DeadWidget", "helper"], { family: "function-like" }));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "helper")).toBe(true);
  });

  /**
   * OLA P — LA DECISIÓN MEDIDA, fijada en un test para que no se revierta por
   * plausibilidad. Desde que `resolve.ts#typelessReceiverStage` existe, TODA
   * llamada `x.miembro(...)` deja una arista `ambiguous` con rol
   * `receiver-member`. Este archivo predecía que con eso la PUERTA 3 se abriría
   * sola; se probó sobre dos árboles congelados y lo que agrega es ruido casi
   * puro (click 48 → 74 ubicaciones, las 28 nuevas revisadas a mano y las 28
   * falsas; preact 41 → 64, las 23 falsas; el `JContainer.cs` de
   * newtonsoft-json, 19 nuevas y 19 falsas). Una ambigua acredita "vi UN uso de
   * miembro en este lenguaje", y eso no vuelve medible el cero de los otros
   * cuarenta mil. La evidencia nueva hace TODO su trabajo por la PUERTA 1, que
   * es por SITIO y no por lenguaje — ver los dos tests de esa puerta arriba.
   */
  it("PUERTA 3: una arista `ambiguous` con rol `receiver-member` NO abre la puerta (Ola P, decisión medida)", () => {
    const conAmbigua = baselineSinTestigo();
    conAmbigua.edges.push({ ...memberUseWitness(), provenance: "ambiguous" });
    conAmbigua.nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" }));
    conAmbigua.nodes.push(symNode("a.ts", ["DeadWidget", "helper"], { family: "function-like" }));
    const conAmb = detector.run(repoWith(graphOf(conAmbigua.nodes, conAmbigua.edges), FILES), testContext(detector, "*"));
    expect(conAmb.some((f) => f.locations[0]!.symbol === "helper")).toBe(false);

    // …y LA MISMA arista, firme, sí la abre: lo que decide es la ATRIBUCIÓN,
    // no el rol ni el kind.
    const conFirme = baselineSinTestigo();
    conFirme.edges.push(memberUseWitness());
    conFirme.nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" }));
    conFirme.nodes.push(symNode("a.ts", ["DeadWidget", "helper"], { family: "function-like" }));
    const conFir = detector.run(repoWith(graphOf(conFirme.nodes, conFirme.edges), FILES), testContext(detector, "*"));
    expect(conFir.some((f) => f.locations[0]!.symbol === "helper")).toBe(true);
  });

  /**
   * OLA U (integrador) — MISMO ARGUMENTO QUE LA AMBIGUA DE ARRIBA, testigo
   * nuevo, y LA VERSIÓN ESTRUCTURAL DE UN PARCHE QUE YA FALLÓ UNA VEZ.
   *
   * Un sitio de uso que está LÉXICAMENTE DENTRO del tipo que declara el
   * miembro (`this.foo()`, `self.foo`, el `this.foo = x` del constructor)
   * acredita que un objeto SE HABLA A SÍ MISMO, no que la cascada resuelva
   * `receptor.miembro()` hacia OTRO objeto en este lenguaje — que es la
   * pregunta de esta puerta.
   *
   * POR QUÉ EL TEST YA NO NOMBRA UNA ETAPA. La primera versión fijaba
   * `resolvedBy !== "self-receiver"`, y en la MISMA ola la puerta se volvió a
   * abrir por un segundo mecanismo de idéntica forma: los campos de
   * constructor (`graph/symbols.ts`, hueco #1) crean el nodo destino de
   * `this.campo = x` y esa referencia la resuelve `global-uniqueness`. Medido
   * sobre el corpus CON el parche por nombre de etapa puesto: `unused-symbol`
   * 883 → 1.165 (+282) en un kind de 7 % de precisión. Este test fija la
   * PROPIEDAD (¿el uso cruza de un dueño a otro?), que es lo que vuelve falsa
   * la primera versión y verdadera ésta.
   */
  it("PUERTA 3: un uso LÉXICAMENTE DENTRO del tipo dueño NO abre la puerta, sea cual sea la etapa (Ola U)", () => {
    const witnessDentro = (from: readonly string[], to: readonly string[], resolvedBy: string): CodeGraphEdge => ({
      from: symbolNodeId("a.ts", from),
      to: symbolNodeId("a.ts", to),
      kind: "references",
      provenance: "resolved",
      resolvedBy: resolvedBy as CodeGraphEdge["resolvedBy"],
      weight: 1,
      roles: EDGE_ROLE_RECEIVER_MEMBER,
    });

    // `Widget.metodo` usa `Widget.campo`: mismo archivo, y el dueño del
    // destino (`Widget`) es prefijo del camino del origen (`Widget.metodo`).
    // La etapa es a propósito `global-uniqueness` y NO `self-receiver`: es la
    // forma exacta del segundo mecanismo que rompió el parche por nombre.
    const dentro = baselineSinTestigo();
    dentro.nodes.push(symNode("a.ts", ["Widget"], { family: "class-like" }));
    dentro.nodes.push(symNode("a.ts", ["Widget", "metodo"], { family: "function-like" }));
    dentro.nodes.push(symNode("a.ts", ["Widget", "campo"], { family: "other" }));
    dentro.edges.push(witnessDentro(["Widget", "metodo"], ["Widget", "campo"], "global-uniqueness"));
    dentro.nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" }));
    dentro.nodes.push(symNode("a.ts", ["DeadWidget", "helper"], { family: "function-like" }));
    const conDentro = detector.run(repoWith(graphOf(dentro.nodes, dentro.edges), FILES), testContext(detector, "*"));
    expect(conDentro.some((f) => f.locations[0]!.symbol === "helper")).toBe(false);

    // Una closure ANIDADA dentro del mismo tipo tampoco acredita: el criterio
    // es el PREFIJO del camino, no el contenedor inmediato.
    const anidada = baselineSinTestigo();
    anidada.nodes.push(symNode("a.ts", ["Widget"], { family: "class-like" }));
    anidada.nodes.push(symNode("a.ts", ["Widget", "metodo", "interna"], { family: "function-like" }));
    anidada.nodes.push(symNode("a.ts", ["Widget", "campo"], { family: "other" }));
    anidada.edges.push(witnessDentro(["Widget", "metodo", "interna"], ["Widget", "campo"], "self-receiver"));
    anidada.nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" }));
    anidada.nodes.push(symNode("a.ts", ["DeadWidget", "helper"], { family: "function-like" }));
    const conAnidada = detector.run(repoWith(graphOf(anidada.nodes, anidada.edges), FILES), testContext(detector, "*"));
    expect(conAnidada.some((f) => f.locations[0]!.symbol === "helper")).toBe(false);

    // …y la MISMA arista desde AFUERA del tipo dueño sí abre la puerta: lo que
    // decide es el cruce de dueño, no la atribución en general (eso ya lo
    // prueba el test de la ambigua, arriba) ni el nombre de la etapa.
    const afuera = baselineSinTestigo();
    afuera.nodes.push(symNode("a.ts", ["Widget"], { family: "class-like" }));
    afuera.nodes.push(symNode("a.ts", ["Widget", "campo"], { family: "other" }));
    afuera.edges.push(witnessDentro(["caller"], ["Widget", "campo"], "global-uniqueness"));
    afuera.nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" }));
    afuera.nodes.push(symNode("a.ts", ["DeadWidget", "helper"], { family: "function-like" }));
    const conAfuera = detector.run(repoWith(graphOf(afuera.nodes, afuera.edges), FILES), testContext(detector, "*"));
    expect(conAfuera.some((f) => f.locations[0]!.symbol === "helper")).toBe(true);
  });

  it("PUERTA 3: un rol `bare` NO abre la puerta — la brecha medida es la del receptor explícito", () => {
    const { nodes, edges } = baselineSinTestigo();
    edges.push({ ...memberUseWitness(), roles: EDGE_ROLE_BARE });
    nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" }));
    nodes.push(symNode("a.ts", ["DeadWidget", "helper"], { family: "function-like" }));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "helper")).toBe(false);
  });

  it("PUERTA 3: el testigo es POR LENGUAJE — uno en otro lenguaje no habilita a este", () => {
    const { nodes, edges } = baselineSinTestigo();
    nodes.push(symNode("otro.rb", ["Otra"], { family: "class-like" }));
    nodes.push(symNode("otro.rb", ["Otra", "usado"], { family: "function-like" }));
    edges.push(memberUseWitness("otro.rb", ["Otra", "usado"]));
    nodes.push(symNode("a.ts", ["DeadWidget"], { family: "class-like" }));
    nodes.push(symNode("a.ts", ["DeadWidget", "helper"], { family: "function-like" }));
    const files = [...FILES, { path: "otro.rb", lines: 20, language: "ruby" }];
    const findings = detector.run(repoWith(graphOf(nodes, edges), files), testContext(detector, "*"));
    expect(findings.some((f) => f.locations[0]!.symbol === "helper")).toBe(false);
  });

  /**
   * MEDIDO: esta puerta DESCARTABA, y descartar era peor que el problema. Con
   * el descarte, guava pasaba de 21.587 candidatos a 1 y newtonsoft-json de
   * 1.134 a 1 — java y csharp mudos, el modo de falla más caro de la ola
   * anterior — porque en esos dos lenguajes casi todo tipo de nivel superior
   * escribe `public` y sus miembros ya los filtra la PUERTA 3. Ver el
   * docstring de `exposureOf`.
   */
  it("PUERTA 4: visibilidad declarada PÚBLICA ⇒ se reporta con MENOS severidad y con la razón escrita, nunca descartado", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["ApiPublica"], { visibility: "public" }));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    const publica = findings.find((f) => f.locations[0]!.symbol === "ApiPublica");
    const sinDato = findings.find((f) => f.locations[0]!.symbol === "unusedC");
    expect(publica).toBeDefined();
    expect(publica!.severity).toBeLessThan(sinDato!.severity);
    expect(publica!.detail).toContain("alcanzable desde afuera");
  });

  it("PUERTA 4: visibilidad declarada CONFINADA ⇒ se reporta, con más severidad y con la nota propia", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["soloAdentro"], { visibility: "private" }));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    const confinada = findings.find((f) => f.locations[0]!.symbol === "soloAdentro");
    const sinDato = findings.find((f) => f.locations[0]!.symbol === "unusedC");
    expect(confinada).toBeDefined();
    expect(confinada!.severity).toBeGreaterThan(sinDato!.severity);
    expect(confinada!.detail).toContain("alcanzable SÓLO desde adentro");
  });

  /**
   * Go no tiene modificador de visibilidad: su ESPECIFICACIÓN define la
   * exportación por la primera letra del identificador
   * (https://go.dev/ref/spec#Exported_identifiers). Mismo tipo de regla —
   * de la especificación del lenguaje, leída por forma del nombre — que el
   * protocolo `__nombre__` de Python que este detector ya respeta.
   */
  it("PUERTA 4 en Go: el identificador exportado pesa menos que el no exportado, y los dos se reportan", () => {
    const nodes: CodeGraphNode[] = [
      symNode("m.go", ["caller"], { family: "other" }),
      symNode("m.go", ["Exportada"]),
      symNode("m.go", ["noExportada"]),
    ];
    const edges: CodeGraphEdge[] = [];
    // Relleno usado: sin él la proporción de nivel superior sin consumidores
    // cruza `libraryRatio` y los DOS pagan la misma rebaja, tapando lo que
    // este test mide. (`Exportada` no entra en la proporción: la decide
    // `exposureOf`.)
    for (const name of ["usadaA", "usadaB", "usadaC"]) {
      nodes.push(symNode("m.go", [name]));
      edges.push(refEdge("m.go", ["caller"], "m.go", [name]));
    }
    const files = [{ path: "m.go", lines: 40, language: "go" }];
    const findings = detector.run(repoWith(graphOf(nodes, edges), files), testContext(detector, "*"));
    const exportada = findings.find((f) => f.locations[0]!.symbol === "Exportada");
    const noExportada = findings.find((f) => f.locations[0]!.symbol === "noExportada");
    expect(exportada).toBeDefined();
    expect(noExportada).toBeDefined();
    expect(exportada!.severity).toBeLessThan(noExportada!.severity);
    expect(exportada!.detail).toContain("alcanzable desde afuera");
    // Y el NO exportado no cobra el premio de "confinada": en Go la regla sólo
    // es concluyente en un sentido — ver `exposureOf`.
    expect(noExportada!.detail).not.toContain("alcanzable SÓLO desde adentro");
  });

  it("PUERTA 4: el heurístico de repo `libraryRatio` sólo mira los símbolos SIN dato de exposición", () => {
    // 3 de 4 top-level SIN dato tienen consumidor ⇒ ratio 25% < 50% ⇒ no
    // parece biblioteca, así que `sinDatoMuerta` NO paga la rebaja de
    // "forma de biblioteca". Los 10 `public` sin consumidor no arrastran la
    // proporción: los decide `exposureOf`, uno por uno.
    const nodes: CodeGraphNode[] = [symNode("a.ts", ["caller"], { family: "other" })];
    const edges: CodeGraphEdge[] = [];
    for (const name of ["usada1", "usada2", "usada3"]) {
      nodes.push(symNode("a.ts", [name]));
      edges.push(refEdge("a.ts", ["caller"], "a.ts", [name]));
    }
    nodes.push(symNode("a.ts", ["sinDatoMuerta"]));
    for (let i = 0; i < 10; i++) nodes.push(symNode("a.ts", [`Publica${i}`], { visibility: "public" }));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    const muerta = findings.find((f) => f.locations[0]!.symbol === "sinDatoMuerta")!;
    expect(muerta.detail).not.toContain("forma de biblioteca");
    // Y las 10 públicas se reportan, todas por debajo de ella.
    const publicas = findings.filter((f) => (f.locations[0]!.symbol ?? "").startsWith("Publica"));
    expect(publicas).toHaveLength(10);
    for (const p of publicas) expect(p.severity).toBeLessThan(muerta.severity);
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * OLA Q — LA TERCERA FORMA DE SER MIEMBRO: EL RECEPTOR ESCRITO
   * (`CodeGraphNode.memberOfClassLike`, ver `isMemberOfType`)
   * ═══════════════════════════════════════════════════════════════════════ */

  /**
   * La brecha que este archivo tenía escrita desde la Ola O: una gramática que
   * declara el método CON RECEPTOR (campo `receiver`/`object`) lo deja colgado
   * del ARCHIVO, con `symbolPath` de un solo segmento y sin dueño, así que las
   * dos preguntas viejas de `isMemberOfType` responden "no es miembro" — cuando
   * al símbolo NO se llega por nombre desnudo, sino por `receptor.nombre(...)`.
   */
  it("PUERTA 3: un símbolo de NIVEL SUPERIOR con receptor escrito (`memberOfClassLike`) es un MIEMBRO — sin testigo en su lenguaje, queda callado", () => {
    const nodes: CodeGraphNode[] = [
      symNode("m.go", ["caller"], { family: "other" }),
      // Método con receptor: la gramática no lo anida, pero no se lo alcanza
      // por nombre desnudo.
      symNode("m.go", ["getOut"], { memberOfClassLike: true }),
      // Función de paquete del MISMO archivo, misma profundidad, sin receptor.
      symNode("m.go", ["libreDelPaquete"], { memberOfClassLike: false }),
    ];
    const files = [{ path: "m.go", lines: 40, language: "go" }];
    const findings = detector.run(repoWith(graphOf(nodes, []), files), testContext(detector, "*"));
    expect(
      findings.some((f) => f.locations[0]!.symbol === "getOut"),
      "sin arista `receiver-member` acreditada en go, el método con receptor no es medible",
    ).toBe(false);
    const libre = findings.find((f) => f.locations[0]!.symbol === "libreDelPaquete");
    expect(libre, "una función de paquete SIN receptor sigue siendo un candidato de nivel superior").toBeDefined();
    expect(libre!.locations[0]!.role).toBe("símbolo de nivel superior sin consumidores");
  });

  it("PUERTA 3: con el testigo en su lenguaje, el mismo método con receptor SÍ se reporta, y con rol y severidad de miembro", () => {
    const nodes: CodeGraphNode[] = [
      symNode("m.go", ["caller"], { family: "other" }),
      symNode("m.go", ["getOut"], { memberOfClassLike: true }),
      symNode("m.go", ["libreDelPaquete"], { memberOfClassLike: false }),
    ];
    const edges: CodeGraphEdge[] = [memberUseWitness("m.go", ["caller"])];
    const files = [{ path: "m.go", lines: 40, language: "go" }];
    const findings = detector.run(repoWith(graphOf(nodes, edges), files), testContext(detector, "*"));
    const metodo = findings.find((f) => f.locations[0]!.symbol === "getOut");
    const libre = findings.find((f) => f.locations[0]!.symbol === "libreDelPaquete");
    expect(metodo).toBeDefined();
    expect(metodo!.locations[0]!.role).toBe("miembro sin consumidores");
    expect(metodo!.detail).toContain("es un miembro");
    expect(metodo!.severity, "un miembro parte más abajo que un símbolo de nivel superior").toBeLessThan(
      libre!.severity,
    );
  });

  /**
   * LA REGRESIÓN QUE ESTE TEST IMPIDE, y es la razón de que el hecho se lea
   * SÓLO en la rama de nivel superior: `SymbolFacts.memberOfClassLike` es
   * `true` cuando el contenedor inmediato es `class-like` **O
   * `namespace-like`**. Leerlo sin más volvería miembro a toda clase declarada
   * dentro de un namespace — que es el caso medido en el docstring de
   * `isMemberOfType` (newtonsoft-json en UN hallazgo con el criterio de
   * profundidad).
   */
  it("PUERTA 3: `memberOfClassLike` NO se lee en un símbolo anidado — una clase dentro de un namespace lo trae en `true` y SIGUE sin ser miembro", () => {
    const { nodes, edges } = baselineSinTestigo();
    nodes.push(symNode("ns.cs", ["Espacio"], { family: "namespace-like" }));
    // Exactamente lo que `graph/symbols.ts` produce para esta forma.
    nodes.push(symNode("ns.cs", ["Espacio", "ClaseMuerta"], { family: "class-like", memberOfClassLike: true }));
    const files = [...FILES, { path: "ns.cs", lines: 40, language: "csharp" }];
    const findings = detector.run(repoWith(graphOf(nodes, edges), files), testContext(detector, "*"));
    const clase = findings.find((f) => f.locations[0]!.symbol === "ClaseMuerta");
    expect(clase, "sin testigo en csharp, si esto fuera miembro la PUERTA 3 lo callaría").toBeDefined();
    expect(clase!.locations[0]!.role).toBe("símbolo de nivel superior sin consumidores");
  });

  it("AUSENTE ≠ `false`: un nodo de nivel superior SIN el hecho calculado se comporta igual que antes de esta ola", () => {
    const { nodes, edges } = baselineSinTestigo();
    // `symNode` no pone `memberOfClassLike`: es el literal a mano de siempre.
    nodes.push(symNode("a.ts", ["sinElHecho"]));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    const hallazgo = findings.find((f) => f.locations[0]!.symbol === "sinElHecho");
    expect(hallazgo).toBeDefined();
    expect(hallazgo!.locations[0]!.role).toBe("símbolo de nivel superior sin consumidores");
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * OLA Q — PUERTA 4: `CodeGraphNode.exported` como evidencia NEGATIVA
   * ═══════════════════════════════════════════════════════════════════════ */

  it("PUERTA 4: un símbolo de nivel superior con `exported: false` es CONFINADO — más severidad y la nota propia", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["noExportada"], { exported: false }));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    const confinada = findings.find((f) => f.locations[0]!.symbol === "noExportada");
    const sinDato = findings.find((f) => f.locations[0]!.symbol === "unusedC");
    expect(confinada).toBeDefined();
    expect(confinada!.detail).toContain("alcanzable SÓLO desde adentro");
    expect(confinada!.severity).toBeGreaterThan(sinDato!.severity);
  });

  /**
   * `exported: true` es el DEFAULT PERMISIVO de seis de las nueve gramáticas
   * (`graph/symbols.ts`: Ruby/Python/Go/Java/C# no exponen ningún concepto de
   * export de archivo, y un `.ts` sin un solo `export` tampoco prueba nada), así
   * que no es evidencia de exposición y este detector no lo lee.
   */
  it("PUERTA 4: `exported: true` NO declara exposición — es el default permisivo, y no cambia nada", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["conDefaultPermisivo"], { exported: true }));
    nodes.push(symNode("a.ts", ["sinElHecho"]));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    const conDefault = findings.find((f) => f.locations[0]!.symbol === "conDefaultPermisivo")!;
    const sinHecho = findings.find((f) => f.locations[0]!.symbol === "sinElHecho")!;
    expect(conDefault.severity).toBe(sinHecho.severity);
    expect(conDefault.detail).not.toContain("alcanzable desde afuera");
  });

  /**
   * `extractSymbols` deja `exported: false` en TODO lo anidado de un archivo
   * que use `export` (el flag se consume al llegar a la primera declaración
   * real), así que un método de una clase EXPORTADA también lo trae en `false`.
   * Eso no dice nada de la alcanzabilidad del método — por eso el hecho se lee
   * sólo en la rama de nivel superior.
   */
  it("PUERTA 4: `exported: false` en un MIEMBRO no otorga confinamiento", () => {
    const { nodes, edges } = baseline();
    nodes.push(symNode("a.ts", ["Exportada"], { family: "class-like", exported: true }));
    nodes.push(symNode("a.ts", ["Exportada", "metodoMuerto"], { exported: false }));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    const metodo = findings.find((f) => f.locations[0]!.symbol === "metodoMuerto");
    expect(metodo).toBeDefined();
    expect(metodo!.detail).not.toContain("alcanzable SÓLO desde adentro");
  });

  it("PUERTA 4: un símbolo con `exported: false` sale del denominador del heurístico de repo (`libraryRatio` sólo mira los `sin-dato`)", () => {
    const nodes: CodeGraphNode[] = [symNode("a.ts", ["caller"], { family: "other" })];
    const edges: CodeGraphEdge[] = [];
    // 1 sin-dato usada + 1 sin-dato muerta ⇒ ratio 50% = umbral… salvo que las
    // 10 no exportadas entren al denominador, en cuyo caso el ratio se dispara.
    nodes.push(symNode("a.ts", ["usada"]));
    edges.push(refEdge("a.ts", ["caller"], "a.ts", ["usada"]));
    nodes.push(symNode("a.ts", ["sinDatoMuerta"]));
    for (let i = 0; i < 10; i++) nodes.push(symNode("a.ts", [`Interna${i}`], { exported: false }));
    const findings = detector.run(repoWith(graphOf(nodes, edges), FILES), testContext(detector, "*"));
    const internas = findings.filter((f) => (f.locations[0]!.symbol ?? "").startsWith("Interna"));
    expect(internas).toHaveLength(10);
    for (const i of internas) expect(i.detail).not.toContain("forma de biblioteca");
  });
});
