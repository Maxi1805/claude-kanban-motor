import { describe, expect, it } from "vitest";

import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind, type Provenance } from "../../graph/types.js";
import { DETECTORS } from "../registry.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoUnit } from "../types.js";
import { detector, ROLE_HARDWIRES, ROLE_SLOT } from "./hardwired-subtype-combination.js";

/**
 * `inter-file`, `needsGraph: true`: este detector no lee ni una gramática —
 * corre enteramente sobre `CodeGraph`, así que (igual que documentan
 * `middle-man.test.ts` y `repeated-collaborator-set.test.ts` para su propio
 * caso) "≥3 lenguajes que emiten" no aplica: el grafo se construye A MANO.
 * La FORMA que busca —varios lugares que instancian cada uno una combinación
 * distinta de variantes de los mismos dos tipos base— existe en toda gramática
 * con unidad de tipo y herencia; lo que NO existe es en las gramáticas que no
 * producen nodos `class-like`, y por eso `needs: ["unidad-tipo-clase"]` con su
 * test de regla G3 más abajo.
 */

function node(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "function-like", startLine: 1, endLine: 5, ...overrides };
}
function klass(file: string, name: string): CodeGraphNode {
  return node(file, [name], { family: "class-like" });
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
  const files: FileSummary[] = [...new Set(nodes.map((n) => n.file))].map((path) => ({ path, lines: 40, language: "typescript" }));
  const graph: CodeGraph = { nodes: [...nodes], edges: [...edges], resolution: {} as never };
  return { repoName: "fixture", files, functions: [], clones: [], graph };
}
function run(repo: RepoUnit) {
  return detector.run(repo, testContext(detector, "typescript", []) as never);
}

/* ────────────────────────────────────────────────────────────────────────
 * La fixture base: DOS huecos de producto independientes (`Ctx` y `Ser`, tres
 * variantes cada uno) y TRES lugares que cablean cada uno su propia
 * combinación, con métodos de nombre DISTINTO (así no hay ninguna firma
 * compartida y la condición (6a) no encuentra ningún hueco resuelto).
 * ──────────────────────────────────────────────────────────────────────── */

const VARIANTS = ["K", "M", "N"] as const;

function productNodes(): CodeGraphNode[] {
  return [
    klass("base/ctx.ts", "Ctx"),
    klass("base/ser.ts", "Ser"),
    ...VARIANTS.map((v) => klass(`prod/${v}.ts`, `${v}Ctx`)),
    ...VARIANTS.map((v) => klass(`prod/${v}.ts`, `${v}Ser`)),
  ];
}
function productEdges(): CodeGraphEdge[] {
  return [
    ...VARIANTS.map((v) => edge(`prod/${v}.ts`, [`${v}Ctx`], "base/ctx.ts", ["Ctx"], "extends")),
    ...VARIANTS.map((v) => edge(`prod/${v}.ts`, [`${v}Ser`], "base/ser.ts", ["Ser"], "extends")),
  ];
}

interface SiteSpec {
  readonly variant: (typeof VARIANTS)[number];
  /** Nombre del miembro que crea el `Ctx`. Distinto por lugar ⇒ hueco NO resuelto. */
  readonly ctxMember: string;
  /** Nombre del miembro que crea el `Ser`. */
  readonly serMember: string;
  readonly file?: string;
  /** Qué variante de `Ctx` elige, si no es la propia (para el caso "hueco constante"). */
  readonly ctxPick?: (typeof VARIANTS)[number];
}

function site(spec: SiteSpec): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const v = spec.variant;
  const file = spec.file ?? `srv/${v}.ts`;
  const cls = `Srv${v}`;
  const ctxPick = spec.ctxPick ?? v;
  const nodes = [klass(file, cls), node(file, [cls, spec.ctxMember], { arity: 1 }), node(file, [cls, spec.serMember], { arity: 1 })];
  const edges = [
    edge(file, [cls], file, [cls, spec.ctxMember], "contains"),
    edge(file, [cls], file, [cls, spec.serMember], "contains"),
    edge(file, [cls, spec.ctxMember], `prod/${ctxPick}.ts`, [`${ctxPick}Ctx`], "instantiates"),
    edge(file, [cls, spec.serMember], `prod/${v}.ts`, [`${v}Ser`], "instantiates"),
  ];
  return { nodes, edges };
}

function scenario(specs: readonly SiteSpec[], extraNodes: readonly CodeGraphNode[] = [], extraEdges: readonly CodeGraphEdge[] = []): RepoUnit {
  const built = specs.map(site);
  return repoOf(
    [...productNodes(), ...built.flatMap((b) => b.nodes), ...extraNodes],
    [...productEdges(), ...built.flatMap((b) => b.edges), ...extraEdges],
  );
}

