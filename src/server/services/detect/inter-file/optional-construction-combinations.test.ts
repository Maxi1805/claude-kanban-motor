import { describe, expect, it } from "vitest";

import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind, type Provenance } from "../../graph/types.js";
import { DETECTORS } from "../registry.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoUnit } from "../types.js";
import { detector, ROLE_DOOR, ROLE_SITE } from "./optional-construction-combinations.js";

/**
 * `inter-file`, `needsGraph: true`: este detector no lee ni una gramática —
 * corre enteramente sobre `CodeGraph`, así que (igual que
 * `repeated-collaborator-set.test.ts` y `middle-man.test.ts` documentan para su
 * propio caso) "≥3 lenguajes que emiten" no aplica: el grafo se construye A
 * MANO, sin tree-sitter. La FORMA que busca —una entidad construida desde
 * varios sitios con cantidades distintas de argumentos— existe en las nueve
 * gramáticas soportadas sin cambiar de aspecto; lo que SÍ cambia por lenguaje
 * es cuál de las dos puertas aparece (el tipo invocado como función en
 * Python/Ruby/Go/JS, el miembro constructor en Java/C#/TS), y hay un test para
 * cada una. Por eso `needs: []` y por eso no hay un test "no aplicable sin
 * <capability>" (regla G3: sólo aplica a detectores con `needs` no vacío).
 */

const TYPE_FILE = "model/widget.ts";
const TYPE_PATH = ["Widget"] as const;

function symNode(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "function-like", startLine: 1, endLine: 5, ...overrides };
}

function edge(
  fromFile: string,
  fromPath: readonly string[],
  toFile: string,
  toPath: readonly string[],
  kind: EdgeKind = "calls",
  extra: Partial<CodeGraphEdge> = {},
): CodeGraphEdge {
  return { from: symbolNodeId(fromFile, fromPath), to: symbolNodeId(toFile, toPath), kind, provenance: "resolved" as Provenance, weight: 1, ...extra };
}

function repoOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): RepoUnit {
  const files: FileSummary[] = [...new Set(nodes.map((n) => n.file))].map((path) => ({ path, lines: 40, language: "typescript" }));
  const graph: CodeGraph = { nodes: [...nodes], edges: [...edges], resolution: {} as never };
  return { repoName: "fixture", files, functions: [], clones: [], graph };
}

function run(repo: RepoUnit) {
  return detector.run(repo, testContext(detector, "typescript", []) as never);
}

/** El tipo construido: un `class-like` invocado como función (Python/Ruby/Go/JS). */
function typeNode(): CodeGraphNode {
  return symNode(TYPE_FILE, TYPE_PATH, { family: "class-like" });
}

/** Un sitio que construye el tipo pasando `arities` argumentos. */
function site(file: string, name: string, arities: readonly number[], extra: Partial<CodeGraphEdge> = {}): { node: CodeGraphNode; edge: CodeGraphEdge } {
  return {
    node: symNode(file, [name]),
    edge: edge(file, [name], TYPE_FILE, TYPE_PATH, "calls", { callArities: arities, ...extra }),
  };
}

/** El escenario base: N sitios, cada uno con su lista de cantidades de argumentos. */
function scenario(
  sites: readonly (readonly [string, string, readonly number[]])[],
  extraNodes: readonly CodeGraphNode[] = [],
  extraEdges: readonly CodeGraphEdge[] = [],
): RepoUnit {
  const built = sites.map(([file, name, arities]) => site(file, name, arities));
  return repoOf([typeNode(), ...built.map((b) => b.node), ...extraNodes], [...built.map((b) => b.edge), ...extraEdges]);
}

/** Tres sitios, tres cantidades distintas (1, 2, 5): rango 4, la forma completa. */
const TRES_SITIOS = [
  ["app/uno.ts", "creaUno", [1]],
  ["app/dos.ts", "creaDos", [2]],
  ["app/tres.ts", "creaTres", [5]],
] as const;

