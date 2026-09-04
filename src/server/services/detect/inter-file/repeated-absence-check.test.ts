import { describe, expect, it } from "vitest";

import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind, type Provenance } from "../../graph/types.js";
import { DETECTORS } from "../registry.js";
import { testContext } from "../testing.js";
import type { CloneCandidate, FileSummary, RepoUnit } from "../types.js";
import { ausenciasRepetidas, detector, ROLE_CLIENTE, ROLE_MEDIA_PUERTA } from "./repeated-absence-check.js";

/**
 * `inter-file`, `needsGraph: true`: este detector NO lee ninguna gramática — el
 * texto que mira es `CloneCandidate.normalized`, que `code-analyzer.ts` produce
 * ya colapsado, y todo lo demás sale del `CodeGraph`. Igual que
 * `repeated-collaborator-set.test.ts`/`middle-man.test.ts` documentan para su
 * caso, "≥3 lenguajes que emiten" no aplica: el insumo se construye A MANO.
 * Las tres formas de chequeo que reconoce cubren, a propósito, las nueve
 * gramáticas del corpus (`== null`/`=== null`/`!= null` de JS/TS/Java/C#/Go con
 * `nil`, `is None`/`is not None` de Python, `.nil?` de Ruby) y hay un test por
 * cada una más abajo. `needs: []` ⇒ regla G3: no hay test de "no aplicable".
 */

function symNode(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id: symbolNodeId(file, symbolPath),
    kind: "symbol",
    file,
    symbolPath,
    family: "function-like",
    memberOfClassLike: true,
    startLine: 1,
    endLine: 2,
    ...overrides,
  };
}

function edge(fromId: string, toId: string, kind: EdgeKind, provenance: Provenance = "resolved"): CodeGraphEdge {
  return { from: fromId, to: toId, kind, provenance, weight: 1 };
}

function clon(file: string, fn: string, texto: string, className: string | null = null, startLine = 10, endLine = 20): CloneCandidate {
  return {
    fingerprint: `${file}:${fn}`,
    file,
    startLine,
    endLine,
    nodes: 40,
    type: "method_declaration",
    functionName: fn,
    className,
    superclassName: null,
    normalized: texto.replace(/\s+/g, " ").trim(),
  };
}

function repoOf(clones: readonly CloneCandidate[], nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[] = []): RepoUnit {
  const files: FileSummary[] = [...new Set([...clones.map((c) => c.file), ...nodes.map((n) => n.file)])].map((path) => ({ path, lines: 60, language: "typescript" }));
  const graph: CodeGraph = { nodes: [...nodes], edges: [...edges], resolution: {} as never };
  return { repoName: "fixture", files, functions: [], clones: [...clones], graph };
}

function run(repo: RepoUnit) {
  return detector.run(repo, testContext(detector, "typescript", []) as never);
}

/** El protocolo del colaborador: dos miembros de un tipo real del repo. */
const PROTOCOLO: readonly CodeGraphNode[] = [
  symNode("dominio/socio.ts", ["Socio", "nombreVisible"]),
  symNode("dominio/socio.ts", ["Socio", "enlace"]),
  { ...symNode("dominio/socio.ts", ["Socio"]), family: "class-like", memberOfClassLike: false },
];

/** Cuatro clientes en cuatro archivos que chequean `ctx.socio` y siguen distinto. */
function cuatroClientes(): CloneCandidate[] {
  return [
    clon("web/uno.ts", "uno", "function uno(ctx) { if (ctx.socio == null) { return ''; } return ctx.socio.nombreVisible(); }"),
    clon("web/dos.ts", "dos", "function dos(ctx) { if (ctx.socio == null) { throw new Error('x'); } return ctx.socio.enlace(); }"),
    clon("web/tres.ts", "tres", "function tres(ctx) { if (ctx.socio == null) { continue3(); } return ctx.socio.nombreVisible(); }"),
    clon("web/cuatro.ts", "cuatro", "function cuatro(ctx) { if (ctx.socio == null) { log('sin socio'); } return ctx.socio.enlace(); }"),
  ];
}