/** Los tres lugares con miembros de nombre distinto: NADA resuelto. */
const THREE_HARDWIRED: readonly SiteSpec[] = [
  { variant: "K", ctxMember: "leerK", serMember: "armarK" },
  { variant: "M", ctxMember: "leerM", serMember: "armarM" },
  { variant: "N", ctxMember: "leerN", serMember: "armarN" },
];

describe("hardwired-subtype-combination — la forma completa", () => {
  it("tres lugares en tres archivos, cada uno con su propia combinación de dos variantes ⇒ UN hallazgo", () => {
    const findings = run(scenario(THREE_HARDWIRED));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.title).toContain("3 lugares");
    // huecos que cubre · combinaciones distintas · lugares · archivos
    expect(f.trigger.map((t) => t.value)).toEqual([2, 3, 3, 3]);
  });

  it("marca cada ubicación con su rol: los lugares que cablean y los dos huecos de producto", () => {
    const f = run(scenario(THREE_HARDWIRED))[0]!;
    const cablean = f.locations.filter((l) => l.role.startsWith(ROLE_HARDWIRES)).map((l) => l.file);
    const huecos = f.locations.filter((l) => l.role.startsWith(ROLE_SLOT)).map((l) => l.file);
    expect(cablean.sort()).toEqual(["srv/K.ts", "srv/M.ts", "srv/N.ts"]);
    expect(huecos.sort()).toEqual(["base/ctx.ts", "base/ser.ts"]);
  });

  it("publica CUÁNTOS huecos ya tienen su creador compartido — cero en la forma completa", () => {
    const f = run(scenario(THREE_HARDWIRED))[0]!;
    const resueltos = f.evidence?.find((e) => e.label.startsWith("huecos que YA"));
    expect(resueltos?.value).toBe(0);
  });

  it("el consejo mecánico nombra los dos tipos base y cuántos lugares cablean", () => {
    const f = run(scenario(THREE_HARDWIRED))[0]!;
    expect(f.advice.primary.why).toContain("Ctx");
    expect(f.advice.primary.why).toContain("Ser");
    expect(f.advice.primary.why).toContain("3 lugares");
  });
});

