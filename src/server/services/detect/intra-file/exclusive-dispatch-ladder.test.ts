/**
 * `exclusive-dispatch-ladder` — el ancla-FUERZA de Chain of Responsibility
 * (Ola AE, frente AE5).
 *
 * CÓMO ESTÁ ORGANIZADO, y por qué: las SEIS condiciones del detector (ver su
 * docstring) existen cada una para cortar un falso concreto, así que cada una
 * tiene acá su test de FORMA COMPLETA (se cumple ⇒ dispara) y su test de
 * EXCLUSIÓN (no se cumple ⇒ silencio). Un detector cuyas exclusiones no están
 * probadas no tiene exclusiones: tiene comentarios.
 *
 * Y LOS DOS QUE VALEN MÁS QUE TODOS — **LA TRAMPA, en sus dos formas**: sobre
 * un repo donde la cadena YA está armada (un destino llama al siguiente) y
 * sobre uno donde OTRO sitio ya enumera a los mismos destinos, el detector
 * tiene que quedarse CALLADO. Encontrar patrones ya aplicados es exactamente
 * lo contrario del objetivo.
 */
import { describe, expect, it } from "vitest";

import { detector, ladderFactsFor, ROLE_BRANCH, ROLE_SENDER } from "./exclusive-dispatch-ladder.js";
import { DETECTORS } from "../registry.js";
import { DETECTOR_IMPACT } from "../impact.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../testing.js";
import type { RawFinding } from "../types.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode, GraphIndex } from "../../graph/types.js";

const TS_PROBE = `
class Probe {
  m(a: string): void {
    if (a) { this.x(a); }
  }
}
function free(a: string): void {
  if (a) { other(a); }
}
`;

const PY_PROBE = `
class Probe:
    def m(self, a):
        if a:
            self.x(a)

def free(a):
    if a:
        other(a)
`;

/** LA FORMA COMPLETA — escalera de 4 guardas con salida temprana, la MISMA
 *  solicitud (`req`) a 4 destinos distintos, condiciones independientes. */
const TS_FORMA_COMPLETA = `
class Router {
  dispatch(req: Request): Response | null {
    if (req.isUpload) { return this.uploads.store(req); }
    if (req.hasSession) { return this.sessions.renew(req); }
    if (looksLikeBot(req)) { return this.throttle.reject(req); }
    if (req.wantsHtml) { return this.pages.render(req); }
    return null;
  }
}
`;

/** MISMA forma, escrita como cadena `if/else if` — la que el camino viejo del
 *  patrón NO PUEDE VER NUNCA (`topLevelGuardRun` descarta toda guarda con
 *  `alternative`). */
const TS_ELSE_IF = `
class Router {
  dispatch(req: Request): Response | null {
    if (req.isUpload) {
      return this.uploads.store(req);
    } else if (req.hasSession) {
      return this.sessions.renew(req);
    } else if (looksLikeBot(req)) {
      return this.throttle.reject(req);
    } else if (req.wantsHtml) {
      return this.pages.render(req);
    } else {
      return null;
    }
  }
}
`;

/** EXCLUSIÓN (1) — sólo 3 ramas: la escalera existe pero el patrón no paga. */
const TS_TRES_RAMAS = `
class Router {
  dispatch(req: Request): Response | null {
    if (req.isUpload) { return this.uploads.store(req); }
    if (req.hasSession) { return this.sessions.renew(req); }
    if (req.wantsHtml) { return this.pages.render(req); }
    return null;
  }
}
`;

/** EXCLUSIÓN (3) — PIPELINE: cada rama corta sobre lo que calculó la anterior
 *  y nadie recibe la solicitud entera. Es la causa (a) que la Ola 12 midió a
 *  mano sobre 47 falsos. */
const TS_PIPELINE = `
class Router {
  dispatch(req: Request): Response | null {
    const env = readEnv();
    if (!env) { return this.uploads.store(env); }
    const cfg = readConfig(env);
    if (!cfg) { return this.sessions.renew(cfg); }
    const user = findUser(cfg);
    if (!user) { return this.throttle.reject(user); }
    const page = buildPage(user);
    if (!page) { return this.pages.render(page); }
    return null;
  }
}
`;

/** EXCLUSIÓN (4) — un ÚNICO discriminante: todas las condiciones preguntan por
 *  `kind`. Es un despacho por valor (Strategy/State), no una cadena. */
