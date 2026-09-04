/**
 * LA UNIFICACIÓN — Ola N, frente U1: los cinco tests que el frente tiene que
 * dejar. El segundo (`EL TEST DE LA OLA`) es el que decide si la unificación
 * existe: un detector `intra-*` que pide el grafo tiene que recibir el ÁRBOL
 * VIVO y el GRAFO NO NULO **al mismo tiempo**, cosa que antes de esta ola era
 * imposible por construcción (los `intra-*` corren antes de que el grafo
 * exista; cuando existe, el árbol ya se liberó).
 *
 * Todo lo de acá corre de PUNTA A PUNTA por `analyzeRepo` sobre un árbol de
 * fixture en `os.tmpdir()` — con el `web-tree-sitter` real y el grafo real, no
 * con dobles. Un test con dobles no podría distinguir "el grafo llegó" de "el
 * grafo se construyó".
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyzeRepo, dosPasadasHabilitado } from "./code-analyzer.js";
import { registerExtraDetector, runDetectorSet, type DetectorRunInput } from "./detect/run.js";
import { pisoDeclarado } from "./detect/thresholds.js";
import type { CodeGraph } from "./graph/types.js";
import type {
  FileUnit,
  FunctionUnit,
  IntraFunctionDetector,
  RawFinding,
  RepoUnit,
} from "./detect/types.js";

/* ── fixture ────────────────────────────────────────────────────────────── */

/**
 * Dos archivos que se referencian entre sí: hace falta que el grafo tenga
 * NODOS y ARISTAS de verdad, porque el test de la ola afirma que el detector
 * los ve. Un repo de un solo archivo daría un grafo trivialmente vacío y el
 * test pasaría sin probar nada.
 */
const FIXTURE: Record<string, string> = {
  "ayuda.ts": `
export function sumar(a: number, b: number): number {
  return a + b;
}

export function restar(a: number, b: number): number {
  return a - b;
}
`,
  "principal.ts": `
import { sumar, restar } from "./ayuda.js";

export function combinar(a: number, b: number): number {
  return sumar(a, b) + restar(a, b);
}
`,
};

async function makeFixture(files: Record<string, string> = FIXTURE): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ck-u1-")));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
  }
  return root;
}

/* ── los detectores sonda ───────────────────────────────────────────────── */

/** Lo que una sonda anota de CADA unidad que visita. */
interface Visita {
  file: string;
  fn: string | null;
  /** ¿El nodo AST estaba vivo y legible en ese momento? */
  arbolVivo: boolean;
  /** ¿`ctx.graph` era no-nulo en ese mismo momento? */
  conGrafo: boolean;
  nodosDelGrafo: number;
  aristasDelGrafo: number;
  /** ¿`ctx.graphIndex()` devolvió un índice usable? */
  indiceUsable: boolean;
}

function sonda(id: string, needsGraph: boolean, visitas: Visita[]): IntraFunctionDetector {
  return {
    id,
    scope: "intra-function",
    // Un `kind` real del catálogo: la sonda no emite nada, pero el tipo lo pide.
    kind: "long-function",
    title: id,
    needs: [],
    ...(needsGraph ? { needsGraph: true } : {}),
    thresholds: { min: pisoDeclarado(1, { rationale: "sonda de test" }) },
    run(fn, ctx) {
      const index = ctx.graphIndex?.() ?? null;
      visitas.push({
        file: fn.file,
        fn: fn.name,
        // El árbol VIVO: `fn.node.text` sólo devuelve fuente si el `Tree`
        // nativo detrás sigue sin liberar. Sobre un árbol ya borrado esto no
        // devuelve el cuerpo de la función.
        arbolVivo: typeof fn.node.text === "string" && fn.node.text.length > 0,
        conGrafo: (ctx.graph ?? null) !== null,
        nodosDelGrafo: ctx.graph?.nodes.length ?? 0,
        aristasDelGrafo: ctx.graph?.edges.length ?? 0,
        indiceUsable: index !== null && index.nodeById(`file:${fn.file}`) !== null,
      });
      return [];
    },
  };
}

