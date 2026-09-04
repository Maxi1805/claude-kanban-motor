import { describe, expect, it } from "vitest";

import { symbolNodeId, carrierNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind, type Provenance } from "../../graph/types.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoUnit } from "../types.js";
import { detector } from "./homonymous-divergent-signature.js";

/**
 * `inter-file`, `needsGraph: true`: este detector no lee ni una gramatica —
 * corre enteramente sobre `CodeGraph`, asi que (igual que
 * `homonymous-divergent-construction.test.ts`, `middle-man.test.ts` y
 * `unused-symbol.test.ts` documentan para su propio caso) "≥3 lenguajes que
 * emiten" no aplica: el grafo se construye A MANO, sin tree-sitter. La FORMA
 * que busca —hermanos de una familia que declaran el mismo miembro con
 * firmas que no coinciden— existe en las gramaticas soportadas sin cambiar
 * de aspecto. Por eso `needs: []` y por eso no hay un test "no aplicable sin
 * <capability>" (regla G3: solo aplica a detectores con `needs` no vacio).
 *
 * LO QUE ESTOS TESTS FIJAN, uno por compuerta declarada en el docstring del
 * modulo: G1 (familia), G2 (homonimo), G3 (aridad conocida y divergente),
 * G4 (el ancestro tiene miembros y NO declara ya el homonimo) y G5 (alguien
 * lo invoca desde fuera de su propia unidad-tipo). Cada uno de los cinco
 * tiene su caso NEGATIVO: si una compuerta se afloja en silencio, el test
 * que la fija se pone rojo.
 */

function node(file: string, symbolPath: readonly string[], family: CodeGraphNode["family"], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family, startLine: 10, endLine: 40, ...overrides };
}

function edge(
  fromFile: string,
  fromPath: readonly string[],
  toFile: string,
  toPath: readonly string[],
  kind: EdgeKind,
  provenance: Provenance = "resolved",
): CodeGraphEdge {
  return { from: symbolNodeId(fromFile, fromPath), to: symbolNodeId(toFile, toPath), kind, provenance, weight: 1 };
}

function repoOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): RepoUnit {
  const files: FileSummary[] = [...new Set(nodes.map((n) => n.file))].map((path) => ({ path, lines: 80, language: "typescript" }));
  const graph: CodeGraph = { nodes: [...nodes], edges: [...edges], resolution: {} as never };
  return { repoName: "fixture", files, functions: [], clones: [], graph };
}

function run(repo: RepoUnit) {
  return detector.run(repo, testContext(detector, "typescript", []) as never);
}

/* ── EL ESCENARIO CANONICO ────────────────────────────────────────────────
 * `base.ts#Writer` (con un miembro propio, `close`, para NO ser una interfaz
 * marcadora) y dos subtipos en archivos distintos. Los dos declaran `write`,
 * uno con 1 parametro y el otro con 2, y `cliente.ts#usa` invoca el de uno
 * de ellos desde fuera. Es la forma completa.
 * ─────────────────────────────────────────────────────────────────────── */

interface Hermano {
  readonly file: string;
  readonly unidad: string;
  readonly miembro: string;
  readonly arity: number | null | undefined;
}

const ANCESTRO = "Writer";

