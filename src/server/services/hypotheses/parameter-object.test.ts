/**
 * `parameter-object.test.ts` — Ola AS, frente AS1.
 *
 * QUÉ INTENCIÓN VERIFICA CADA CHEQUEO, de corrido:
 *
 *   1. **"sin árbol vivo no es candidata"** — toda la compuerta se apoya en
 *      los NOMBRES de las firmas, y ésos viven en el árbol. Un `required` que
 *      aprobara ahí sería decoración (`no-permissive-required.test.ts`).
 *   2. **LA COMPUERTA: la firma larga SUELTA no dispara** — 6 parámetros que
 *      no viajan juntos a ninguna otra firma del archivo no tienen un objeto
 *      adentro esperando a nacer. Es lo único que este archivo agrega sobre
 *      `long-parameter-list`, y lo que separa "hay un objeto acá" de "esta
 *      función hace demasiadas cosas".
 *   3. **EL BUG CONGELADO: la co-ocurrencia es DEL ARCHIVO, no del repo** —
 *      la primera versión preguntaba sobre el repo entero con el índice de
 *      portadores del grafo, y `connect(a,b,c,d,e,f)` de TypeScript
 *      "compartía el grupo" con `Connect(a,b,c,d,e,f)` de Go. Los nombres
 *      genéricos co-ocurren en cualquier repo grande por frecuencia, no
 *      porque un grupo viaje junto.
 *   4. **El caso positivo por `long-parameter-list`** — el grupo que sí viaja,
 *      con la evidencia nombrando los datos reales.
 *   5. **El caso positivo por `data-clump`** — el grupo se RE-DERIVA del
 *      árbol (intersección de las firmas que el ancla señala), nunca del
 *      TÍTULO del hallazgo.
 *   6. **RESOLUCIÓN `parcial` (Preserve Whole Object)** — otro símbolo del
 *      repo ya declara todos los datos del grupo como campos: el objeto
 *      existe y estas firmas lo desarman. Es la propuesta más accionable.
 *   7. **RESOLUCIÓN `ya-aplicado`** — la clase que DECLARA la firma ya guarda
 *      los datos como campos propios: el objeto es esa clase. No disparar
 *      donde la solución ya está es la primera pregunta de la Ola AP.
 *   8. **Sin grafo emite igual, pero el check DICE que no pudo mirar** — la
 *      diferencia entre "verifiqué que no existe" y "no pude mirar".
 *   9. **Los seis lenguajes** — la trampa de `SELF_PREFIX`, pagada.
 *  10. **La desestructuración no fabrica grupos parciales** — mismo criterio
 *      que `data-clump.ts`.
 */
import { describe, expect, it } from "vitest";

import { LANGUAGE_DECLS } from "../code-analyzer.js";
import type { Capability } from "../detect/capabilities.js";
import { citado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding, FileUnit, RoleLocation } from "../detect/types.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import type { CodeGraph, CodeGraphNode } from "../graph/types.js";
import { hypothesis as parameterObject } from "./parameter-object.js";
import type { HypothesisContext } from "./types.js";

/**
 * LAS SONDAS SON LAS DE PRODUCCIÓN (`LANGUAGE_DECLS` de `code-analyzer.ts`),
 * no unas escritas a mano acá. Razón medida en esta misma ola: una sonda
 * hecha a mano con un `if` adentro derivaba `branchNodes` VACÍO, y un test que
 * pasa con `branchNodes` vacío no prueba nada de lo que el analizador de
 * verdad ve. Con la sonda de producción, el test mide contra la MISMA
 * gramática derivada que la corrida real.
 */
async function unitFor(langId: string, source: string, file: string): Promise<FileUnit> {
  const decl = LANGUAGE_DECLS.find((d) => d.id === langId);
  if (!decl) throw new Error(`lenguaje no declarado: ${langId}`);
  const [sets, root] = await Promise.all([
    nodeSetsFor(decl.wasm, decl.probeSource, decl.extraCloneNodes, decl.functionExclusions),
    parseRoot(decl.wasm, source),
  ]);
  return fileUnitFrom(root, sets, langId, { file });
}

