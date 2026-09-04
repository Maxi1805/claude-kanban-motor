import { describe, expect, it } from "vitest";

import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind, type Provenance } from "../../graph/types.js";
import { DETECTORS } from "../registry.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoUnit } from "../types.js";
import { detector, ROLE_OPERATION, ROLE_SITE, ROLE_TREATMENT } from "./invariant-scaffold-varying-call.js";

/**
 * `inter-file`, `needsGraph: true`: este detector no lee ni una gramática —
 * corre enteramente sobre `CodeGraph`, así que (igual que
 * `repeated-collaborator-set.test.ts` y `middle-man.test.ts` documentan para su
 * propio caso) "≥3 lenguajes que emiten" no aplica: el grafo se construye A
 * MANO. La FORMA que busca —varios lugares que invocan el mismo conjunto de
 * colaboradores y difieren en UNA sola llamada— existe en las nueve gramáticas
 * soportadas sin cambiar de aspecto. Por eso `needs: []` y por eso no hay un
 * test "no aplicable sin <capability>" (regla G3).
 */

function symNode(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "function-like", startLine: 1, endLine: 5, arity: 1, ...overrides };
}

function edge(fromFile: string, fromPath: readonly string[], toFile: string, toPath: readonly string[], kind: EdgeKind = "calls", provenance: Provenance = "resolved"): CodeGraphEdge {
  return { from: symbolNodeId(fromFile, fromPath), to: symbolNodeId(toFile, toPath), kind, provenance, weight: 1 };
}

function repoOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): RepoUnit {
  const files: FileSummary[] = [...new Set(nodes.map((n) => n.file))].map((path) => ({ path, lines: 40, language: "typescript" }));
  const graph: CodeGraph = { nodes: [...nodes], edges: [...edges], resolution: {} as never };
  return { repoName: "fixture", files, functions: [], clones: [], graph };
}

function run(repo: RepoUnit) {
  return detector.run(repo, testContext(detector, "typescript", []) as never);
}

/** Los TRES colaboradores del tratamiento invariante. */
const TREATMENT: readonly (readonly [string, readonly string[]])[] = [
  ["infra/log.ts", ["registrar"]],
  ["infra/tx.ts", ["abrir"]],
  ["infra/tx.ts", ["cerrar"]],
];

function treatmentNodes(): CodeGraphNode[] {
  return TREATMENT.map(([file, path]) => symNode(file, path));
}

/**
 * Un lugar que invoca TODO el tratamiento más SU operación propia.
 * `opArity` permite romper la condición (3) sin tocar nada más.
 */
function site(file: string, name: string, opFile: string, opName: string, opArity: number | null = 1, extraCalls: readonly (readonly [string, readonly string[]])[] = []) {
  return {
    nodes: [symNode(file, [name]), symNode(opFile, [opName], { arity: opArity ?? undefined, ...(opArity === null ? { arity: undefined } : {}) })],
    edges: [
      ...TREATMENT.map(([tf, tp]) => edge(file, [name], tf, tp)),
      edge(file, [name], opFile, [opName]),
      ...extraCalls.map(([ef, ep]) => edge(file, [name], ef, ep)),
    ],
  };
}

/** El escenario canónico: TRES lugares en TRES archivos, cada uno con su operación. */
function canonical(extraNodes: readonly CodeGraphNode[] = [], extraEdges: readonly CodeGraphEdge[] = []): RepoUnit {
  const sites = [
    site("web/uno.ts", "manejaUno", "srv/uno.ts", "guardarUno"),
    site("web/dos.ts", "manejaDos", "srv/dos.ts", "guardarDos"),
    site("web/tres.ts", "manejaTres", "srv/tres.ts", "guardarTres"),
  ];
  return repoOf([...treatmentNodes(), ...sites.flatMap((s) => s.nodes), ...extraNodes], [...sites.flatMap((s) => s.edges), ...extraEdges]);
}