function escenario(
  hermanos: readonly Hermano[],
  opts: {
    /** Miembros propios del ancestro. Vacio ⇒ interfaz MARCADORA (G4). */
    readonly miembrosDelAncestro?: readonly string[];
    /** Llamadas EXTERNAS a `miembro` de cada hermano listado por indice (G5). */
    readonly invocanDesdeAfuera?: readonly number[];
    /** Llamadas INTERNAS (desde la propia unidad-tipo) — no cuentan para G5. */
    readonly invocanDesdeAdentro?: readonly number[];
    /** `provenance` de las aristas de familia. */
    readonly provenanceFamilia?: Provenance;
    /** kind de la arista de familia. */
    readonly aristaFamilia?: EdgeKind;
  } = {},
): RepoUnit {
  const miembrosDelAncestro = opts.miembrosDelAncestro ?? ["close"];
  const nodes: CodeGraphNode[] = [node("base.ts", [ANCESTRO], "class-like")];
  const edges: CodeGraphEdge[] = [];
  for (const m of miembrosDelAncestro) {
    nodes.push(node("base.ts", [ANCESTRO, m], "function-like", { arity: 0 }));
    edges.push(edge("base.ts", [ANCESTRO], "base.ts", [ANCESTRO, m], "contains", "declared"));
  }
  hermanos.forEach((h) => {
    nodes.push(node(h.file, [h.unidad], "class-like"));
    nodes.push(node(h.file, [h.unidad, h.miembro], "function-like", { arity: h.arity, startLine: 12, endLine: 20 }));
    edges.push(edge(h.file, [h.unidad], "base.ts", [ANCESTRO], opts.aristaFamilia ?? "extends", opts.provenanceFamilia ?? "declared"));
    edges.push(edge(h.file, [h.unidad], h.file, [h.unidad, h.miembro], "contains", "declared"));
  });
  // El llamador externo vive en su propio archivo y su propia unidad-tipo.
  nodes.push(node("cliente.ts", ["Cliente"], "class-like"));
  nodes.push(node("cliente.ts", ["Cliente", "usa"], "function-like", { arity: 1 }));
  edges.push(edge("cliente.ts", ["Cliente"], "cliente.ts", ["Cliente", "usa"], "contains", "declared"));
  for (const i of opts.invocanDesdeAfuera ?? [0]) {
    const h = hermanos[i];
    if (h) edges.push(edge("cliente.ts", ["Cliente", "usa"], h.file, [h.unidad, h.miembro], "calls"));
  }
  for (const i of opts.invocanDesdeAdentro ?? []) {
    const h = hermanos[i];
    if (!h) continue;
    // El llamador interno es un HERMANO DE LA MISMA unidad-tipo: existe como
    // nodo, para que el grafo del fixture sea bien formado (una arista `calls`
    // cuyo origen no esta en el indice no es una forma que el grafo produzca).
    nodes.push(node(h.file, [h.unidad, "otro"], "function-like", { arity: 0 }));
    edges.push(edge(h.file, [h.unidad], h.file, [h.unidad, "otro"], "contains", "declared"));
    edges.push(edge(h.file, [h.unidad, "otro"], h.file, [h.unidad, h.miembro], "calls"));
  }
  return repoOf(nodes, edges);
}

const CANONICO: readonly Hermano[] = [
  { file: "file.ts", unidad: "FileWriter", miembro: "write", arity: 1 },
  { file: "net.ts", unidad: "NetWriter", miembro: "write", arity: 2 },
];

describe("homonymous-divergent-signature — contrato del detector", () => {
  it("declara el `kind` y el alcance que el registro deriva", () => {
    expect(detector.id).toBe("homonymous-divergent-signature");
    expect(detector.kind).toBe("homonymous-divergent-signature");
    expect(detector.scope).toBe("inter-file");
    expect(detector.needsGraph).toBe(true);
  });

  it("declara `calls` en CONJUNCION y las cuatro aristas de familia en ALTERNATIVA", () => {
    expect(detector.needsEdges).toEqual(["calls"]);
    expect(detector.needsAnyEdge).toEqual(["extends", "implements", "mixes-in", "satisfies"]);
  });

  it("sin grafo devuelve vacio en vez de romper (el runner ya lo filtra antes)", () => {
    const repo: RepoUnit = { repoName: "x", files: [], functions: [], clones: [], graph: null };
    expect(run(repo)).toEqual([]);
  });
});