function threshold(): Threshold {
  return resolveThreshold(citado(6, { work: "test", rule: "piso" }), { language: "typescript", sampleSize: () => 0, corpusP95: () => null });
}

function loc(file: string, startLine: number, endLine: number, symbol: string, role: string): RoleLocation {
  return { file, startLine, endLine, symbol, role };
}

function lplFinding(file: string, startLine: number, endLine: number, symbol: string, params: number, language = "typescript"): Finding {
  return {
    id: "lpl-1",
    detectorId: "long-parameter-list",
    kind: "long-parameter-list",
    scope: "intra-function",
    language,
    title: `${symbol} recibe ${params} parámetros`,
    detail: "d",
    trigger: [{ label: "parámetros", value: params, threshold: threshold() }],
    locations: [loc(file, startLine, endLine, symbol, "función con exceso de parámetros")],
    severity: 60,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function clumpFinding(file: string, spans: readonly (readonly [number, number, string])[]): Finding {
  const locations = spans.map(([s, e, sym], i) => loc(file, s, e, sym, i === 0 ? "primera firma con este grupo" : `repetición #${i}`));
  const [first, ...rest] = locations;
  return {
    id: "dc-1",
    detectorId: "data-clump",
    kind: "data-clump",
    scope: "intra-file",
    language: "typescript",
    title: "El grupo (…) se repite en 3 firmas de este archivo",
    detail: "d",
    trigger: [{ label: "firmas con el mismo grupo", value: spans.length, threshold: threshold() }],
    locations: [first!, ...rest],
    severity: 60,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function carrier(file: string, symbolPath: readonly string[], carrierForm: "parameter" | "field" | "local"): CodeGraphNode {
  return { id: `carrier:${file}#${symbolPath.join(".")}@0`, kind: "carrier", file, symbolPath, carrierForm, startLine: 1, endLine: 1 };
}

function graphOf(nodes: readonly CodeGraphNode[]): CodeGraph {
  return { nodes, edges: [], resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

function ctxFor(file: FileUnit | null): HypothesisContext {
  return {
    file,
    fileAt: (p: string) => (file && file.path === p ? file : null),
    repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
    capabilities: new Set<Capability>(["tipos-explicitos", "unidad-tipo-clase"]),
    setsFor: () => file?.sets ?? {
      functionNodes: new Set(), branchNodes: new Set(), chainNodes: new Set(), cloneNodes: new Set(),
      classNodes: new Set(), nestingNodes: new Set(), constructorNodes: new Set(), exceptionNodes: new Set(),
      switchContainerNodes: new Set(),
    },
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

const FILE = "src/router.ts";

/** Tres firmas del MISMO archivo que comparten (host, port, user, password). */
const SRC_GRUPO = `
export function alpha(host: string, port: number, user: string, password: string, timeout: number, retries: number): number {
  return port;
}
export function beta(host: string, port: number, user: string, password: string): number {
  return port;
}
export function gamma(host: string, port: number, user: string, password: string, extra: number): number {
  return port;
}
`;

/** Una firma larga SUELTA: nadie más del archivo comparte su grupo. */
const SRC_SUELTA = `
export function alpha(host: string, port: number, user: string, password: string, timeout: number, retries: number): number {
  return port;
}
export function otra(a: number, b: number): number {
  return a + b;
}
`;

describe("Parameter Object · la compuerta", () => {
  it("1. sin árbol vivo no es candidata — los nombres de la firma viven en el árbol", () => {
    const h = parameterObject.build(lplFinding(FILE, 2, 4, "alpha", 6), null, ctxFor(null));
    expect(h).toBeNull();
  });

  it("2. LA COMPUERTA: la firma larga SUELTA no dispara — 6 parámetros que no viajan juntos no son un objeto", async () => {
    const file = await unitFor("typescript", SRC_SUELTA, FILE);
    const h = parameterObject.build(lplFinding(FILE, 2, 4, "alpha", 6), null, ctxFor(file));
    expect(h).toBeNull();
  });

  it("3. BUG CONGELADO: la co-ocurrencia es DEL ARCHIVO — un homónimo de otro archivo NO forma grupo", async () => {
    const file = await unitFor("typescript", SRC_SUELTA, FILE);
    // El grafo trae una función de OTRO archivo con los mismos 6 nombres: si el
    // required volviera a mirar el repo entero, esto dispararía.
    const g = graphOf([
      carrier("src/otro.ts", ["clonada", "host"], "parameter"),
      carrier("src/otro.ts", ["clonada", "port"], "parameter"),
      carrier("src/otro.ts", ["clonada", "user"], "parameter"),
      carrier("src/otro.ts", ["clonada", "password"], "parameter"),
      carrier("src/otro.ts", ["clonada", "timeout"], "parameter"),
      carrier("src/otro.ts", ["clonada", "retries"], "parameter"),
    ]);
    const h = parameterObject.build(lplFinding(FILE, 2, 4, "alpha", 6), g, ctxFor(file));
    expect(h, "si esto emite, volvió la co-ocurrencia de repo y la compuerta es un colador").toBeNull();
  });

  it("4. el grupo que SÍ viaja dispara, y la evidencia nombra los datos reales", async () => {
    const file = await unitFor("typescript", SRC_GRUPO, FILE);
    const h = parameterObject.build(lplFinding(FILE, 2, 4, "alpha", 6), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.pattern).toBe("Parameter Object");
    expect(h!.state).toBe("ausente");
    const req = h!.checks.find((c) => c.role === "required");
    expect(req?.passed).toBe(true);
    expect(req?.why).toContain("host");
    expect(req?.why).toContain("password");
  });

  it("5. el camino `data-clump` RE-DERIVA el grupo del árbol, nunca del título del hallazgo", async () => {
    const file = await unitFor("typescript", SRC_GRUPO, FILE);
    const h = parameterObject.build(clumpFinding(FILE, [[2, 4, "alpha"], [5, 7, "beta"], [8, 10, "gamma"]]), null, ctxFor(file));
    expect(h).not.toBeNull();
    const req = h!.checks.find((c) => c.role === "required");
    expect(req?.passed).toBe(true);
    // El título del hallazgo dice "(…)" — si el grupo saliera de ahí, esto fallaría.
    expect(req?.why).toContain("host");
  });
});

describe("Parameter Object · la resolución", () => {
  it("6. `parcial` (Preserve Whole Object): otro símbolo del repo ya declara los datos como campos", async () => {
    const file = await unitFor("typescript", SRC_GRUPO, FILE);
    const g = graphOf([
      carrier("src/conn.ts", ["Conn", "host"], "field"),
      carrier("src/conn.ts", ["Conn", "port"], "field"),
      carrier("src/conn.ts", ["Conn", "user"], "field"),
      carrier("src/conn.ts", ["Conn", "password"], "field"),
    ]);
    const h = parameterObject.build(lplFinding(FILE, 2, 4, "alpha", 6), g, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.checks.find((c) => c.role === "applied")?.why).toContain("src/conn.ts");
  });

  it("7. BUG CONGELADO — la clase que ya guarda el grupo como campos NO da `ya-aplicado`: da NULL, porque una confirmación acá le BORRA la propuesta a Builder", async () => {
    const SRC_CLASE = `
export class Conn {
  private host: string;
  alpha(host: string, port: number, user: string, password: string, timeout: number, retries: number): number { return port; }
  beta(host: string, port: number, user: string, password: string): number { return port; }
}
`;
    const file = await unitFor("typescript", SRC_CLASE, FILE);
    const g = graphOf([
      carrier(FILE, ["Conn", "host"], "field"),
      carrier(FILE, ["Conn", "port"], "field"),
      carrier(FILE, ["Conn", "user"], "field"),
      carrier(FILE, ["Conn", "password"], "field"),
    ]);
    const h = parameterObject.build(lplFinding(FILE, 4, 4, "alpha", 6), g, ctxFor(file));
    // `engine.ts#arbitrateRivalHypotheses` retira una OPORTUNIDAD cuando otro
    // patrón sobre el MISMO `Finding` está en `ya-aplicado`/`aplicado-eludido`
    // y sus `places` solapan. `long-parameter-list` es también ancla de
    // Builder y de Decorator. Medido en `corpus/click`: con `ya-aplicado` acá,
    // la oportunidad de Builder en `src/click/core.py:2944` DESAPARECÍA.
    expect(h, "si esto deja de ser null, esta familia vuelve a poder enterrar propuestas de Builder/Decorator").toBeNull();
  });

  it("8. sin grafo emite igual, pero el check DICE que no pudo mirar — no finge haber verificado", async () => {
    const file = await unitFor("typescript", SRC_GRUPO, FILE);
    const h = parameterObject.build(lplFinding(FILE, 2, 4, "alpha", 6), null, ctxFor(file));
    expect(h!.state).toBe("ausente");
    expect(h!.checks.find((c) => c.role === "applied")?.why).toContain("no se pudo mirar");
  });
});

describe("Parameter Object · los seis lenguajes (la trampa de SELF_PREFIX, pagada)", () => {
  const CASOS: readonly (readonly [string, string, string])[] = [
    [
      "typescript", "src/x.ts",
      `
export function alpha(host: string, port: number, user: string, password: string, timeout: number, retries: number): number { return port; }
export function beta(host: string, port: number, user: string, password: string): number { return port; }
`,
    ],
    [
      "python", "src/x.py",
      `
def alpha(host, port, user, password, timeout, retries):
    return port

def beta(host, port, user, password):
    return port
`,
    ],
    [
      "ruby", "src/x.rb",
      `
def alpha(host, port, user, password, timeout, retries)
  port
end

def beta(host, port, user, password)
  port
end
`,
    ],
    [
      "java", "src/X.java",
      `
class X {
  int alpha(String host, int port, String user, String password, int timeout, int retries) { return port; }
  int beta(String host, int port, String user, String password) { return port; }
}
`,
    ],
    [
      "go", "src/x.go",
      `
package main

func Alpha(host string, port int, user string, password string, timeout int, retries int) int { return port }

func Beta(host string, port int, user string, password string) int { return port }
`,
    ],
    [
      "csharp", "src/X.cs",
      `
class X {
  int Alpha(string host, int port, string user, string password, int timeout, int retries) { return port; }
  int Beta(string host, int port, string user, string password) { return port; }
}
`,
    ],
  ];

  for (const [language, path, source] of CASOS) {
    it(`${language}: el grupo que viaja a dos firmas del archivo dispara`, async () => {
      const file = await unitFor(language, source, path);
      const fn = file.functions.find((f) => (f.name ?? "").toLowerCase() === "alpha");
      expect(fn, `el fixture de ${language} tiene que producir la función anclada`).toBeDefined();
      const h = parameterObject.build(lplFinding(path, fn!.startLine, fn!.endLine, fn!.name!, 6, language), null, ctxFor(file));
      expect(h, `${language} quedó mudo`).not.toBeNull();
      expect(h!.checks.find((c) => c.role === "required")?.why).toContain("host");
    });
  }
});

describe("Parameter Object · los límites declarados", () => {
  it("10. la desestructuración no fabrica un grupo parcial — mismo criterio que data-clump.ts", async () => {
    const SRC_DESTR = `
export function alpha({ host, port }: any, user: string, password: string, timeout: number, retries: number, extra: number): number { return 1; }
export function beta(host: string, port: number, user: string, password: string): number { return port; }
`;
    const file = await unitFor("typescript", SRC_DESTR, FILE);
    const h = parameterObject.build(lplFinding(FILE, 2, 2, "alpha", 6), null, ctxFor(file));
    expect(h).toBeNull();
  });

  it("un grupo de 2 nombres compartidos no alcanza — el piso es el `minGroupSize` del propio ancla (3)", async () => {
    const SRC_DOS = `
export function alpha(host: string, port: number, aa: string, bb: string, cc: number, dd: number): number { return port; }
export function beta(host: string, port: number, zz: string): number { return port; }
`;
    const file = await unitFor("typescript", SRC_DOS, FILE);
    const h = parameterObject.build(lplFinding(FILE, 2, 2, "alpha", 6), null, ctxFor(file));
    expect(h).toBeNull();
  });
});