describe("optional-construction-combinations — la forma completa", () => {
  it("tres sitios que construyen el mismo tipo con 1, 2 y 5 argumentos ⇒ UN hallazgo", () => {
    const findings = run(scenario(TRES_SITIOS));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.title).toContain("Widget");
    // [combinaciones, rango, sitios]
    expect(f.trigger.map((t) => t.value)).toEqual([3, 4, 3]);
  });

  it("marca cada ubicación con su rol: la puerta de construcción y los sitios", () => {
    const f = run(scenario(TRES_SITIOS))[0]!;
    const puerta = f.locations.filter((l) => l.role.startsWith(ROLE_DOOR));
    const sitios = f.locations.filter((l) => l.role.startsWith(ROLE_SITE)).map((l) => l.file);
    expect(puerta).toHaveLength(1);
    expect(puerta[0]!.file).toBe(TYPE_FILE);
    expect(sitios.sort()).toEqual(["app/dos.ts", "app/tres.ts", "app/uno.ts"]);
  });

  it("la evidencia publica las cantidades observadas y declara si la aridad de la puerta se conoce", () => {
    const f = run(scenario(TRES_SITIOS))[0]!;
    expect(f.evidence?.find((e) => e.label.includes("cantidades de argumentos"))?.note).toBe("1, 2, 5");
    expect(f.evidence?.find((e) => e.label.includes("parámetros declarados"))?.note).toContain("no se sabe");
  });

  it("el consejo mecánico va primero y el patrón después (Builder nunca es el `primary`)", () => {
    const f = run(scenario(TRES_SITIOS))[0]!;
    expect(f.advice.primary.kind).toBe("refactorizacion");
    expect(f.advice.pattern?.name).toBe("Builder");
  });

  it("UN SOLO sitio puede aportar varias cantidades: el hecho es del sitio de uso, no del símbolo que lo contiene", () => {
    // Dos sitios, pero uno de ellos construye con 1 y con 6 argumentos en
    // llamadas distintas ⇒ 3 cantidades y rango 5, pero SÓLO 2 sitios: la
    // condición de ESCALA (4) sigue mandando y no emite.
    expect(
      run(
        scenario([
          ["app/uno.ts", "creaUno", [1, 6]],
          ["app/dos.ts", "creaDos", [3]],
        ]),
      ),
    ).toEqual([]);
  });
});

describe("optional-construction-combinations — una exclusión por condición", () => {
  it("(1) la puerta no es un tipo ni un miembro constructor ⇒ nada: eso es una función con argumentos opcionales", () => {
    // Mismo grafo, pero el destino es `function-like` suelto: el remedio ahí es
    // un objeto de parámetros o una sobrecarga, nunca un Builder.
    const built = TRES_SITIOS.map(([file, name, arities]) => site(file, name, arities));
    const repo = repoOf([symNode(TYPE_FILE, TYPE_PATH), ...built.map((b) => b.node)], built.map((b) => b.edge));
    expect(run(repo)).toEqual([]);
  });

  it("(2) sólo DOS cantidades distintas ⇒ nada: eso es UN interruptor, lo resuelve un valor por defecto", () => {
    expect(
      run(
        scenario([
          ["app/uno.ts", "creaUno", [1]],
          ["app/dos.ts", "creaDos", [1]],
          ["app/tres.ts", "creaTres", [5]],
        ]),
      ),
    ).toEqual([]);
  });

  it("(3) tres cantidades pero rango 2 ⇒ nada: con dos ranuras opcionales el remedio nativo cuesta menos", () => {
    expect(
      run(
        scenario([
          ["app/uno.ts", "creaUno", [1]],
          ["app/dos.ts", "creaDos", [2]],
          ["app/tres.ts", "creaTres", [3]],
        ]),
      ),
    ).toEqual([]);
  });

  it("(4) sólo DOS sitios ⇒ nada: la mitigación barata es una segunda fábrica con nombre", () => {
    expect(
      run(
        scenario([
          ["app/uno.ts", "creaUno", [1]],
          ["app/dos.ts", "creaDos", [5]],
        ]),
      ),
    ).toEqual([]);
  });

  it("las aristas AMBIGUAS no cuentan: un homónimo mal resuelto no es opcionalidad medida", () => {
    const built = TRES_SITIOS.map(([file, name, arities]) => site(file, name, arities, { provenance: "ambiguous" }));
    expect(run(repoOf([typeNode(), ...built.map((b) => b.node)], built.map((b) => b.edge)))).toEqual([]);
  });

  it("una arista `calls` SIN lista de argumentos no aporta un sitio (ausente ≠ cero argumentos)", () => {
    const conArgs = [
      ["app/uno.ts", "creaUno", [1]],
      ["app/dos.ts", "creaDos", [5]],
    ] as const;
    const built = conArgs.map(([file, name, arities]) => site(file, name, arities));
    const mudo = symNode("app/tres.ts", ["creaTres"]);
    const mudoEdge = edge("app/tres.ts", ["creaTres"], TYPE_FILE, TYPE_PATH);
    expect(run(repoOf([typeNode(), ...built.map((b) => b.node), mudo], [...built.map((b) => b.edge), mudoEdge]))).toEqual([]);
  });
});