const TS_UN_DISCRIMINANTE = `
class Router {
  dispatch(req: Request): Response | null {
    if (kind === 1) { return this.uploads.store(req); }
    if (kind === 2) { return this.sessions.renew(req); }
    if (kind === 3) { return this.throttle.reject(req); }
    if (kind === 4) { return this.pages.render(req); }
    return null;
  }
}
`;

/** EXCLUSIÓN (2) — las ramas NO delegan: abortan con literales. */
const TS_SOLO_VALIDA = `
class Router {
  dispatch(req: Request): Response | null {
    if (req.isUpload) { return null; }
    if (req.hasSession) { return null; }
    if (looksLikeBot(req)) { return null; }
    if (req.wantsHtml) { return null; }
    return null;
  }
}
`;

const PY_FORMA_COMPLETA = `
class Router:
    def dispatch(self, req):
        if req.is_upload:
            return self.uploads.store(req)
        if req.has_session:
            return self.sessions.renew(req)
        if looks_like_bot(req):
            return self.throttle.reject(req)
        if req.wants_html:
            return self.pages.render(req)
        return None
`;

const DESTINOS = ["store", "renew", "reject", "render"] as const;

const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function symbolNode(id: string, file: string, symbolPath: string[]): CodeGraphNode {
  return { id, kind: "symbol", file, symbolPath, family: "function-like" };
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"] = "calls"): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved" } as CodeGraphEdge;
}

/**
 * El grafo del caso feliz: el emisor `Router.dispatch` llama a los cuatro
 * destinos, cada destino vive en su propio archivo, ninguno llama a otro y
 * nadie más los llama.
 */
function grafoFeliz(senderFile = "a.ts", extra: CodeGraphEdge[] = [], extraNodes: CodeGraphNode[] = []): CodeGraph {
  const sender = symbolNode(`sym:${senderFile}#Router.dispatch`, senderFile, ["Router", "dispatch"]);
  const nodes: CodeGraphNode[] = [sender];
  const edges: CodeGraphEdge[] = [];
  for (const d of DESTINOS) {
    const id = `sym:h/${d}.ts#H${d}.${d}`;
    nodes.push(symbolNode(id, `h/${d}.ts`, [`H${d}`, d]));
    edges.push(edge(sender.id, id));
  }
  return { nodes: [...nodes, ...extraNodes], edges: [...edges, ...extra], resolution: EMPTY_RESOLUTION } as CodeGraph;
}

function indexOf(graph: CodeGraph): GraphIndex {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const from = new Map<string, CodeGraphEdge[]>();
  const to = new Map<string, CodeGraphEdge[]>();
  for (const e of graph.edges) {
    (from.get(e.from) ?? from.set(e.from, []).get(e.from)!).push(e);
    (to.get(e.to) ?? to.set(e.to, []).get(e.to)!).push(e);
  }
  return { nodeById: (id) => byId.get(id) ?? null, edgesFrom: (id) => from.get(id) ?? [], edgesTo: (id) => to.get(id) ?? [] };
}

async function corre(
  source: string,
  graph: CodeGraph | null,
  opts: { wasm?: string; probe?: string; language?: string; path?: string } = {},
): Promise<readonly RawFinding[]> {
  const wasm = opts.wasm ?? "tree-sitter-typescript.wasm";
  const probe = opts.probe ?? TS_PROBE;
  const language = opts.language ?? "typescript";
  const path = opts.path ?? "a.ts";
  const sets = await nodeSetsFor(wasm, probe);
  const root = await parseRoot(wasm, source);
  const file = fileUnitFrom(root, sets, language, { file: path });
  const index = graph ? indexOf(graph) : null;
  const ctx = { ...testContext(detector, language, ["unidad-tipo-clase"]), graph, graphIndex: () => index };
  return detector.run(file, ctx);
}

