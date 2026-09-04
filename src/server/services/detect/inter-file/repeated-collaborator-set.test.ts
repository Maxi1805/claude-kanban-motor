import { describe, expect, it } from "vitest";

import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind, type Provenance } from "../../graph/types.js";
import { DETECTORS } from "../registry.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoUnit } from "../types.js";
import { detector, ROLE_PIECE, ROLE_REPEATS } from "./repeated-collaborator-set.js";

/**
 * `inter-file`, `needsGraph: true`: este detector no lee ni una gramática —
 * corre enteramente sobre `CodeGraph`, así que (igual que `middle-man.test.ts`
 * y `unused-symbol.test.ts` documentan para su propio caso) "≥3 lenguajes que
 * emiten" no aplica: el grafo se construye A MANO, sin tree-sitter. La FORMA
 * que busca —varios lugares invocando el mismo conjunto de símbolos de varios
 * archivos— existe en las nueve gramáticas soportadas sin cambiar de aspecto:
 * no hay ninguna construcción de lenguaje involucrada, sólo aristas `calls`.
 * Por eso `needs: []` y por eso no hay un test "no aplicable sin <capability>"
 * (regla G3: sólo aplica a detectores con `needs` no vacío).
 */

function symNode(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "function-like", startLine: 1, endLine: 5, ...overrides };
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

/** Las CUATRO piezas del subsistema, un símbolo cada una. */
const PIECES: readonly (readonly [string, readonly string[]])[] = [
  ["sub/a.ts", ["openA"]],
  ["sub/b.ts", ["openB"]],
  ["sub/c.ts", ["openC"]],
  ["sub/d.ts", ["openD"]],
];

/** Cohesión entre las piezas: `a → b → c → d`, la condición (4). */
const COHESION: readonly CodeGraphEdge[] = [
  edge("sub/a.ts", ["openA"], "sub/b.ts", ["openB"]),
  edge("sub/b.ts", ["openB"], "sub/c.ts", ["openC"]),
  edge("sub/c.ts", ["openC"], "sub/d.ts", ["openD"]),
];

function pieceNodes(): CodeGraphNode[] {
  return PIECES.map(([file, path]) => symNode(file, path));
}

/** Un cliente que invoca TODAS las piezas por su cuenta. */
function clientCalling(file: string, name: string, pieces: readonly (readonly [string, readonly string[]])[] = PIECES): { node: CodeGraphNode; edges: CodeGraphEdge[] } {
  return {
    node: symNode(file, [name]),
    edges: pieces.map(([pf, pp]) => edge(file, [name], pf, pp)),
  };
}

function scenario(clients: readonly (readonly [string, string])[], extraNodes: readonly CodeGraphNode[] = [], extraEdges: readonly CodeGraphEdge[] = []): RepoUnit {
  const built = clients.map(([file, name]) => clientCalling(file, name));
  return repoOf([...pieceNodes(), ...built.map((b) => b.node), ...extraNodes], [...COHESION, ...built.flatMap((b) => b.edges), ...extraEdges]);
}

describe("repeated-collaborator-set — la forma completa", () => {
  it("tres lugares en tres archivos que repiten el mismo conjunto de cuatro piezas ⇒ UN hallazgo", () => {
    const findings = run(
      scenario([
        ["cli/uno.ts", "haceUno"],
        ["cli/dos.ts", "haceDos"],
        ["cli/tres.ts", "haceTres"],
      ]),
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.title).toContain("3 lugares");
    expect(f.trigger.map((t) => t.value)).toEqual([4, 3, 3]);
  });

  it("marca cada ubicación con su rol: los que repiten y las piezas del subsistema", () => {
    const f = run(
      scenario([
        ["cli/uno.ts", "haceUno"],
        ["cli/dos.ts", "haceDos"],
        ["cli/tres.ts", "haceTres"],
      ]),
    )[0]!;
    const repiten = f.locations.filter((l) => l.role.startsWith(ROLE_REPEATS)).map((l) => l.file);
    const piezas = f.locations.filter((l) => l.role.startsWith(ROLE_PIECE)).map((l) => l.file);
    expect(repiten.sort()).toEqual(["cli/dos.ts", "cli/tres.ts", "cli/uno.ts"]);
    expect(piezas.sort()).toEqual(["sub/a.ts", "sub/b.ts", "sub/c.ts", "sub/d.ts"]);
  });

  it("el consejo mecánico nombra los pasos y cuántos lugares los repiten", () => {
    const f = run(
      scenario([
        ["cli/uno.ts", "haceUno"],
        ["cli/dos.ts", "haceDos"],
        ["cli/tres.ts", "haceTres"],
      ]),
    )[0]!;
    expect(f.advice.primary.why).toContain("openA");
    expect(f.advice.primary.why).toContain("3 lugares");
  });
});