describe("homonymous-divergent-signature — el escenario canonico", () => {
  it("emite UN hallazgo con las dos declaraciones y el ancestro como ubicaciones", () => {
    const out = run(escenario(CANONICO));
    expect(out).toHaveLength(1);
    const f = out[0]!;
    expect(f.variant).toBe("write");
    expect(f.locations.map((l) => l.symbol)).toEqual(["FileWriter.write", "NetWriter.write", "Writer"]);
    expect(f.title).toContain("1 vs 2");
  });

  it("el trigger lleva las TRES compuertas medibles con su umbral", () => {
    const f = run(escenario(CANONICO))[0]!;
    const labels = f.trigger.map((t) => t.label);
    expect(labels).toEqual([
      "hermanos que declaran el mismo miembro",
      "aridades declaradas distintas entre ellos",
      "llamadas desde fuera de la unidad-tipo que lo declara",
    ]);
    expect(f.trigger.map((t) => t.value)).toEqual([2, 2, 1]);
  });

  it("el consejo es la refactorizacion mecanica, no el patron", () => {
    const f = run(escenario(CANONICO))[0]!;
    expect(f.advice.primary.kind).toBe("refactorizacion");
    expect(f.advice.primary.name).toBe("Rename Method / Add Parameter");
  });
});

describe("homonymous-divergent-signature — G1: hace falta una familia", () => {
  it("NO emite si el unico parentesco es `inferred` (evidencia no positiva)", () => {
    expect(run(escenario(CANONICO, { provenanceFamilia: "inferred" }))).toEqual([]);
  });

  it("NO emite si el unico parentesco es `ambiguous`", () => {
    expect(run(escenario(CANONICO, { provenanceFamilia: "ambiguous" }))).toEqual([]);
  });

  it("emite igual cuando la familia se testimonia por `implements` en vez de `extends`", () => {
    expect(run(escenario(CANONICO, { aristaFamilia: "implements" }))).toHaveLength(1);
  });

  it("emite igual cuando la familia se testimonia por `mixes-in` (ruby) o `satisfies` (typescript)", () => {
    expect(run(escenario(CANONICO, { aristaFamilia: "mixes-in" }))).toHaveLength(1);
    expect(run(escenario(CANONICO, { aristaFamilia: "satisfies" }))).toHaveLength(1);
  });

  it("NO emite con UN solo hermano: no hay dos interfaces que unificar", () => {
    expect(run(escenario([CANONICO[0]!]))).toEqual([]);
  });
});

describe("homonymous-divergent-signature — G2: el miembro tiene que ser HOMONIMO", () => {
  it("NO emite si cada hermano declara un miembro con NOMBRE distinto", () => {
    const out = run(
      escenario([
        { file: "file.ts", unidad: "FileWriter", miembro: "write", arity: 1 },
        { file: "net.ts", unidad: "NetWriter", miembro: "send", arity: 2 },
      ]),
    );
    expect(out).toEqual([]);
  });

  it("NO emite cuando el homonimo es un CONSTRUCTOR", () => {
    const out = run(
      escenario([
        { file: "file.ts", unidad: "FileWriter", miembro: "constructor", arity: 1 },
        { file: "net.ts", unidad: "NetWriter", miembro: "constructor", arity: 2 },
      ]),
    );
    expect(out).toEqual([]);
  });

  it("NO emite cuando el 'miembro' se llama igual que su propia unidad-tipo (constructor de C#/java)", () => {
    const out = run(
      escenario([
        { file: "file.ts", unidad: "FileWriter", miembro: "FileWriter", arity: 1 },
        { file: "net.ts", unidad: "NetWriter", miembro: "NetWriter", arity: 2 },
      ]),
    );
    expect(out).toEqual([]);
  });
});