/**
 * Una sonda que SÍ emite un hallazgo por unidad — para contar duplicados de
 * punta a punta, en la salida real del análisis.
 *
 * TIENE QUE LLAMARSE COMO UN DETECTOR REGISTRADO, y el `id` no es libre:
 * `detect/impact.ts#impactOf` LANZA para un `detectorId` sin tier declarado
 * (a propósito — "un detector sin tier no debe puntuar como si tuviera uno
 * promedio"), y el ranking de `crossAnalyze` lo llama para todo hallazgo. Así
 * que la sonda toma prestado el id de un detector `intra-function` real
 * (`many-returns` — OLA AW, guardián: era `unused-variable`, desregistrado
 * esta ola, ver `registries.test.ts#DELIBERATELY_UNREGISTERED`); los tests
 * que la usan miden un DELTA contra una corrida sin sonda, nunca un
 * absoluto, justamente para no confundir sus filas con las del detector
 * real.
 */
const ID_PRESTADO = "many-returns";

function sondaQueEmite(id: string, needsGraph: boolean): IntraFunctionDetector {
  return {
    id,
    scope: "intra-function",
    kind: "many-returns",
    title: id,
    needs: [],
    ...(needsGraph ? { needsGraph: true } : {}),
    thresholds: { min: pisoDeclarado(1, { rationale: "sonda de test" }) },
    run(fn, ctx): readonly RawFinding[] {
      return [
        {
          title: id,
          detail: `${fn.file}:${fn.name ?? "?"}`,
          trigger: [{ label: "x", value: 1, threshold: ctx.threshold("min") }],
          locations: [{ file: fn.file, startLine: fn.startLine, endLine: fn.endLine, role: "sitio" }],
          severity: 50,
          advice: { primary: { name: "n", kind: "refactorizacion", why: "w", source: "s" } },
        },
      ];
    },
  };
}

/* ── ciclo de vida del entorno ──────────────────────────────────────────── */

let previo: string | undefined;
const desregistrar: Array<() => void> = [];

beforeEach(() => {
  previo = process.env.CK_ANALISIS_DOS_PASADAS;
  delete process.env.CK_ANALISIS_DOS_PASADAS;
});

afterEach(() => {
  if (previo === undefined) delete process.env.CK_ANALISIS_DOS_PASADAS;
  else process.env.CK_ANALISIS_DOS_PASADAS = previo;
  while (desregistrar.length > 0) desregistrar.pop()!();
});

function registrar(d: IntraFunctionDetector): void {
  desregistrar.push(registerExtraDetector(d));
}

/* ── 1. sin opt-in: donde corre hoy, sin grafo ──────────────────────────── */

describe("U1 — pasada 1: el detector que NO pide grafo", () => {
  it("corre igual que hoy y recibe `ctx.graph` nulo, con el árbol vivo", async () => {
    const visitas: Visita[] = [];
    registrar(sonda("u1-sonda-sin-grafo", false, visitas));

    const dir = await makeFixture();
    await analyzeRepo({ dir, repoName: "u1" });

    expect(visitas.length).toBeGreaterThan(0);
    for (const v of visitas) {
      expect(v.arbolVivo).toBe(true);
      expect(v.conGrafo).toBe(false);
      expect(v.indiceUsable).toBe(false);
    }
    // Y visitó las funciones de los DOS archivos: la pasada 1 no se acota.
    expect(new Set(visitas.map((v) => v.file))).toEqual(new Set(["ayuda.ts", "principal.ts"]));
  });
});

/* ── 2. EL TEST DE LA OLA ───────────────────────────────────────────────── */