describe("hardwired-subtype-combination — LA TRAMPA: la fábrica YA existe ⇒ silencio", () => {
  it("(6a) si TODOS los lugares crean los DOS productos desde la MISMA firma, NO emite", () => {
    // `crearCtx/1` y `crearSer/1` en los tres: los dos métodos de fábrica ya
    // están escritos, y cada concreta crea su propia variante. Es el patrón
    // aplicado, no una oportunidad.
    const findings = run(
      scenario([
        { variant: "K", ctxMember: "crearCtx", serMember: "crearSer" },
        { variant: "M", ctxMember: "crearCtx", serMember: "crearSer" },
        { variant: "N", ctxMember: "crearCtx", serMember: "crearSer" },
      ]),
    );
    expect(findings).toHaveLength(0);
  });

  it("(6a) MEDIA fábrica: si sólo UNO de los dos huecos tiene firma compartida, SÍ emite y lo publica", () => {
    // El caso real medido en `nest`: `initializeSerializer/1` está en los
    // cuatro servidores, pero la creación del contexto tiene un nombre
    // distinto en cada uno.
    const findings = run(
      scenario([
        { variant: "K", ctxMember: "leerK", serMember: "crearSer" },
        { variant: "M", ctxMember: "leerM", serMember: "crearSer" },
        { variant: "N", ctxMember: "leerN", serMember: "crearSer" },
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence?.find((e) => e.label.startsWith("huecos que YA"))?.value).toBe(1);
  });

  it("(6a) una firma compartida con ARIDAD distinta no resuelve el hueco: la firma es (nombre, aridad)", () => {
    const built = [
      { variant: "K" as const, ctxMember: "leerK", serMember: "crearSer" },
      { variant: "M" as const, ctxMember: "leerM", serMember: "crearSer" },
      { variant: "N" as const, ctxMember: "leerN", serMember: "crearSer" },
    ].map(site);
    // Se le cambia la aridad al `crearSer` de uno solo: la firma deja de ser
    // común a los tres y el hueco vuelve a estar sin resolver.
    const nodes = built
      .flatMap((b) => b.nodes)
      .map((n) => (n.file === "srv/N.ts" && n.symbolPath.at(-1) === "crearSer" ? { ...n, arity: 3 } : n));
    const repo = repoOf([...productNodes(), ...nodes], [...productEdges(), ...built.flatMap((b) => b.edges)]);
    expect(run(repo)[0]!.evidence?.find((e) => e.label.startsWith("huecos que YA"))?.value).toBe(0);
  });

  it("(6b) puerta de ADENTRO: si uno de los lugares ya es usado por los otros dos, NO emite", () => {
    const extra = [
      edge("srv/M.ts", ["SrvM", "leerM"], "srv/K.ts", ["SrvK"], "references"),
      edge("srv/N.ts", ["SrvN", "leerN"], "srv/K.ts", ["SrvK"], "references"),
    ];
    expect(run(scenario(THREE_HARDWIRED, [], extra))).toHaveLength(0);
  });

  it("(6c) puerta de AFUERA: si otro lugar ya cubre los DOS huecos y lo usan >= 2, NO emite", () => {
    const puerta = [
      klass("fab.ts", "Fabrica"),
      node("fab.ts", ["Fabrica", "crear"], { arity: 0 }),
    ];
    const puertaEdges = [
      edge("fab.ts", ["Fabrica"], "fab.ts", ["Fabrica", "crear"], "contains"),
      edge("fab.ts", ["Fabrica", "crear"], "prod/K.ts", ["KCtx"], "instantiates"),
      edge("fab.ts", ["Fabrica", "crear"], "prod/K.ts", ["KSer"], "instantiates"),
      edge("srv/M.ts", ["SrvM", "leerM"], "fab.ts", ["Fabrica"], "references"),
      edge("srv/N.ts", ["SrvN", "leerN"], "fab.ts", ["Fabrica"], "references"),
    ];
    expect(run(scenario(THREE_HARDWIRED, puerta, puertaEdges))).toHaveLength(0);
  });
});

describe("hardwired-subtype-combination — una exclusión por condición", () => {
  it("(1) un tipo base con UNA sola variante no es un hueco de producto ⇒ silencio", () => {
    // Se le quita la herencia a dos de las tres variantes de `Ser`: queda una
    // sola, o sea nada que elegir en ese hueco.
    const edges = productEdges().filter((e) => !(e.to === symbolNodeId("base/ser.ts", ["Ser"]) && !e.from.includes("/K.ts")));
    const built = THREE_HARDWIRED.map(site);
    expect(run(repoOf([...productNodes(), ...built.flatMap((b) => b.nodes)], [...edges, ...built.flatMap((b) => b.edges)]))).toHaveLength(0);
  });

  it("(2) huecos ANIDADOS (uno ancestro del otro) no son dos huecos ⇒ silencio", () => {
    const anidado = [edge("base/ser.ts", ["Ser"], "base/ctx.ts", ["Ctx"], "extends")];
    expect(run(scenario(THREE_HARDWIRED, [], anidado))).toHaveLength(0);
  });

  it("(3) si el MISMO tipo llena los dos huecos (hereda de las dos bases), el lugar crea UN objeto ⇒ silencio", () => {
    // Cada `*Ser` pasa a heredar TAMBIÉN de `Ctx`, y cada lugar instancia sólo
    // ese tipo: los dos huecos quedan llenos por el mismo producto.
    const nodes = [...productNodes(), ...VARIANTS.map((v) => klass(`srv/${v}.ts`, `Srv${v}`)), ...VARIANTS.map((v) => node(`srv/${v}.ts`, [`Srv${v}`, "hacer"], { arity: 1 }))];
    const edges = [
      ...productEdges(),
      ...VARIANTS.map((v) => edge(`prod/${v}.ts`, [`${v}Ser`], "base/ctx.ts", ["Ctx"], "extends")),
      ...VARIANTS.map((v) => edge(`srv/${v}.ts`, [`Srv${v}`], `srv/${v}.ts`, [`Srv${v}`, "hacer"], "contains")),
      ...VARIANTS.map((v) => edge(`srv/${v}.ts`, [`Srv${v}`, "hacer"], `prod/${v}.ts`, [`${v}Ser`], "instantiates")),
    ];
    expect(run(repoOf(nodes, edges))).toHaveLength(0);
  });

  it("(4) un lugar que instancia DOS variantes del mismo hueco no cablea: despacha ⇒ no cuenta como lugar", () => {
    const extra = [edge("srv/K.ts", ["SrvK", "leerK"], "prod/M.ts", ["MCtx"], "instantiates")];
    // Quedan sólo DOS lugares cableados: por debajo del piso de escala.
    expect(run(scenario(THREE_HARDWIRED, [], extra))).toHaveLength(0);
  });

  it("(5) un hueco CONSTANTE (la misma variante en todos los lugares) no es una familia ⇒ silencio", () => {
    expect(
      run(
        scenario([
          { variant: "K", ctxMember: "leerK", serMember: "armarK", ctxPick: "K" },
          { variant: "M", ctxMember: "leerM", serMember: "armarM", ctxPick: "K" },
          { variant: "N", ctxMember: "leerN", serMember: "armarN", ctxPick: "K" },
        ]),
      ),
    ).toHaveLength(0);
  });

  it("ESCALA: con DOS lugares la mitigación barata es una función con un condicional ⇒ silencio", () => {
    expect(run(scenario(THREE_HARDWIRED.slice(0, 2)))).toHaveLength(0);
  });

  it("ESCALA: tres lugares en UN SOLO archivo se unifican con una función privada ⇒ silencio", () => {
    expect(
      run(
        scenario([
          { variant: "K", ctxMember: "leerK", serMember: "armarK", file: "srv/todos.ts" },
          { variant: "M", ctxMember: "leerM", serMember: "armarM", file: "srv/todos.ts" },
          { variant: "N", ctxMember: "leerN", serMember: "armarN", file: "srv/todos.ts" },
        ]),
      ),
    ).toHaveLength(0);
  });

  it("PROCEDENCIA: una herencia `inferred` no abre un hueco — nunca se afirma una variante con una arista adivinada", () => {
    const built = THREE_HARDWIRED.map(site);
    const edges = [
      ...VARIANTS.map((v) => edge(`prod/${v}.ts`, [`${v}Ctx`], "base/ctx.ts", ["Ctx"], "extends", "inferred")),
      ...VARIANTS.map((v) => edge(`prod/${v}.ts`, [`${v}Ser`], "base/ser.ts", ["Ser"], "extends")),
      ...built.flatMap((b) => b.edges),
    ];
    expect(run(repoOf([...productNodes(), ...built.flatMap((b) => b.nodes)], edges))).toHaveLength(0);
  });

  it("PROCEDENCIA: una instanciación `ambiguous` no cuenta como punto de creación cableado", () => {
    const built = THREE_HARDWIRED.map(site);
    const edges = [
      ...productEdges(),
      ...built.flatMap((b) => b.edges).map((e) => (e.kind === "instantiates" && e.from.includes("srv/N.ts") ? { ...e, provenance: "ambiguous" as Provenance } : e)),
    ];
    // Sin el tercer lugar quedan dos: por debajo del piso.
    expect(run(repoOf([...productNodes(), ...built.flatMap((b) => b.nodes)], edges))).toHaveLength(0);
  });
});

describe("hardwired-subtype-combination — capacidades y contrato", () => {
  it("no aplicable sin unidad-tipo-clase: un grafo sin ningún nodo class-like (forzado a correr igual) no reporta nada", () => {
    // Simula un lenguaje sin la capacidad "unidad-tipo-clase" (medido en Go:
    // `classNodes` sale vacío, así que 0 de las 1.249 aristas `instantiates`
    // de hugo caen dentro de un hueco). Sin nodos `class-like` no puede
    // existir ninguna arista de subtipo con destino candidato NI ningún
    // producto instanciable: la ausencia de la capacidad hace estructuralmente
    // imposible el hallazgo, no es un accidente de esta fixture. Se llama
    // `detector.run` DIRECTAMENTE, salteando la compuerta de `needs`.
    const built = THREE_HARDWIRED.map(site);
    const flat = [...productNodes(), ...built.flatMap((b) => b.nodes)].map((n) => ({ ...n, family: "function-like" as const }));
    expect(run(repoOf(flat, [...productEdges(), ...built.flatMap((b) => b.edges)]))).toHaveLength(0);
  });

  it("defensivo: `repo.graph === null` no explota y devuelve 0 hallazgos", () => {
    const repo: RepoUnit = { repoName: "fixture", files: [], functions: [], clones: [], graph: null };
    expect(run(repo)).toHaveLength(0);
  });

  it("está registrado, es inter-file, exige grafo y declara sus aristas mandatorias", () => {
    const registered = DETECTORS.find((d) => d.id === "hardwired-subtype-combination");
    expect(registered).toBeDefined();
    expect(detector.scope).toBe("inter-file");
    expect(detector.needsGraph).toBe(true);
    expect(detector.needs).toEqual(["unidad-tipo-clase"]);
    expect([...(detector.needsEdges ?? [])].sort()).toEqual(["extends", "instantiates"]);
  });
});