describe("repeated-collaborator-set — LA TRAMPA: la fachada YA existe ⇒ silencio", () => {
  it("(5b) si un archivo ajeno ya coordina TODAS las piezas y lo usan >= 2 archivos, NO emite", () => {
    // `puerta.ts` alcanza las cuatro piezas (una función por pieza, la forma
    // habitual de una fachada ya escrita) y la referencian dos archivos: la
    // puerta está puesta.
    const puertaNodes = PIECES.map((_, i) => symNode("puerta.ts", [`abrir${i}`]));
    const puertaEdges = [
      ...PIECES.map(([pf, pp], i) => edge("puerta.ts", [`abrir${i}`], pf, pp)),
      edge("otro/x.ts", ["usaX"], "puerta.ts", ["abrir0"]),
      edge("otro/y.ts", ["usaY"], "puerta.ts", ["abrir0"]),
    ];
    const findings = run(
      scenario(
        [
          ["cli/uno.ts", "haceUno"],
          ["cli/dos.ts", "haceDos"],
          ["cli/tres.ts", "haceTres"],
        ],
        [...puertaNodes, symNode("otro/x.ts", ["usaX"]), symNode("otro/y.ts", ["usaY"])],
        puertaEdges,
      ),
    );
    expect(findings).toEqual([]);
  });

  it("(5a) si uno de los lugares que repiten invoca a otro del mismo grupo, NO emite: ese otro ya es la puerta", () => {
    const findings = run(
      scenario(
        [
          ["cli/uno.ts", "haceUno"],
          ["cli/dos.ts", "haceDos"],
          ["cli/tres.ts", "haceTres"],
        ],
        [],
        [edge("cli/dos.ts", ["haceDos"], "cli/uno.ts", ["haceUno"])],
      ),
    );
    expect(findings).toEqual([]);
  });

  it("una puerta a MEDIAS (cubre 3 de 4) NO silencia: eso es `parcial`, no `ya-aplicado`", () => {
    const mediaNodes = PIECES.slice(0, 3).map((_, i) => symNode("media.ts", [`abrirParte${i}`]));
    const mediaEdges = [
      ...PIECES.slice(0, 3).map(([pf, pp], i) => edge("media.ts", [`abrirParte${i}`], pf, pp)),
      edge("otro/x.ts", ["usaX"], "media.ts", ["abrirParte0"]),
      edge("otro/y.ts", ["usaY"], "media.ts", ["abrirParte0"]),
    ];
    const findings = run(
      scenario(
        [
          ["cli/uno.ts", "haceUno"],
          ["cli/dos.ts", "haceDos"],
          ["cli/tres.ts", "haceTres"],
        ],
        [...mediaNodes, symNode("otro/x.ts", ["usaX"]), symNode("otro/y.ts", ["usaY"])],
        mediaEdges,
      ),
    );
    expect(findings).toHaveLength(1);
  });

  it("una puerta completa que NADIE usa (fan-in < 2) tampoco silencia", () => {
    const puertaNodes = PIECES.map((_, i) => symNode("puerta.ts", [`abrir${i}`]));
    const findings = run(
      scenario(
        [
          ["cli/uno.ts", "haceUno"],
          ["cli/dos.ts", "haceDos"],
          ["cli/tres.ts", "haceTres"],
        ],
        puertaNodes,
        PIECES.map(([pf, pp], i) => edge("puerta.ts", [`abrir${i}`], pf, pp)),
      ),
    );
    expect(findings).toHaveLength(1);
  });
});