describe("U1 — pasada 2: el detector que SÍ pide grafo", () => {
  it("EL TEST DE LA OLA: recibe ÁRBOL VIVO y GRAFO NO NULO a la vez", async () => {
    const visitas: Visita[] = [];
    registrar(sonda("u1-sonda-con-grafo", true, visitas));

    const dir = await makeFixture();
    await analyzeRepo({ dir, repoName: "u1" });

    expect(visitas.length).toBeGreaterThan(0);
    for (const v of visitas) {
      // Las dos afirmaciones, sobre la MISMA visita. Que las dos valgan a la
      // vez es exactamente lo que era imposible antes de esta ola.
      expect(v.arbolVivo).toBe(true);
      expect(v.conGrafo).toBe(true);
    }
    // El grafo no está vacío: tiene los nodos de los dos archivos y aristas
    // reales entre ellos. Sin esto el test pasaría con un `CodeGraph` inerte.
    const maxNodos = Math.max(...visitas.map((v) => v.nodosDelGrafo));
    const maxAristas = Math.max(...visitas.map((v) => v.aristasDelGrafo));
    expect(maxNodos).toBeGreaterThan(2);
    expect(maxAristas).toBeGreaterThan(0);
    // Y el índice de consulta responde por los archivos que el detector visita.
    expect(visitas.every((v) => v.indiceUsable)).toBe(true);
    expect(new Set(visitas.map((v) => v.file))).toEqual(new Set(["ayuda.ts", "principal.ts"]));
  });
});

/* ── 3. nadie corre dos veces ───────────────────────────────────────────── */

describe("U1 — un detector corre en UNA pasada, nunca en las dos", () => {
  it("la sonda con grafo visita cada función exactamente una vez", async () => {
    const visitas: Visita[] = [];
    registrar(sonda("u1-sonda-una-sola-vez", true, visitas));

    const dir = await makeFixture();
    await analyzeRepo({ dir, repoName: "u1" });

    const claves = visitas.map((v) => `${v.file}#${v.fn ?? "?"}`);
    expect(claves.length).toBe(new Set(claves).size);
  });

  it("la sonda sin grafo tampoco se duplica", async () => {
    const visitas: Visita[] = [];
    registrar(sonda("u1-sonda-sin-grafo-una-vez", false, visitas));

    const dir = await makeFixture();
    await analyzeRepo({ dir, repoName: "u1" });

    const claves = visitas.map((v) => `${v.file}#${v.fn ?? "?"}`);
    expect(claves.length).toBe(new Set(claves).size);
  });

  it("los hallazgos de una sonda que emite no se duplican (una fila por función), de punta a punta", async () => {
    const dir = await makeFixture();
    const base = await analyzeRepo({ dir, repoName: "u1", limits: { maxFindings: "unlimited" } });

    registrar(sondaQueEmite(ID_PRESTADO, true));
    const conSonda = await analyzeRepo({ dir, repoName: "u1", limits: { maxFindings: "unlimited" } });

    // 3 funciones en la fixture (sumar, restar, combinar), una fila cada una:
    // si la sonda corriera en las DOS pasadas serían 6. `findingsTotal` es la
    // población CRUDA (antes de agrupar y antes de cualquier corte), que es la
    // única cuenta donde un duplicado no se puede esconder detrás de un grupo.
    expect((conSonda.findingsTotal ?? 0) - (base.findingsTotal ?? 0)).toBe(3);
  });

  it("PARTICIÓN, a nivel runner: los dos valores de `intraPass` son complementarios y disjuntos", async () => {
    const conGrafo: Visita[] = [];
    const sinGrafo: Visita[] = [];
    const detectores = [sonda("u1-p-con", true, conGrafo), sonda("u1-p-sin", false, sinGrafo)];
    const base = (over: Partial<DetectorRunInput>): DetectorRunInput => ({
      repo: fakeRepo(),
      languages: new Map([["ruby", { capabilities: new Set(), sets: fakeSets() }]]),
      benchmarks: null,
      files: [fakeFile()],
      ...over,
    });

    const p1 = await runDetectorSet(detectores, base({ intraPass: "solo-sin-grafo" }));
    expect(p1.coverage.map((c) => c.detectorId)).toEqual(["u1-p-sin"]);
    expect(conGrafo.length).toBe(0);
    expect(sinGrafo.length).toBe(1);

    const p2 = await runDetectorSet(detectores, base({ intraPass: "solo-con-grafo" }));
    expect(p2.coverage.map((c) => c.detectorId)).toEqual(["u1-p-con"]);
    expect(conGrafo.length).toBe(1);
    expect(sinGrafo.length).toBe(1);

    // Sin `intraPass` (el default, y lo que ven todos los callers de antes de
    // esta ola) no hay partición: corren los dos.
    const p0 = await runDetectorSet(detectores, base({}));
    expect(p0.coverage.map((c) => c.detectorId).sort()).toEqual(["u1-p-con", "u1-p-sin"]);
  });
});