describe("repeated-absence-check — la forma completa", () => {
  it("cuatro clientes en cuatro archivos que chequean el mismo colaborador ⇒ UN hallazgo", () => {
    const findings = run(repoOf(cuatroClientes(), PROTOCOLO));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.variant).toBe("ctx.socio");
    expect(f.title).toContain("4 lugares");
    // clientes=4, archivos=4, mensajes con protocolo=2
    expect(f.trigger.map((t) => t.value)).toEqual([4, 4, 2]);
  });

  it("marca cada cliente con su rol y su continuación", () => {
    const f = run(repoOf(cuatroClientes(), PROTOCOLO))[0]!;
    const clientes = f.locations.filter((l) => l.role.startsWith(ROLE_CLIENTE)).map((l) => l.file);
    expect(clientes.sort()).toEqual(["web/cuatro.ts", "web/dos.ts", "web/tres.ts", "web/uno.ts"]);
  });

  it("el consejo mecánico nombra el colaborador y cuántas funciones lo chequean", () => {
    const f = run(repoOf(cuatroClientes(), PROTOCOLO))[0]!;
    expect(f.advice.primary.why).toContain("ctx.socio");
    expect(f.advice.primary.why).toContain("4 funciones");
  });
});

describe("repeated-absence-check — LA TRAMPA: no disparar donde el patrón YA ESTÁ (RESOLUCIÓN VERIFICADA)", () => {
  /** Un tipo neutro que declara TODO el protocolo, con miembros vacíos y ya instanciado. */
  function sustitutoCompleto(instanciado: boolean): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
    const tipo = { ...symNode("dominio/socio-neutro.ts", ["SocioNeutro"]), family: "class-like" as const, memberOfClassLike: false };
    const m1 = symNode("dominio/socio-neutro.ts", ["SocioNeutro", "nombreVisible"]);
    const m2 = symNode("dominio/socio-neutro.ts", ["SocioNeutro", "enlace"]);
    const usuario = symNode("web/fabrica.ts", ["haceSocio"]);
    const edges = [edge(tipo.id, m1.id, "contains"), edge(tipo.id, m2.id, "contains")];
    if (instanciado) edges.push(edge(usuario.id, tipo.id, "instantiates"));
    return { nodes: [tipo, m1, m2, usuario], edges };
  }

  it("con un objeto neutro que cubre TODO el protocolo y ya se instancia ⇒ SILENCIO", () => {
    const { nodes, edges } = sustitutoCompleto(true);
    expect(run(repoOf(cuatroClientes(), [...PROTOCOLO, ...nodes], edges))).toEqual([]);
  });

  it("el mismo objeto neutro SIN ningún sitio que lo instancie NO calla el detector: es media puerta", () => {
    const { nodes, edges } = sustitutoCompleto(false);
    const findings = run(repoOf(cuatroClientes(), [...PROTOCOLO, ...nodes], edges));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations.some((l) => l.role.startsWith(ROLE_MEDIA_PUERTA))).toBe(true);
  });

  it("un tipo que cubre SÓLO PARTE del protocolo, aunque esté instanciado, es media puerta y NO calla", () => {
    const tipo = { ...symNode("dominio/parcial.ts", ["SocioParcial"]), family: "class-like" as const, memberOfClassLike: false };
    const m1 = symNode("dominio/parcial.ts", ["SocioParcial", "nombreVisible"]);
    const usuario = symNode("web/fabrica.ts", ["haceSocio"]);
    const findings = run(
      repoOf(cuatroClientes(), [...PROTOCOLO, tipo, m1, usuario], [edge(tipo.id, m1.id, "contains"), edge(usuario.id, tipo.id, "instantiates")]),
    );
    expect(findings).toHaveLength(1);
    const media = findings[0]!.locations.find((l) => l.role.startsWith(ROLE_MEDIA_PUERTA));
    expect(media?.role).toContain("cubre 1 de 2");
  });

  it("un tipo con el protocolo entero pero con un miembro que SÍ llama a alguien NO es neutro: no calla", () => {
    const { nodes, edges } = sustitutoCompleto(true);
    const otro = symNode("dominio/otro.ts", ["otro"]);
    // `SocioNeutro.enlace` llama a algo ⇒ tiene comportamiento ⇒ el tipo no es neutro.
    const conCuerpo = [...edges, edge(symbolNodeId("dominio/socio-neutro.ts", ["SocioNeutro", "enlace"]), otro.id, "calls")];
    expect(run(repoOf(cuatroClientes(), [...PROTOCOLO, ...nodes, otro], conCuerpo))).toHaveLength(1);
  });

  it("un tipo con el protocolo entero pero con un miembro de span grande NO es neutro: no calla", () => {
    const tipo = { ...symNode("dominio/gordo.ts", ["SocioGordo"]), family: "class-like" as const, memberOfClassLike: false };
    const m1 = { ...symNode("dominio/gordo.ts", ["SocioGordo", "nombreVisible"]), startLine: 10, endLine: 40 };
    const m2 = symNode("dominio/gordo.ts", ["SocioGordo", "enlace"]);
    const usuario = symNode("web/fabrica.ts", ["haceSocio"]);
    const findings = run(
      repoOf(
        cuatroClientes(),
        [...PROTOCOLO, tipo, m1, m2, usuario],
        [edge(tipo.id, m1.id, "contains"), edge(tipo.id, m2.id, "contains"), edge(usuario.id, tipo.id, "instantiates")],
      ),
    );
    expect(findings).toHaveLength(1);
  });
});