describe("homonymous-divergent-signature — G3: la aridad tiene que ser CONOCIDA y DIVERGIR", () => {
  it("NO emite cuando los dos hermanos declaran la MISMA aridad (eso es `homonymous-divergent-sequence`)", () => {
    const out = run(
      escenario([
        { file: "file.ts", unidad: "FileWriter", miembro: "write", arity: 2 },
        { file: "net.ts", unidad: "NetWriter", miembro: "write", arity: 2 },
      ]),
    );
    expect(out).toEqual([]);
  });

  it("`arity === null` es 'la gramatica no expuso lista de parametros', NO 'cero': esa declaracion no participa", () => {
    const out = run(
      escenario([
        { file: "file.ts", unidad: "FileWriter", miembro: "write", arity: null },
        { file: "net.ts", unidad: "NetWriter", miembro: "write", arity: 2 },
      ]),
    );
    expect(out).toEqual([]);
  });

  it("`arity === undefined` (F2 no corrio sobre ese simbolo) tampoco participa", () => {
    const out = run(
      escenario([
        { file: "file.ts", unidad: "FileWriter", miembro: "write", arity: undefined },
        { file: "net.ts", unidad: "NetWriter", miembro: "write", arity: 2 },
      ]),
    );
    expect(out).toEqual([]);
  });

  it("con TRES aridades distintas emite y las nombra todas, en orden", () => {
    const out = run(
      escenario(
        [
          { file: "a.ts", unidad: "A", miembro: "write", arity: 4 },
          { file: "b.ts", unidad: "B", miembro: "write", arity: 1 },
          { file: "c.ts", unidad: "C", miembro: "write", arity: 2 },
        ],
        { invocanDesdeAfuera: [1] },
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toContain("1 vs 2 vs 4");
  });
});

describe("homonymous-divergent-signature — G4: el contrato NO puede existir ya", () => {
  it("NO emite si el ancestro YA declara el homonimo: el contrato unificado existe", () => {
    expect(run(escenario(CANONICO, { miembrosDelAncestro: ["close", "write"] }))).toEqual([]);
  });

  it("NO emite si el ancestro no declara NINGUN miembro: es una interfaz MARCADORA", () => {
    expect(run(escenario(CANONICO, { miembrosDelAncestro: [] }))).toEqual([]);
  });

  it("la evidencia dice cuantos miembros SI declara el ancestro, como condicion de resolucion verificada", () => {
    const f = run(escenario(CANONICO, { miembrosDelAncestro: ["close", "flush"] }))[0]!;
    const ev = f.evidence?.find((e) => e.label === "miembros que el ancestro sí declara");
    expect(ev?.value).toBe(2);
  });
});

describe("homonymous-divergent-signature — G5: alguien tiene que invocarlo DESDE AFUERA", () => {
  it("NO emite sin ninguna llamada entrante: es un helper interno repetido", () => {
    expect(run(escenario(CANONICO, { invocanDesdeAfuera: [] }))).toEqual([]);
  });

  it("NO emite si la unica llamada viene de la PROPIA unidad-tipo (`this.write(...)`)", () => {
    expect(run(escenario(CANONICO, { invocanDesdeAfuera: [], invocanDesdeAdentro: [0, 1] }))).toEqual([]);
  });

  it("emite en cuanto UNA sola declaracion tiene un llamador externo, y lo cuenta", () => {
    const f = run(escenario(CANONICO, { invocanDesdeAfuera: [1], invocanDesdeAdentro: [0] }))[0]!;
    const ev = f.evidence?.find((e) => e.label === "declaraciones con al menos un llamador externo");
    expect(ev?.value).toBe(1);
    expect(f.trigger[2]!.value).toBe(1);
  });
});

describe("homonymous-divergent-signature — la familia puede vivir en UN archivo o en VARIOS", () => {
  it("una familia repartida se marca como tal en la evidencia", () => {
    const f = run(escenario(CANONICO))[0]!;
    const ev = f.evidence?.find((e) => e.label === "archivos distintos que participan");
    expect(ev?.value).toBe(2);
    expect(ev?.note).toContain("ningún detector intra-file la puede ver entera");
  });

  it("una familia de un solo archivo tambien emite (y `homonymous-divergent-sequence` NO la ve: exige aridades iguales)", () => {
    const out = run(
      escenario([
        { file: "uno.ts", unidad: "FileWriter", miembro: "write", arity: 1 },
        { file: "uno.ts", unidad: "NetWriter", miembro: "write", arity: 2 },
      ]),
    );
    expect(out).toHaveLength(1);
    const ev = out[0]!.evidence?.find((e) => e.label === "archivos distintos que participan");
    expect(ev?.value).toBe(1);
  });
});

describe("homonymous-divergent-signature — un nodo `carrier` nunca se confunde con un miembro", () => {
  it("ignora los `carrier` que cuelgan de la misma unidad-tipo", () => {
    const repo = escenario(CANONICO);
    const g = repo.graph!;
    const carrier: CodeGraphNode = {
      id: carrierNodeId("file.ts", ["FileWriter", "write"], 0),
      kind: "carrier",
      file: "file.ts",
      symbolPath: ["FileWriter", "write"],
      startLine: 12,
      endLine: 12,
      carrierForm: "parameter",
    };
    const con: RepoUnit = {
      ...repo,
      graph: { ...g, nodes: [...g.nodes, carrier], edges: [...g.edges, { from: symbolNodeId("file.ts", ["FileWriter"]), to: carrier.id, kind: "contains", provenance: "declared", weight: 1 }] },
    };
    expect(run(con)).toHaveLength(1);
  });
});

describe("homonymous-divergent-signature — la MISMA divergencia no se reporta una vez por ancestro", () => {
  /**
   * El defecto medido sobre jenkins ANTES de juzgar nada: con herencia
   * multiple los mismos dos hermanos comparten VARIOS ancestros, y el mismo
   * par de declaraciones salia una vez por cada uno (`doDoDelete`, cuatro
   * veces). Se arregla como DEDUPLICACION: no cambia QUE divergencias se
   * reportan, solo cuantas veces se reporta cada una.
   */
  function dosAncestros(conTercerHermano: boolean): RepoUnit {
    const nodes: CodeGraphNode[] = [
      node("a.ts", ["Uno"], "class-like"),
      node("a.ts", ["Uno", "close"], "function-like", { arity: 0 }),
      node("b.ts", ["Dos"], "class-like"),
      node("b.ts", ["Dos", "close"], "function-like", { arity: 0 }),
      node("file.ts", ["FileWriter"], "class-like"),
      node("file.ts", ["FileWriter", "write"], "function-like", { arity: 1, startLine: 12, endLine: 20 }),
      node("net.ts", ["NetWriter"], "class-like"),
      node("net.ts", ["NetWriter", "write"], "function-like", { arity: 2, startLine: 12, endLine: 20 }),
      node("cliente.ts", ["Cliente"], "class-like"),
      node("cliente.ts", ["Cliente", "usa"], "function-like", { arity: 1 }),
    ];
    const edges: CodeGraphEdge[] = [
      edge("a.ts", ["Uno"], "a.ts", ["Uno", "close"], "contains", "declared"),
      edge("b.ts", ["Dos"], "b.ts", ["Dos", "close"], "contains", "declared"),
      edge("file.ts", ["FileWriter"], "file.ts", ["FileWriter", "write"], "contains", "declared"),
      edge("net.ts", ["NetWriter"], "net.ts", ["NetWriter", "write"], "contains", "declared"),
      edge("cliente.ts", ["Cliente"], "cliente.ts", ["Cliente", "usa"], "contains", "declared"),
      // Los DOS hermanos implementan los DOS ancestros: la misma divergencia
      // aparece bajo `Uno` y bajo `Dos`.
      edge("file.ts", ["FileWriter"], "a.ts", ["Uno"], "implements", "declared"),
      edge("file.ts", ["FileWriter"], "b.ts", ["Dos"], "implements", "declared"),
      edge("net.ts", ["NetWriter"], "a.ts", ["Uno"], "implements", "declared"),
      edge("net.ts", ["NetWriter"], "b.ts", ["Dos"], "implements", "declared"),
      edge("cliente.ts", ["Cliente", "usa"], "file.ts", ["FileWriter", "write"], "calls"),
    ];
    if (conTercerHermano) {
      // Un TERCER hermano que solo cuelga de `Uno`: el grupo de `Uno` es
      // ENTONCES un superconjunto ESTRICTO del de `Dos`.
      nodes.push(node("mem.ts", ["MemWriter"], "class-like"));
      nodes.push(node("mem.ts", ["MemWriter", "write"], "function-like", { arity: 3, startLine: 12, endLine: 20 }));
      edges.push(edge("mem.ts", ["MemWriter"], "mem.ts", ["MemWriter", "write"], "contains", "declared"));
      edges.push(edge("mem.ts", ["MemWriter"], "a.ts", ["Uno"], "implements", "declared"));
    }
    return repoOf(nodes, edges);
  }

  it("dos ancestros con EL MISMO conjunto de declaraciones publican UN solo hallazgo", () => {
    const out = run(dosAncestros(false));
    expect(out).toHaveLength(1);
  });

  it("conserva el grupo MAS ANCHO, no el primero que aparece", () => {
    const out = run(dosAncestros(true));
    expect(out).toHaveLength(1);
    expect(out[0]!.locations.map((l) => l.symbol)).toEqual(["FileWriter.write", "MemWriter.write", "NetWriter.write", "Uno"]);
    expect(out[0]!.title).toContain("1 vs 2 vs 3");
  });

  it("dos conjuntos que se CRUZAN sin contenerse sobreviven los dos: son divergencias distintas", () => {
    const nodes: CodeGraphNode[] = [
      node("a.ts", ["Uno"], "class-like"),
      node("a.ts", ["Uno", "close"], "function-like", { arity: 0 }),
      node("b.ts", ["Dos"], "class-like"),
      node("b.ts", ["Dos", "close"], "function-like", { arity: 0 }),
      node("cliente.ts", ["Cliente"], "class-like"),
      node("cliente.ts", ["Cliente", "usa"], "function-like", { arity: 1 }),
    ];
    const edges: CodeGraphEdge[] = [
      edge("a.ts", ["Uno"], "a.ts", ["Uno", "close"], "contains", "declared"),
      edge("b.ts", ["Dos"], "b.ts", ["Dos", "close"], "contains", "declared"),
      edge("cliente.ts", ["Cliente"], "cliente.ts", ["Cliente", "usa"], "contains", "declared"),
    ];
    // X e Y cuelgan de `Uno`; Y y Z cuelgan de `Dos`. Ningun conjunto contiene
    // al otro: {X,Y} vs {Y,Z}.
    const arm = (u: string, f: string, ar: number, ancestros: readonly [string, string][]) => {
      nodes.push(node(f, [u], "class-like"));
      nodes.push(node(f, [u, "write"], "function-like", { arity: ar, startLine: 12, endLine: 20 }));
      edges.push(edge(f, [u], f, [u, "write"], "contains", "declared"));
      for (const [af, an] of ancestros) edges.push(edge(f, [u], af, [an], "implements", "declared"));
      edges.push(edge("cliente.ts", ["Cliente", "usa"], f, [u, "write"], "calls"));
    };
    arm("X", "x.ts", 1, [["a.ts", "Uno"]]);
    arm("Y", "y.ts", 2, [["a.ts", "Uno"], ["b.ts", "Dos"]]);
    arm("Z", "z.ts", 3, [["b.ts", "Dos"]]);
    const out = run(repoOf(nodes, edges));
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.locations[f.locations.length - 1]!.symbol).sort()).toEqual(["Dos", "Uno"]);
  });

  it("dos MIEMBROS distintos nunca se deduplican entre si", () => {
    const repo = escenario([
      { file: "file.ts", unidad: "FileWriter", miembro: "write", arity: 1 },
      { file: "net.ts", unidad: "NetWriter", miembro: "write", arity: 2 },
    ]);
    const g = repo.graph!;
    const extraNodes = [
      node("file.ts", ["FileWriter", "flush"], "function-like", { arity: 0, startLine: 30, endLine: 34 }),
      node("net.ts", ["NetWriter", "flush"], "function-like", { arity: 1, startLine: 30, endLine: 34 }),
    ];
    const extraEdges: CodeGraphEdge[] = [
      edge("file.ts", ["FileWriter"], "file.ts", ["FileWriter", "flush"], "contains", "declared"),
      edge("net.ts", ["NetWriter"], "net.ts", ["NetWriter", "flush"], "contains", "declared"),
      edge("cliente.ts", ["Cliente", "usa"], "file.ts", ["FileWriter", "flush"], "calls"),
    ];
    const out = run({ ...repo, graph: { ...g, nodes: [...g.nodes, ...extraNodes], edges: [...g.edges, ...extraEdges] } });
    expect(out.map((f) => f.variant).sort()).toEqual(["flush", "write"]);
  });
});