/* ── 4. el interruptor de vuelta atrás ──────────────────────────────────── */

describe("U1 — vuelta atrás (`CK_ANALISIS_DOS_PASADAS=0`)", () => {
  it("`dosPasadasHabilitado()` lee el interruptor en cada llamada", () => {
    expect(dosPasadasHabilitado()).toBe(true);
    for (const off of ["0", "off", "false", "no", "OFF", " 0 "]) {
      process.env.CK_ANALISIS_DOS_PASADAS = off;
      expect(dosPasadasHabilitado()).toBe(false);
    }
    process.env.CK_ANALISIS_DOS_PASADAS = "1";
    expect(dosPasadasHabilitado()).toBe(true);
  });

  it("con el interruptor puesto, un detector que pidió grafo corre en la pasada 1 SIN grafo — no se apaga", async () => {
    process.env.CK_ANALISIS_DOS_PASADAS = "0";
    const visitas: Visita[] = [];
    registrar(sonda("u1-sonda-vuelta-atras", true, visitas));

    const dir = await makeFixture();
    await analyzeRepo({ dir, repoName: "u1" });

    // Corrió (no está escondido) y vio lo mismo que veía antes de la ola:
    // árbol vivo, sin grafo.
    expect(visitas.length).toBe(3);
    for (const v of visitas) {
      expect(v.arbolVivo).toBe(true);
      expect(v.conGrafo).toBe(false);
    }
    // Y una sola vez cada función: el interruptor no reintroduce duplicados.
    const claves = visitas.map((v) => `${v.file}#${v.fn ?? "?"}`);
    expect(claves.length).toBe(new Set(claves).size);
  });

  it("con el interruptor puesto, la sonda que emite da EXACTAMENTE los mismos hallazgos que con dos pasadas", async () => {
    const dir = await makeFixture();

    registrar(sondaQueEmite(ID_PRESTADO, true));
    const conDosPasadas = await analyzeRepo({ dir, repoName: "u1", limits: { maxFindings: "unlimited" } });

    process.env.CK_ANALISIS_DOS_PASADAS = "0";
    const conUnaPasada = await analyzeRepo({ dir, repoName: "u1", limits: { maxFindings: "unlimited" } });

    expect(conUnaPasada.findingsTotal).toBe(conDosPasadas.findingsTotal);
    expect(conUnaPasada.totalByKind).toEqual(conDosPasadas.totalByKind);
  });
});

/* ── 5. cambio de comportamiento CERO mientras nadie opte ───────────────── */