describe("exclusive-dispatch-ladder — la forma completa", () => {
  it("TypeScript: 4 guardas excluyentes reparten la MISMA solicitud entre 4 destinos exclusivos ⇒ 1 hallazgo, con el emisor y las 4 ramas como lugares", async () => {
    const findings = await corre(TS_FORMA_COMPLETA, grafoFeliz());
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.variant).toBe("dispatch");
    expect(f.trigger[0]!.value).toBe(4); // ramas
    expect(f.trigger[1]!.value).toBe(4); // destinos resueltos
    expect(f.locations).toHaveLength(5); // emisor + 4 ramas
    expect(f.locations[0]!.role).toContain(ROLE_SENDER);
    expect(f.locations[1]!.role).toContain(ROLE_BRANCH);
    expect(f.detail).toContain("store");
    expect(f.detail).toContain("render");
    // la solicitud que viaja está nombrada, no adivinada
    expect(f.title).toContain('"req"');
  });

  it("la MISMA forma escrita como cadena `if/else if` dispara igual — es la forma que el camino viejo del patrón no puede ver nunca", async () => {
    const findings = await corre(TS_ELSE_IF, grafoFeliz());
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(4);
  });

  it("Python: la misma forma con `self.` y guardas ⇒ 1 hallazgo (nada de esto depende de la gramática de TS)", async () => {
    const graph = grafoFeliz("a.py");
    const findings = await corre(PY_FORMA_COMPLETA, graph, {
      wasm: "tree-sitter-python.wasm",
      probe: PY_PROBE,
      language: "python",
      path: "a.py",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[1]!.value).toBe(4);
  });
});

describe("exclusive-dispatch-ladder — una exclusión por condición", () => {
  it("(1) ESCALA: 3 ramas ⇒ silencio (el piso de PAGO está por encima del piso de existencia, MIN_GUARD_RUN=3)", async () => {
    expect(await corre(TS_TRES_RAMAS, grafoFeliz())).toEqual([]);
  });

  it("(2) las ramas no delegan (abortan con literales) ⇒ silencio", async () => {
    expect(await corre(TS_SOLO_VALIDA, grafoFeliz())).toEqual([]);
  });

  it("(3) PIPELINE: cada rama recibe lo que calculó la anterior, ninguna recibe la solicitud ⇒ silencio", async () => {
    expect(await corre(TS_PIPELINE, grafoFeliz())).toEqual([]);
  });

  it("(4) UN SOLO DISCRIMINANTE: las 4 condiciones preguntan por `kind` ⇒ silencio (eso es Strategy/State, no una cadena)", async () => {
    expect(await corre(TS_UN_DISCRIMINANTE, grafoFeliz())).toEqual([]);
  });

  it("el grafo resuelve sólo 3 de los 4 destinos ⇒ silencio: no se afirma nada sobre lo que no se puede mirar", async () => {
    const graph = grafoFeliz();
    const podado: CodeGraph = {
      ...graph,
      nodes: graph.nodes.filter((n) => !n.id.endsWith("Hrender.render")),
      edges: graph.edges.filter((e) => !e.to.endsWith("Hrender.render")),
    } as CodeGraph;
    expect(await corre(TS_FORMA_COMPLETA, podado)).toEqual([]);
  });

  it("SIN GRAFO no emite nada — `needsGraph` en un detector intra-* es ruteo, no compuerta, así que tiene que degradar solo", async () => {
    expect(await corre(TS_FORMA_COMPLETA, null)).toEqual([]);
  });
});

describe("exclusive-dispatch-ladder — LA TRAMPA, en sus dos formas", () => {
  it("(5a) la cadena YA está armada: un destino llama a otro destino ⇒ SILENCIO", async () => {
    const graph = grafoFeliz("a.ts", [edge("sym:h/store.ts#Hstore.store", "sym:h/renew.ts#Hrenew.renew")]);
    expect(await corre(TS_FORMA_COMPLETA, graph)).toEqual([]);
  });

  it("(5b) OTRO sitio ya enumera a dos de los destinos ⇒ SILENCIO: la enumeración no es exclusiva de este emisor", async () => {
    const otro = symbolNode("sym:b.ts#Otro.elige", "b.ts", ["Otro", "elige"]);
    const graph = grafoFeliz("a.ts", [edge(otro.id, "sym:h/store.ts#Hstore.store"), edge(otro.id, "sym:h/renew.ts#Hrenew.renew")], [otro]);
    expect(await corre(TS_FORMA_COMPLETA, graph)).toEqual([]);
  });

  it("otro sitio llama a UN solo destino ⇒ sigue disparando: un destino compartido no es una enumeración compartida", async () => {
    const otro = symbolNode("sym:b.ts#Otro.usa", "b.ts", ["Otro", "usa"]);
    const graph = grafoFeliz("a.ts", [edge(otro.id, "sym:h/store.ts#Hstore.store")], [otro]);
    expect(await corre(TS_FORMA_COMPLETA, graph)).toHaveLength(1);
  });

  it("la auto-llamada del emisor no cuenta como destino (recursión, no manejador)", async () => {
    const graph = grafoFeliz();
    const conRecursion: CodeGraph = { ...graph, edges: [...graph.edges, edge("sym:a.ts#Router.dispatch", "sym:a.ts#Router.dispatch")] } as CodeGraph;
    expect(await corre(TS_FORMA_COMPLETA, conRecursion)).toHaveLength(1);
  });
});