describe("repeated-collaborator-set — una exclusión por condición", () => {
  it("(1) tres piezas en vez de cuatro ⇒ nada: eso es un Proxy/Adapter, no un subsistema", () => {
    const tres = PIECES.slice(0, 3);
    const built = [
      ["cli/uno.ts", "haceUno"],
      ["cli/dos.ts", "haceDos"],
      ["cli/tres.ts", "haceTres"],
    ].map(([file, name]) => clientCalling(file!, name!, tres));
    const repo = repoOf([...pieceNodes(), ...built.map((b) => b.node)], [...COHESION, ...built.flatMap((b) => b.edges)]);
    expect(run(repo)).toEqual([]);
  });

  it("(2) sólo DOS lugares repiten ⇒ nada: la mitigación barata es extraer una función compartida", () => {
    expect(
      run(
        scenario([
          ["cli/uno.ts", "haceUno"],
          ["cli/dos.ts", "haceDos"],
        ]),
      ),
    ).toEqual([]);
  });

  it("(2) el MISMO conjunto de archivos con símbolos DISTINTOS no es la misma coordinación", () => {
    // Cada cliente invoca un símbolo distinto de cada pieza: mismos archivos,
    // recetas distintas. Es el falso medido en `sqlalchemy` (los dialectos
    // comparten el vocabulario del DSL y escriben consultas distintas).
    const nodes: CodeGraphNode[] = [];
    const edges: CodeGraphEdge[] = [...COHESION];
    for (const [file, path] of PIECES) nodes.push(symNode(file, path));
    let i = 0;
    for (const cliente of ["cli/uno.ts", "cli/dos.ts", "cli/tres.ts"]) {
      i++;
      nodes.push(symNode(cliente, ["hace"]));
      for (const [pf] of PIECES) {
        const propio = [`op${i}`];
        nodes.push(symNode(pf, propio));
        edges.push(edge(cliente, ["hace"], pf, propio));
      }
    }
    expect(run(repoOf(nodes, edges))).toEqual([]);
  });

  it("(3) los tres lugares en el MISMO archivo ⇒ nada: ahí alcanza una función privada", () => {
    expect(
      run(
        scenario([
          ["cli/uno.ts", "haceUno"],
          ["cli/uno.ts", "haceDos"],
          ["cli/uno.ts", "haceTres"],
        ]),
      ),
    ).toEqual([]);
  });

  it("(4) piezas que no se conocen entre sí ⇒ nada: eso es Mediator/Extract Class, no Facade", () => {
    const built = [
      ["cli/uno.ts", "haceUno"],
      ["cli/dos.ts", "haceDos"],
      ["cli/tres.ts", "haceTres"],
    ].map(([file, name]) => clientCalling(file!, name!));
    // sin `COHESION`: las cuatro piezas son islas
    expect(run(repoOf([...pieceNodes(), ...built.map((b) => b.node)], built.flatMap((b) => b.edges)))).toEqual([]);
  });

  it("un llamador que no es `function-like` no cuenta como lugar que repite", () => {
    const built = [
      ["cli/uno.ts", "haceUno"],
      ["cli/dos.ts", "haceDos"],
    ].map(([file, name]) => clientCalling(file!, name!));
    const campo = clientCalling("cli/tres.ts", "unCampo");
    const nodes = [...pieceNodes(), ...built.map((b) => b.node), { ...campo.node, family: "other" as const }];
    expect(run(repoOf(nodes, [...COHESION, ...built.flatMap((b) => b.edges), ...campo.edges]))).toEqual([]);
  });
});

describe("repeated-collaborator-set — aristas ambiguas y contrato", () => {
  it("las aristas `calls` AMBIGUAS cuentan como invocación, y la evidencia declara cuántos pasos NO lo son", () => {
    const built = [
      ["cli/uno.ts", "haceUno"],
      ["cli/dos.ts", "haceDos"],
      ["cli/tres.ts", "haceTres"],
    ].map(([file, name]) => ({
      node: symNode(file!, [name!]),
      edges: PIECES.map(([pf, pp]) => edge(file!, [name!], pf, pp, "calls", "ambiguous")),
    }));
    const findings = run(repoOf([...pieceNodes(), ...built.map((b) => b.node)], [...COHESION, ...built.flatMap((b) => b.edges)]));
    expect(findings).toHaveLength(1);
    const confidentes = findings[0]!.evidence?.find((e) => e.label.includes("NO ambigua"));
    expect(confidentes?.value).toBe(0);
  });

  it("sin grafo devuelve vacío en vez de romper (el runner ya reporta `sin-grafo` antes)", () => {
    const repo: RepoUnit = { repoName: "x", files: [], functions: [], clones: [], graph: null };
    expect(run(repo)).toEqual([]);
  });

  it("está registrado, declara `calls` como arista mandatoria y su tier de impacto es `arquitectura`", async () => {
    expect(DETECTORS.some((d) => d.id === "repeated-collaborator-set")).toBe(true);
    expect(detector.needsEdges).toEqual(["calls"]);
    const { DETECTOR_IMPACT } = await import("../impact.js");
    expect(DETECTOR_IMPACT["repeated-collaborator-set"]).toBe("arquitectura");
  });
});