describe("U1 — sin ningún detector que opte, las dos pasadas dan lo mismo que una", () => {
  it("mismo conjunto de hallazgos, mismo censo por kind, con y sin dos pasadas", async () => {
    const dir = await makeFixture();

    const conDos = await analyzeRepo({ dir, repoName: "u1", limits: { maxFindings: "unlimited" } });

    process.env.CK_ANALISIS_DOS_PASADAS = "0";
    const conUna = await analyzeRepo({ dir, repoName: "u1", limits: { maxFindings: "unlimited" } });

    expect(conDos.findingsTotal).toBe(conUna.findingsTotal);
    expect(conDos.groupsTotal).toBe(conUna.groupsTotal);
    expect(conDos.totalByKind).toEqual(conUna.totalByKind);
    expect(conDos.findings.map((f) => f.id)).toEqual(conUna.findings.map((f) => f.id));
    // ARREGLO (Ola N, frente B1b, tocado porque lo rompí — ver el informe de
    // la tarea): el título de este describe ("sin ningún detector que
    // opte") ya no describe el registro real de `DETECTORS` — B1b hizo que
    // `unused-variable`/`argument-mutation` opten por el grafo SIEMPRE, no
    // sólo en un test. Eso mueve dónde cae cada entrada de `coverage` en el
    // arreglo (los detectores con `needsGraph` corren en la pasada 2 y se
    // agregan DESPUÉS, nunca en la posición que tenían en una sola pasada),
    // pero el CONTENIDO — qué detector, en qué lenguaje, con qué status —
    // es idéntico: eso es lo que este test realmente afirma, nunca prometió
    // el ORDEN del arreglo. Comparar por conjunto (ordenado por una clave
    // estable) en vez de por posición dice lo mismo sin depender de una
    // premisa que un detector real ya invalidó.
    const byDetectorAndLanguage = (a: NonNullable<typeof conDos.coverage>[number], b: NonNullable<typeof conDos.coverage>[number]): number =>
      `${a.detectorId} ${a.language ?? ""}`.localeCompare(`${b.detectorId} ${b.language ?? ""}`);
    expect([...(conDos.coverage ?? [])].sort(byDetectorAndLanguage)).toEqual([...(conUna.coverage ?? [])].sort(byDetectorAndLanguage));
  });

  it("sobre un repo de verdad (el `src/` de este proyecto no; una fixture con varias formas) el censo por kind no se mueve", async () => {
    const dir = await makeFixture({
      ...FIXTURE,
      "largo.ts": `
export function largo(a: number, b: number, c: number, d: number, e: number, f: number, g: number): number {
  let total = 0;
  if (a > 0) { total += a; } else if (b > 0) { total += b; } else if (c > 0) { total += c; }
  else if (d > 0) { total += d; } else if (e > 0) { total += e; } else { total += f + g; }
  return total;
}
`,
    });

    const conDos = await analyzeRepo({ dir, repoName: "u1", limits: { maxFindings: "unlimited" } });
    expect(conDos.findingsTotal).toBeGreaterThan(0);

    process.env.CK_ANALISIS_DOS_PASADAS = "0";
    const conUna = await analyzeRepo({ dir, repoName: "u1", limits: { maxFindings: "unlimited" } });

    expect(conDos.totalByKind).toEqual(conUna.totalByKind);
    expect(conDos.findings.map((f) => f.id)).toEqual(conUna.findings.map((f) => f.id));
  });
});

/* ── ayudantes del test de partición (unidades falsas, sin parsear) ─────── */

function fakeSets(): FileUnit["sets"] {
  return {
    functionNodes: new Set(),
    classNodes: new Set(),
    branchNodes: new Set(),
    chainNodes: new Set(),
    nestingNodes: new Set(),
    cloneNodes: new Set(),
    constructorNodes: new Set(),
    exceptionNodes: new Set(),
    switchContainerNodes: new Set(),
  };
}

function fakeNode(): FunctionUnit["node"] {
  return {
    type: "fake",
    isNamed: true,
    childCount: 0,
    child: () => null,
    childForFieldName: () => null,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 1, column: 0 },
    text: "",
  };
}

function fakeFile(): FileUnit {
  const sets = fakeSets();
  return {
    path: "a.rb",
    language: "ruby",
    lines: 10,
    root: fakeNode(),
    sets,
    functions: [
      {
        file: "a.rb",
        language: "ruby",
        name: "foo",
        startLine: 1,
        endLine: 10,
        symbolPath: ["foo"],
        node: fakeNode(),
        sets,
        metrics: {
          branches: 0,
          chain: 0,
          cognitive: 0,
          maxNesting: 0,
          parameters: 0,
          chainHasNullCheck: false,
          chainInstantiates: false,
          className: null,
          isConstructor: false,
          isFactoryLike: false,
        },
      },
    ],
  };
}

function fakeRepo(): RepoUnit {
  const graph: CodeGraph = {
    nodes: [],
    edges: [],
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
  return { repoName: "r", files: [], functions: [], clones: [], graph };
}