describe("exclusive-dispatch-ladder — la evidencia que la hipótesis consume", () => {
  it("reporta los protocolos compartidos como EVIDENCIA, nunca como compuerta: con protocolo común sigue emitiendo", async () => {
    const graph = grafoFeliz("a.ts", [edge("sym:h/store.ts#Hstore", "sym:i.ts#IHandler", "implements"), edge("sym:h/renew.ts#Hrenew", "sym:i.ts#IHandler", "implements")]);
    const findings = await corre(TS_FORMA_COMPLETA, graph);
    expect(findings).toHaveLength(1);
    const protocolos = findings[0]!.evidence!.find((e) => e.label.includes("protocolos"))!;
    expect(protocolos.value).toBe(1);
    expect(protocolos.note).toContain("IHandler");
  });

  it("`ladderFactsFor` es la MISMA función que consume la hipótesis: devuelve los hechos y el motivo exacto del rechazo", async () => {
    const sets = await nodeSetsFor("tree-sitter-typescript.wasm", TS_PROBE);
    const root = await parseRoot("tree-sitter-typescript.wasm", TS_TRES_RAMAS);
    const file = fileUnitFrom(root, sets, "typescript", { file: "a.ts" });
    const fn = file.functions.find((f) => f.name === "dispatch")!;
    const outcome = ladderFactsFor(file, fn, indexOf(grafoFeliz()), 4, 4);
    expect(outcome.facts).toBeNull();
    expect(outcome.rejection).toBe("sin-escalera");
    expect(outcome.rawBranches).toBe(3);
  });

  it("sin destinos que compartan protocolo, la evidencia lo dice en cero (es lo que separa `ausente` de `parcial` en la hipótesis)", async () => {
    const findings = await corre(TS_FORMA_COMPLETA, grafoFeliz());
    const protocolos = findings[0]!.evidence!.find((e) => e.label.includes("protocolos"))!;
    expect(protocolos.value).toBe(0);
  });
});

describe("exclusive-dispatch-ladder — contrato de registro", () => {
  it("está registrado UNA vez, es intra-file y declara `needsGraph`", () => {
    const found = DETECTORS.filter((d) => d.id === "exclusive-dispatch-ladder");
    expect(found).toHaveLength(1);
    expect(found[0]!.scope).toBe("intra-file");
    expect((found[0] as { needsGraph?: boolean }).needsGraph).toBe(true);
  });

  it("tiene tier de impacto declarado", () => {
    expect(DETECTOR_IMPACT["exclusive-dispatch-ladder"]).toBe("arquitectura");
  });

  it("los dos pisos son 4 y 4, con su razón escrita — se leen del hallazgo REAL, que es donde el usuario los ve", async () => {
    const f = (await corre(TS_FORMA_COMPLETA, grafoFeliz()))[0]!;
    const ramas = f.trigger[0]!.threshold;
    const destinos = f.trigger[1]!.threshold;
    expect(ramas.value).toBe(4);
    expect(destinos.value).toBe(4);
    expect(ramas.kind).toBe("piso-declarado");
    expect(JSON.stringify(ramas.detail)).toContain("MIN_GUARD_RUN");
    expect(JSON.stringify(destinos.detail)).toContain("2 manejadores nunca justifican una cadena");
  });
});

/**
 * EL DEFECTO QUE SÓLO APARECIÓ MIDIENDO (informe AE5, §"qué rompí y cómo lo
 * arreglé"). La primera versión aceptaba una guarda cuyo cuerpo CONTUVIERA una
 * salida temprana en cualquier lugar; el caso real que lo rompió es
 * `gitea/models/activities/repo_activity.go:48 GetActivityStats`: cuatro
 * `if <bandera> { … if err != nil { return … } }` que corren TODOS cuando sus
 * banderas están encendidas. Eso es un acumulador de pasos OPCIONALES, no una
 * elección entre destinos: no hay exclusión mutua y el ancla no debe emitir.
 */