describe("optional-construction-combinations — LA TRAMPA: alguien ya acumula ⇒ silencio", () => {
  it("(5a) si uno de los sitios ya embudó a DOS de los otros, NO emite: esa fábrica ya existe", () => {
    expect(
      run(
        scenario(TRES_SITIOS, [], [
          edge("app/dos.ts", ["creaDos"], "app/uno.ts", ["creaUno"]),
          edge("app/tres.ts", ["creaTres"], "app/uno.ts", ["creaUno"]),
        ]),
      ),
    ).toEqual([]);
  });

  it("(5a) que UN SOLO sitio pase por otro no alcanza para callarlo: eso es media puerta, no la puerta", () => {
    expect(
      run(scenario(TRES_SITIOS, [], [edge("app/dos.ts", ["creaDos"], "app/uno.ts", ["creaUno"])])),
    ).toHaveLength(1);
  });

  it("(5b) si ya existe un Builder para el tipo (≥3 setters de un argumento + un `build()` sin argumentos que lo instancia), NO emite", () => {
    const builderFile = "model/widget-builder.ts";
    const builder = symNode(builderFile, ["WidgetBuilder"], { family: "class-like" });
    const setters = ["conAlto", "conAncho", "conColor"].map((n) => symNode(builderFile, ["WidgetBuilder", n], { arity: 1 }));
    const build = symNode(builderFile, ["WidgetBuilder", "build"], { arity: 0 });
    const edges = [
      ...setters.map((s) => edge(builderFile, s.symbolPath, builderFile, ["WidgetBuilder"], "contains")),
      edge(builderFile, build.symbolPath, builderFile, ["WidgetBuilder"], "contains"),
      edge(builderFile, build.symbolPath, TYPE_FILE, TYPE_PATH, "instantiates"),
    ].map((e) => (e.kind === "contains" ? { ...e, from: builder.id, to: e.from } : e));
    expect(run(scenario(TRES_SITIOS, [builder, ...setters, build], edges))).toEqual([]);
  });

  it("(5b) un tipo con setters pero SIN un miembro sin argumentos que lo instancie NO es un Builder: sigue emitiendo", () => {
    const otroFile = "model/otro.ts";
    const otro = symNode(otroFile, ["Otro"], { family: "class-like" });
    const setters = ["a", "b", "c"].map((n) => symNode(otroFile, ["Otro", n], { arity: 1 }));
    const edges = setters.map((s) => ({ ...edge(otroFile, ["Otro"], otroFile, s.symbolPath, "contains") }));
    expect(run(scenario(TRES_SITIOS, [otro, ...setters], edges))).toHaveLength(1);
  });
});

describe("optional-construction-combinations — las DOS puertas de construcción", () => {
  function ctorScenario(ctorNode: CodeGraphNode): RepoUnit {
    const type = typeNode();
    const built = TRES_SITIOS.map(([file, name, arities]) => ({
      node: symNode(file, [name]),
      edge: edge(file, [name], ctorNode.file, ctorNode.symbolPath, "calls", { callArities: arities }),
    }));
    return repoOf(
      [type, ctorNode, ...built.map((b) => b.node)],
      [{ ...edge(TYPE_FILE, TYPE_PATH, ctorNode.file, ctorNode.symbolPath, "contains") }, ...built.map((b) => b.edge)],
    );
  }

  it("Java/C#: el miembro con nodeType `constructor_declaration` es puerta del tipo que lo contiene", () => {
    const findings = run(ctorScenario(symNode(TYPE_FILE, ["Widget", "Widget"], { nodeType: "constructor_declaration", arity: 5 })));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence?.find((e) => e.label.includes("parámetros declarados"))?.value).toBe(5);
  });

  it("Ruby/Python/JS/TS: el miembro con nombre mandado (`__init__`) es puerta del tipo que lo contiene", () => {
    expect(run(ctorScenario(symNode(TYPE_FILE, ["Widget", "__init__"], { arity: 7 })))).toHaveLength(1);
  });

  it("un miembro cualquiera del tipo (no constructor) NO es puerta de construcción", () => {
    expect(run(ctorScenario(symNode(TYPE_FILE, ["Widget", "render"], { arity: 3 })))).toEqual([]);
  });
});

describe("optional-construction-combinations — contrato", () => {
  it("sin grafo devuelve vacío en vez de romper (el runner ya reporta `sin-grafo` antes)", () => {
    const repo: RepoUnit = { repoName: "x", files: [], functions: [], clones: [], graph: null };
    expect(run(repo)).toEqual([]);
  });

  it("está registrado, declara `calls` como arista mandatoria y su tier de impacto es `arquitectura`", async () => {
    expect(DETECTORS.some((d) => d.id === "optional-construction-combinations")).toBe(true);
    expect(detector.needsEdges).toEqual(["calls"]);
    expect(detector.scope).toBe("inter-file");
    expect(detector.needsGraph).toBe(true);
    const { DETECTOR_IMPACT } = await import("../impact.js");
    expect(DETECTOR_IMPACT["optional-construction-combinations"]).toBe("arquitectura");
  });

  it("los tres pisos de ESCALA están declarados con su razón escrita", () => {
    for (const key of ["combinaciones", "pasosOpcionales", "lugares"] as const) {
      const spec = detector.thresholds[key] as { kind: string; value: number; rationale?: string };
      expect(spec.kind).toBe("piso-declarado");
      expect(spec.value).toBe(3);
      expect(spec.rationale?.length ?? 0).toBeGreaterThan(80);
    }
  });
});