describe("invariant-scaffold-varying-call — la forma completa", () => {
  it("tres lugares en tres archivos con el mismo tratamiento y una operación propia cada uno ⇒ UN hallazgo", () => {
    const findings = run(canonical());
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.title).toContain("3 lugares");
    // [colaboradores del tratamiento, lugares, archivos]
    expect(f.trigger.map((t) => t.value)).toEqual([3, 3, 3]);
  });

  it("marca cada ubicación con su rol: lugar que repite, operación soldada y colaborador del tratamiento", () => {
    const f = run(canonical())[0]!;
    const roles = f.locations.map((l) => l.role);
    expect(roles.filter((r) => r.startsWith(ROLE_SITE))).toHaveLength(3);
    expect(roles.filter((r) => r.startsWith(ROLE_OPERATION))).toHaveLength(3);
    expect(roles.filter((r) => r.startsWith(ROLE_TREATMENT))).toHaveLength(3);
  });

  it("publica la aridad común y las operaciones, que es lo que la hipótesis necesita para decidir", () => {
    const f = run(canonical())[0]!;
    const aridad = (f.evidence ?? []).find((e) => e.label.includes("aridad común"));
    expect(aridad?.value).toBe(1);
    expect(f.detail).toContain("guardarUno");
    expect(f.detail).toContain("guardarDos");
    expect(f.detail).toContain("guardarTres");
  });

  it("aconseja Command como patrón de diseño, no como refactorización a secas", () => {
    const f = run(canonical())[0]!;
    expect(f.advice.primary.kind).toBe("patron_de_diseno");
    expect(f.advice.primary.name).toBe("Command");
  });
});

describe("invariant-scaffold-varying-call — ESCALA: una exclusión por cada piso", () => {
  it("DOS lugares no alcanzan: la mitigación barata es una función que reciba la operación", () => {
    const sites = [
      site("web/uno.ts", "manejaUno", "srv/uno.ts", "guardarUno"),
      site("web/dos.ts", "manejaDos", "srv/dos.ts", "guardarDos"),
    ];
    expect(run(repoOf([...treatmentNodes(), ...sites.flatMap((s) => s.nodes)], sites.flatMap((s) => s.edges)))).toEqual([]);
  });

  it("DOS colaboradores compartidos no alcanzan: copiar dos llamadas es más barato que un protocolo", () => {
    const dos: readonly (readonly [string, readonly string[]])[] = [
      ["infra/log.ts", ["registrar"]],
      ["infra/tx.ts", ["abrir"]],
    ];
    const nodes = dos.map(([f, p]) => symNode(f, p));
    const mk = (file: string, name: string, opFile: string, opName: string) => ({
      nodes: [symNode(file, [name]), symNode(opFile, [opName])],
      edges: [...dos.map(([tf, tp]) => edge(file, [name], tf, tp)), edge(file, [name], opFile, [opName])],
    });
    const sites = [mk("web/uno.ts", "u", "srv/uno.ts", "gu"), mk("web/dos.ts", "d", "srv/dos.ts", "gd"), mk("web/tres.ts", "t", "srv/tres.ts", "gt")];
    expect(run(repoOf([...nodes, ...sites.flatMap((s) => s.nodes)], sites.flatMap((s) => s.edges)))).toEqual([]);
  });

  it("los tres lugares en UN SOLO archivo no alcanzan: un ayudante privado los unifica sin crear nada", () => {
    const sites = [
      site("web/todo.ts", "manejaUno", "srv/uno.ts", "guardarUno"),
      site("web/todo.ts", "manejaDos", "srv/dos.ts", "guardarDos"),
      site("web/todo.ts", "manejaTres", "srv/tres.ts", "guardarTres"),
    ];
    expect(run(repoOf([...treatmentNodes(), ...sites.flatMap((s) => s.nodes)], sites.flatMap((s) => s.edges)))).toEqual([]);
  });
});