describe("repeated-absence-check — una exclusión por cada condición", () => {
  it("(E1) tres clientes en vez de cuatro ⇒ silencio", () => {
    expect(run(repoOf(cuatroClientes().slice(0, 3), PROTOCOLO))).toEqual([]);
  });

  it("(E2) los cuatro chequeos en el MISMO archivo ⇒ silencio", () => {
    const mismos = cuatroClientes().map((c, i) => clon("web/uno.ts", `fn${i}`, c.normalized));
    expect(run(repoOf(mismos, PROTOCOLO))).toEqual([]);
  });

  it("(F2/E3) ningún mensaje resuelve a un miembro de un tipo ⇒ silencio", () => {
    // Mismo repo, pero el grafo no conoce `nombreVisible`/`enlace`.
    expect(run(repoOf(cuatroClientes(), [symNode("otro/cosa.ts", ["algoDistinto"])]))).toEqual([]);
  });

  it("(F2) un mensaje que resuelve a una función SUELTA (no miembro de un tipo) no cuenta como protocolo", () => {
    const sueltas = [
      { ...symNode("dominio/socio.ts", ["nombreVisible"]), memberOfClassLike: false },
      { ...symNode("dominio/socio.ts", ["enlace"]), memberOfClassLike: false },
    ];
    expect(run(repoOf(cuatroClientes(), sueltas))).toEqual([]);
  });

  it("(F1) un identificador DESNUDO no es un colaborador: `err` chequeado en cuatro archivos ⇒ silencio", () => {
    const desnudos = [
      clon("go/uno.ts", "uno", "func uno() { if err == nil { return } err.nombreVisible() }"),
      clon("go/dos.ts", "dos", "func dos() { if err == nil { panic() } err.enlace() }"),
      clon("go/tres.ts", "tres", "func tres() { if err == nil { log() } err.nombreVisible() }"),
      clon("go/cuatro.ts", "cuatro", "func cuatro() { if err == nil { skip() } err.enlace() }"),
    ];
    expect(run(repoOf(desnudos, PROTOCOLO))).toEqual([]);
  });

  it("(F1) `this.x` de DOS clases distintas no es el mismo colaborador: cuatro chequeos repartidos en dos tipos ⇒ silencio", () => {
    const dosClases = [
      clon("a/uno.ts", "uno", "uno() { if (this.socio == null) { return ''; } return this.socio.nombreVisible(); }", "Alfa"),
      clon("a/dos.ts", "dos", "dos() { if (this.socio == null) { return ''; } return this.socio.enlace(); }", "Alfa"),
      clon("b/tres.ts", "tres", "tres() { if (this.socio == null) { return ''; } return this.socio.nombreVisible(); }", "Beta"),
      clon("b/cuatro.ts", "cuatro", "cuatro() { if (this.socio == null) { return ''; } return this.socio.enlace(); }", "Beta"),
    ];
    expect(run(repoOf(dosClases, PROTOCOLO))).toEqual([]);
  });

  it("(F1) el mismo `this.x` del MISMO tipo en cuatro archivos SÍ cuenta — la identidad lleva el tipo dueño", () => {
    const unaClase = ["uno", "dos", "tres", "cuatro"].map((n, i) =>
      clon(`a/${n}.ts`, n, `${n}() { if (this.socio == null) { return ${i}; } return this.socio.nombreVisible(); }`, "Alfa"),
    );
    const findings = run(repoOf(unaClase, PROTOCOLO));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("alfa.socio");
  });

  it("un clon de CLASE (sin `functionName`) no aporta clientes: contarlo duplicaría al método que contiene", () => {
    const soloClases = cuatroClientes().map((c) => ({ ...c, functionName: null }));
    expect(run(repoOf(soloClases, PROTOCOLO))).toEqual([]);
  });

  it("la negación truthy (`if (!x)`) NO es un chequeo de ausencia — declarado en el docstring", () => {
    const truthy = ["uno", "dos", "tres", "cuatro"].map((n) =>
      clon(`web/${n}.ts`, n, `function ${n}(ctx) { if (!ctx.socio) { return ''; } return ctx.socio.nombreVisible(); }`),
    );
    expect(run(repoOf(truthy, PROTOCOLO))).toEqual([]);
  });

  it("sin grafo el detector no inventa nada (compuerta dura `needsGraph`)", () => {
    const repo: RepoUnit = { repoName: "x", files: [], functions: [], clones: cuatroClientes(), graph: null };
    expect(run(repo)).toEqual([]);
  });
});