describe("exclusive-dispatch-ladder — pasos OPCIONALES no son una escalera", () => {
  const TS_PASOS_OPCIONALES = `
class Stats {
  fill(req: Req): Res | null {
    if (req.wantsA) {
      if (this.uploads.store(req)) { return null; }
    }
    if (req.wantsB) {
      if (this.sessions.renew(req)) { return null; }
    }
    if (req.wantsC) {
      if (this.throttle.reject(req)) { return null; }
    }
    if (req.wantsD) {
      if (this.pages.render(req)) { return null; }
    }
    return this.done();
  }
}
`;

  it("cuatro `if` cuyo cuerpo CONTIENE un return anidado pero NO TERMINA en él ⇒ silencio: corren todos, no se excluyen", async () => {
    const graph = grafoFeliz("a.ts");
    const conFill: CodeGraph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "sym:a.ts#Router.dispatch" ? { ...n, id: "sym:a.ts#Stats.fill", symbolPath: ["Stats", "fill"] } : n)),
      edges: graph.edges.map((e) => (e.from === "sym:a.ts#Router.dispatch" ? { ...e, from: "sym:a.ts#Stats.fill" } : e)),
    } as CodeGraph;
    expect(await corre(TS_PASOS_OPCIONALES, conFill)).toEqual([]);
  });

  it("la MISMA forma pero con el `return` como ÚLTIMO statement de cada rama ⇒ SÍ dispara (ahí sí se excluyen)", async () => {
    const excluyente = TS_PASOS_OPCIONALES.replace(/if \(this\.(\w+)\.(\w+)\(req\)\) \{ return null; \}/g, "return this.$1.$2(req);");
    const graph = grafoFeliz("a.ts");
    const conFill: CodeGraph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "sym:a.ts#Router.dispatch" ? { ...n, id: "sym:a.ts#Stats.fill", symbolPath: ["Stats", "fill"] } : n)),
      edges: graph.edges.map((e) => (e.from === "sym:a.ts#Router.dispatch" ? { ...e, from: "sym:a.ts#Stats.fill" } : e)),
    } as CodeGraph;
    expect(await corre(excluyente, conFill)).toHaveLength(1);
  });
});

/**
 * EL SEGUNDO DEFECTO QUE SÓLO APARECIÓ MIDIENDO (informe AE5, §"qué rompí"):
 * dos bloques `if/else` INDEPENDIENTES, uno detrás del otro, NO son mutuamente
 * excluyentes entre sí. El caso real que lo rompió es
 * `sqlalchemy/lib/sqlalchemy/orm/session.py:2182 _execute_internal`, un
 * procedimiento de 200 líneas con cuatro `if/else` sueltos que la primera
 * versión juntó en una sola "escalera de cuatro destinos".
 */
describe("exclusive-dispatch-ladder — `if/else` sueltos no son UNA escalera", () => {
  const TS_IF_ELSE_SUELTOS = `
class Session {
  execute(stmt: Stmt): Res {
    if (stmt.isOrm) {
      this.uploads.store(stmt);
    } else {
      this.plain = true;
    }
    const opts = merge(stmt);
    if (opts.hasEvents) {
      this.sessions.renew(stmt);
    } else {
      this.noEvents = true;
    }
    if (opts.scalar) {
      this.throttle.reject(stmt);
    } else {
      this.notScalar = true;
    }
    if (opts.compiled) {
      this.pages.render(stmt);
    } else {
      this.notCompiled = true;
    }
    return this.result;
  }
}
`;

  function grafoDe(symbol: string): CodeGraph {
    const graph = grafoFeliz("a.ts");
    return {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "sym:a.ts#Router.dispatch" ? { ...n, id: `sym:a.ts#${symbol}`, symbolPath: symbol.split(".") } : n)),
      edges: graph.edges.map((e) => (e.from === "sym:a.ts#Router.dispatch" ? { ...e, from: `sym:a.ts#${symbol}` } : e)),
    } as CodeGraph;
  }

  it("cuatro `if/else` independientes, cada uno con UN solo brazo con condición ⇒ silencio (ninguno excluye al siguiente)", async () => {
    expect(await corre(TS_IF_ELSE_SUELTOS, grafoDe("Session.execute"))).toEqual([]);
  });

  it("la MISMA cantidad de destinos, pero escritos como UNA cadena `if/else if` ⇒ SÍ dispara", async () => {
    const enCadena = `
class Session {
  execute(stmt: Stmt): Res {
    if (stmt.isOrm) {
      return this.uploads.store(stmt);
    } else if (stmt.hasEvents) {
      return this.sessions.renew(stmt);
    } else if (stmt.scalar) {
      return this.throttle.reject(stmt);
    } else if (stmt.compiled) {
      return this.pages.render(stmt);
    }
    return this.result;
  }
}
`;
    expect(await corre(enCadena, grafoDe("Session.execute"))).toHaveLength(1);
  });
});