describe("invariant-scaffold-varying-call — LA RANURA VARIABLE, que es lo que lo separa de Facade y de Strategy", () => {
  it("SIN ranura (los tres invocan exactamente lo mismo) ⇒ silencio: eso es Facade, no Command", () => {
    const mk = (file: string, name: string) => ({
      node: symNode(file, [name]),
      edges: TREATMENT.map(([tf, tp]) => edge(file, [name], tf, tp)),
    });
    const sites = [mk("web/uno.ts", "u"), mk("web/dos.ts", "d"), mk("web/tres.ts", "t")];
    expect(run(repoOf([...treatmentNodes(), ...sites.map((s) => s.node)], sites.flatMap((s) => s.edges)))).toEqual([]);
  });

  it("ranura de DOS símbolos propios ⇒ silencio: lo que varía es un sub-algoritmo (Strategy), no una operación", () => {
    const sites = [
      site("web/uno.ts", "u", "srv/uno.ts", "gu", 1, [["srv/uno.ts", ["extraUno"]]]),
      site("web/dos.ts", "d", "srv/dos.ts", "gd", 1, [["srv/dos.ts", ["extraDos"]]]),
      site("web/tres.ts", "t", "srv/tres.ts", "gt", 1, [["srv/tres.ts", ["extraTres"]]]),
    ];
    const extras = [
      symNode("srv/uno.ts", ["extraUno"]),
      symNode("srv/dos.ts", ["extraDos"]),
      symNode("srv/tres.ts", ["extraTres"]),
    ];
    expect(run(repoOf([...treatmentNodes(), ...sites.flatMap((s) => s.nodes), ...extras], sites.flatMap((s) => s.edges)))).toEqual([]);
  });

  it("operaciones de aridad DISTINTA ⇒ silencio: ningún miembro único puede alojarlas", () => {
    const sites = [
      site("web/uno.ts", "u", "srv/uno.ts", "gu", 1),
      site("web/dos.ts", "d", "srv/dos.ts", "gd", 2),
      site("web/tres.ts", "t", "srv/tres.ts", "gt", 3),
    ];
    expect(run(repoOf([...treatmentNodes(), ...sites.flatMap((s) => s.nodes)], sites.flatMap((s) => s.edges)))).toEqual([]);
  });

  it("una operación de aridad DESCONOCIDA ⇒ silencio: no se afirma 'intercambiables' sin confirmarlo", () => {
    const sites = [
      site("web/uno.ts", "u", "srv/uno.ts", "gu", 1),
      site("web/dos.ts", "d", "srv/dos.ts", "gd", 1),
      site("web/tres.ts", "t", "srv/tres.ts", "gt", 1),
    ];
    const nodes = [...treatmentNodes(), ...sites.flatMap((s) => s.nodes)].map((n) =>
      n.id === symbolNodeId("srv/tres.ts", ["gt"]) ? { ...n, arity: undefined } : n,
    );
    expect(run(repoOf(nodes, sites.flatMap((s) => s.edges)))).toEqual([]);
  });
});