describe("repeated-absence-check — las tres gramáticas de la ausencia", () => {
  function conTexto(hacer: (n: string, i: number) => string): CloneCandidate[] {
    return ["uno", "dos", "tres", "cuatro"].map((n, i) => clon(`p/${n}.py`, n, hacer(n, i)));
  }

  it("`is None` (python)", () => {
    const findings = run(repoOf(conTexto((n, i) => `def ${n}(ctx):\n  if ctx.socio is None:\n    return ${i}\n  return ctx.socio.nombreVisible()`), PROTOCOLO));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("ctx.socio");
  });

  it("`.nil?` (ruby)", () => {
    const findings = run(repoOf(conTexto((n, i) => `def ${n}(ctx)\n  return ${i} if ctx.socio.nil?\n  ctx.socio.enlace()\nend`), PROTOCOLO));
    expect(findings).toHaveLength(1);
  });

  it("`!= nil` (go) — la polaridad inversa es el MISMO hecho: el cliente tiene que preguntar", () => {
    const findings = run(repoOf(conTexto((n, i) => `func ${n}(ctx C) { if ctx.socio != nil { return ctx.socio.enlace() }; return ${i} }`), PROTOCOLO));
    expect(findings).toHaveLength(1);
  });
});

describe("repeated-absence-check — la evidencia que publica", () => {
  it("publica cuántas continuaciones distintas hay, y son las cuatro del escenario", () => {
    const f = run(repoOf(cuatroClientes(), PROTOCOLO))[0]!;
    const divergencia = f.evidence?.find((e) => e.label.startsWith("comportamientos por defecto"));
    expect(divergencia?.value).toBe(4);
  });

  it("publica cuántos mensajes NO resolvió el grafo — lo ambiguo viaja como ambiguo", () => {
    const conExtra = cuatroClientes().map((c) => ({ ...c, normalized: `${c.normalized} ctx.socio.mensajeDesconocido();` }));
    const f = run(repoOf(conExtra, PROTOCOLO))[0]!;
    const sinResolver = f.evidence?.find((e) => e.label.startsWith("mensajes que el grafo NO"));
    expect(sinResolver?.value).toBe(1);
  });

  it("`ausenciasRepetidas` devuelve el candidato aunque tenga sustituto completo — el que filtra es el detector", () => {
    const tipo = { ...symNode("dominio/neutro.ts", ["SocioNeutro"]), family: "class-like" as const, memberOfClassLike: false };
    const m1 = symNode("dominio/neutro.ts", ["SocioNeutro", "nombreVisible"]);
    const m2 = symNode("dominio/neutro.ts", ["SocioNeutro", "enlace"]);
    const usuario = symNode("web/fabrica.ts", ["haceSocio"]);
    const repo = repoOf(
      cuatroClientes(),
      [...PROTOCOLO, tipo, m1, m2, usuario],
      [edge(tipo.id, m1.id, "contains"), edge(tipo.id, m2.id, "contains"), edge(usuario.id, tipo.id, "instantiates")],
    );
    const candidatos = ausenciasRepetidas(repo.clones, repo.graph);
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]!.sustitutoCompleto).not.toBeNull();
    expect(run(repo)).toEqual([]);
  });
});

describe("repeated-absence-check — contrato de registro", () => {
  it("está registrado, es `inter-file` y declara `needsGraph`", () => {
    const registrado = DETECTORS.find((d) => d.id === "repeated-absence-check");
    expect(registrado).toBeDefined();
    expect(registrado!.scope).toBe("inter-file");
    expect((registrado as { needsGraph?: boolean }).needsGraph).toBe(true);
  });

  it("no declara ningún `needsEdges`/`needsAnyEdge`: las tres aristas que lee sólo pueden CALLARLO", () => {
    const d = detector as unknown as { needsEdges?: readonly string[]; needsAnyEdge?: readonly string[] };
    expect(d.needsEdges ?? []).toEqual([]);
    expect(d.needsAnyEdge ?? []).toEqual([]);
  });

  it("los cuatro umbrales están declarados con su razón", () => {
    for (const clave of ["clientes", "archivosQueChequean", "protocoloDelColaborador", "caracteresPorClon"] as const) {
      const spec = detector.thresholds[clave] as { rationale?: string };
      expect(spec.rationale?.length ?? 0).toBeGreaterThan(80);
    }
  });
});

describe("repeated-absence-check — el PROTOCOLO nunca es el objeto neutro (Ola Y, portado)", () => {
  it("una INTERFAZ declarada (fan-out cero por tautología) NO es un sustituto neutro", () => {
    const iface = {
      ...symNode("dominio/socio-iface.ts", ["SocioLike"]),
      family: "class-like" as const,
      memberOfClassLike: false,
      nodeType: "interface_declaration",
    };
    const m1 = symNode("dominio/socio-iface.ts", ["SocioLike", "nombreVisible"]);
    const m2 = symNode("dominio/socio-iface.ts", ["SocioLike", "enlace"]);
    const usuario = symNode("web/fabrica.ts", ["haceSocio"]);
    const findings = run(
      repoOf(
        cuatroClientes(),
        [...PROTOCOLO, iface, m1, m2, usuario],
        [edge(iface.id, m1.id, "contains"), edge(iface.id, m2.id, "contains"), edge(usuario.id, iface.id, "instantiates")],
      ),
    );
    // Sin la exclusión, la interfaz callaba el detector entero.
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations.some((l) => l.role.startsWith(ROLE_MEDIA_PUERTA))).toBe(false);
  });

  it("una RAÍZ DE JERARQUÍA (alguien la extiende) tampoco es un sustituto neutro", () => {
    const base = { ...symNode("dominio/base.ts", ["SocioBase"]), family: "class-like" as const, memberOfClassLike: false };
    const m1 = symNode("dominio/base.ts", ["SocioBase", "nombreVisible"]);
    const m2 = symNode("dominio/base.ts", ["SocioBase", "enlace"]);
    const hija = { ...symNode("dominio/hija.ts", ["SocioReal"]), family: "class-like" as const, memberOfClassLike: false };
    const usuario = symNode("web/fabrica.ts", ["haceSocio"]);
    const findings = run(
      repoOf(
        cuatroClientes(),
        [...PROTOCOLO, base, m1, m2, hija, usuario],
        [
          edge(base.id, m1.id, "contains"),
          edge(base.id, m2.id, "contains"),
          edge(hija.id, base.id, "extends"),
          edge(usuario.id, base.id, "instantiates"),
        ],
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations.some((l) => l.role.startsWith(ROLE_MEDIA_PUERTA))).toBe(false);
  });
});

describe("repeated-absence-check — un cliente es una FUNCIÓN, no una ocurrencia (descuento del anidamiento)", () => {
  it("el clon de la clausura ANIDADA no cuenta como un cliente más que el del método que la contiene", () => {
    const cuerpo = "function uno(ctx) { const f = () => { if (ctx.socio == null) { return ''; } return ctx.socio.nombreVisible(); }; return f(); }";
    const interno = "() => { if (ctx.socio == null) { return ''; } return ctx.socio.nombreVisible(); }";
    // Tres archivos con un método y su clausura anidada = 6 clones, 3 clientes reales.
    const clones = ["uno", "dos", "tres"].flatMap((n) => [
      clon(`web/${n}.ts`, n, cuerpo, null, 10, 30),
      clon(`web/${n}.ts`, "(anónima)", interno, null, 12, 20),
    ]);
    // Con 3 clientes reales queda POR DEBAJO del piso de 4 ⇒ silencio. Sin el
    // descuento serían 6 y el detector emitiría.
    expect(run(repoOf(clones, PROTOCOLO))).toEqual([]);
  });

  it("con CUATRO archivos (4 clientes reales, 8 clones) sí emite, y publica 4 clientes — no 8", () => {
    const cuerpo = "function uno(ctx) { const f = () => { if (ctx.socio == null) { return ''; } return ctx.socio.nombreVisible(); }; return f(); }";
    const interno = "() => { if (ctx.socio == null) { return ''; } return ctx.socio.nombreVisible(); }";
    const clones = ["uno", "dos", "tres", "cuatro"].flatMap((n) => [
      clon(`web/${n}.ts`, n, cuerpo, null, 10, 30),
      clon(`web/${n}.ts`, "(anónima)", interno, null, 12, 20),
    ]);
    const findings = run(repoOf(clones, PROTOCOLO));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(4);
  });
});