describe("invariant-scaffold-varying-call — RESOLUCIÓN VERIFICADA: la trampa, en sus tres formas", () => {
  it("(5a) si un lugar del grupo YA es invocado por otro del grupo ⇒ silencio: el invocador único ya existe", () => {
    const extra = edge("web/uno.ts", ["manejaUno"], "web/dos.ts", ["manejaDos"]);
    expect(run(canonical([], [extra]))).toEqual([]);
  });

  it("(5b) si los dueños de las operaciones YA comparten un protocolo real ⇒ silencio: Command ya está", () => {
    // Dos operaciones que son MIEMBROS de dos clases que implementan la misma
    // interfaz, con un miembro común por (nombre, aridad).
    const iface = symNode("srv/proto.ts", ["Operacion"], { family: "class-like" });
    const claseA = symNode("srv/uno.ts", ["OpUno"], { family: "class-like" });
    const claseB = symNode("srv/dos.ts", ["OpDos"], { family: "class-like" });
    // el miembro COMÚN por (nombre, aridad) que prueba el protocolo real
    const comunA = symNode("srv/uno.ts", ["ejecutar"], { arity: 2 });
    const comunB = symNode("srv/dos.ts", ["ejecutar"], { arity: 2 });
    const extraEdges = [
      { from: claseA.id, to: symbolNodeId("srv/uno.ts", ["guardarUno"]), kind: "contains" as EdgeKind, provenance: "declared" as Provenance, weight: 1 },
      { from: claseB.id, to: symbolNodeId("srv/dos.ts", ["guardarDos"]), kind: "contains" as EdgeKind, provenance: "declared" as Provenance, weight: 1 },
      { from: claseA.id, to: comunA.id, kind: "contains" as EdgeKind, provenance: "declared" as Provenance, weight: 1 },
      { from: claseB.id, to: comunB.id, kind: "contains" as EdgeKind, provenance: "declared" as Provenance, weight: 1 },
      { from: claseA.id, to: iface.id, kind: "implements" as EdgeKind, provenance: "declared" as Provenance, weight: 1 },
      { from: claseB.id, to: iface.id, kind: "implements" as EdgeKind, provenance: "declared" as Provenance, weight: 1 },
    ];
    expect(run(canonical([iface, claseA, claseB, comunA, comunB], extraEdges))).toEqual([]);
  });

  it("(5b) interfaz compartida SIN miembro común NO calla: una marca vacía no es un protocolo", () => {
    const iface = symNode("srv/proto.ts", ["Marca"], { family: "class-like" });
    const claseA = symNode("srv/uno.ts", ["OpUno"], { family: "class-like" });
    const claseB = symNode("srv/dos.ts", ["OpDos"], { family: "class-like" });
    const extraEdges = [
      { from: claseA.id, to: symbolNodeId("srv/uno.ts", ["guardarUno"]), kind: "contains" as EdgeKind, provenance: "declared" as Provenance, weight: 1 },
      { from: claseB.id, to: symbolNodeId("srv/dos.ts", ["guardarDos"]), kind: "contains" as EdgeKind, provenance: "declared" as Provenance, weight: 1 },
      { from: claseA.id, to: iface.id, kind: "implements" as EdgeKind, provenance: "declared" as Provenance, weight: 1 },
      { from: claseB.id, to: iface.id, kind: "implements" as EdgeKind, provenance: "declared" as Provenance, weight: 1 },
    ];
    expect(run(canonical([iface, claseA, claseB], extraEdges))).toHaveLength(1);
  });

  it("(5c) si un portador YA sostiene dos operaciones y recibe invocación indirecta ⇒ silencio: la cola ya existe", () => {
    const portador = symNode("infra/cola.ts", ["pendientes"], { family: "other" });
    const invocador = symNode("infra/cola.ts", ["drenar"]);
    const extraEdges = [
      { from: portador.id, to: symbolNodeId("srv/uno.ts", ["guardarUno"]), kind: "carries" as EdgeKind, provenance: "resolved" as Provenance, weight: 1 },
      { from: portador.id, to: symbolNodeId("srv/dos.ts", ["guardarDos"]), kind: "carries" as EdgeKind, provenance: "resolved" as Provenance, weight: 1 },
      { from: invocador.id, to: portador.id, kind: "invokes-indirect" as EdgeKind, provenance: "resolved" as Provenance, weight: 1 },
    ];
    expect(run(canonical([portador, invocador], extraEdges))).toEqual([]);
  });

  it("un portador SIN invocación indirecta NO calla el hallazgo: llevar el valor no es ejecutarlo diferido", () => {
    const portador = symNode("infra/cola.ts", ["pendientes"], { family: "other" });
    const extraEdges = [
      { from: portador.id, to: symbolNodeId("srv/uno.ts", ["guardarUno"]), kind: "carries" as EdgeKind, provenance: "resolved" as Provenance, weight: 1 },
      { from: portador.id, to: symbolNodeId("srv/dos.ts", ["guardarDos"]), kind: "carries" as EdgeKind, provenance: "resolved" as Provenance, weight: 1 },
    ];
    expect(run(canonical([portador], extraEdges))).toHaveLength(1);
  });
});

describe("invariant-scaffold-varying-call — el discriminador de hermandad viaja, no es compuerta", () => {
  it("lugares hermanos de una jerarquía: SIGUE emitiendo, y lo dice en la evidencia", () => {
    const base = symNode("web/base.ts", ["Base"], { family: "class-like" });
    const clases = ["Uno", "Dos", "Tres"].map((n, i) => symNode(`web/${["uno", "dos", "tres"][i]}.ts`, [`C${n}`], { family: "class-like" }));
    const nombres = ["manejaUno", "manejaDos", "manejaTres"];
    const archivos = ["web/uno.ts", "web/dos.ts", "web/tres.ts"];
    const extraEdges: CodeGraphEdge[] = [];
    clases.forEach((c, i) => {
      extraEdges.push({ from: c.id, to: symbolNodeId(archivos[i]!, [nombres[i]!]), kind: "contains", provenance: "declared", weight: 1 });
      extraEdges.push({ from: c.id, to: base.id, kind: "extends", provenance: "declared", weight: 1 });
    });
    const findings = run(canonical([base, ...clases], extraEdges));
    expect(findings).toHaveLength(1);
    const hermandad = (findings[0]!.evidence ?? []).find((e) => e.label.includes("comparten ancestro"));
    expect(hermandad?.value).toBe(1);
    expect(hermandad?.note).toContain("Pull Up");
  });

  it("sin ancestro común, la evidencia lo dice igual — el número viaja en los dos sentidos", () => {
    const hermandad = (run(canonical())[0]!.evidence ?? []).find((e) => e.label.includes("comparten ancestro"));
    expect(hermandad?.value).toBe(0);
  });
});

describe("invariant-scaffold-varying-call — lo ambiguo viaja como ambiguo", () => {
  it("una arista ambigua cuenta como invocación, y el hallazgo publica cuántas NO lo son", () => {
    const sites = [
      site("web/uno.ts", "manejaUno", "srv/uno.ts", "guardarUno"),
      site("web/dos.ts", "manejaDos", "srv/dos.ts", "guardarDos"),
      site("web/tres.ts", "manejaTres", "srv/tres.ts", "guardarTres"),
    ];
    const edges = sites.flatMap((s) => s.edges).map((e) => ({ ...e, provenance: "ambiguous" as Provenance }));
    const findings = run(repoOf([...treatmentNodes(), ...sites.flatMap((s) => s.nodes)], edges));
    expect(findings).toHaveLength(1);
    expect((findings[0]!.evidence ?? []).find((e) => e.label.includes("colaboradores del tratamiento con al menos una arista NO ambigua"))?.value).toBe(0);
    expect((findings[0]!.evidence ?? []).find((e) => e.label.includes("operaciones con arista NO ambigua"))?.value).toBe(0);
  });
});

describe("invariant-scaffold-varying-call — una candidata por causa", () => {
  it("dos tratamientos distintos sobre los MISMOS lugares producen UN solo hallazgo", () => {
    // un cuarto colaborador que también comparten los tres: hay dos
    // tratamientos válidos (el de 3 y el de 4) sobre el mismo trío de lugares.
    const cuarto = symNode("infra/metric.ts", ["medir"]);
    const extra = ["web/uno.ts", "web/dos.ts", "web/tres.ts"].map((f, i) =>
      edge(f, [["manejaUno", "manejaDos", "manejaTres"][i]!], "infra/metric.ts", ["medir"]),
    );
    const findings = run(canonical([cuarto], extra));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(4);
  });
});

describe("invariant-scaffold-varying-call — contrato de registro", () => {
  it("está registrado, es inter-file y declara el grafo y las aristas que necesita", () => {
    const registrado = DETECTORS.find((d) => d.id === "invariant-scaffold-varying-call");
    expect(registrado).toBe(detector);
    expect(detector.scope).toBe("inter-file");
    expect(detector.needsGraph).toBe(true);
    expect(detector.needsEdges).toEqual(["calls"]);
    expect(detector.needs).toEqual([]);
  });

  it("sin grafo devuelve vacío, sin explotar", () => {
    expect(detector.run({ repoName: "x", files: [], functions: [], clones: [], graph: null }, testContext(detector, "typescript", []) as never)).toEqual([]);
  });
});
