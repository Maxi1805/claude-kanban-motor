/**
 * OLA V, FRENTE V1 — EL TEST DE LA OLA: una hipótesis anclada en un hallazgo
 * `intra-*` tiene que poder ver el GRAFO DEL REPO.
 *
 * QUÉ INTENCIÓN VERIFICA (no "qué nodos mira"): *"lo que el producto AFIRMA
 * sobre un patrón tiene que estar juzgado con toda la evidencia que esta
 * corrida tiene, no sólo con la del archivo donde cayó el hallazgo"*. Hasta
 * esta ola eso era imposible por construcción para toda hipótesis anclada en
 * un `Finding` `intra-function`/`intra-file` — Strategy, Chain of
 * Responsibility, Decorator, Composite, State, Builder, Factory Method,
 * Observer: `builder.build` corría dentro de `analyzeFile`, donde el grafo
 * del repo todavía no existe, y sus checks estructurales se publicaban con la
 * evidencia literal *"Sin grafo: no evaluado"*. El producto decía "no está" y
 * lo que quería decir era "no miré".
 *
 * Por eso este test corre de punta a punta por `analyzeRepo` sobre un árbol
 * real en `os.tmpdir()`, con `web-tree-sitter` real y el grafo real — igual
 * que `u1-unificacion.test.ts` para los detectores, y por la misma razón: un
 * test con dobles no distingue "el grafo llegó" de "el grafo se construyó".
 *
 * El A/B es el interruptor `CK_HIPOTESIS_CON_GRAFO`, que apaga SÓLO esta
 * pasada (ver `code-analyzer.ts#hipotesisConGrafoHabilitado`): las dos ramas
 * analizan EL MISMO fixture con EL MISMO código, y lo único que cambia es si
 * la pasada de grafo corre.
 *
 * OLA AY · GUARDIÁN DE CIERRE — EL ANCLA CAMBIÓ, EL MECANISMO NO. El fixture
 * original disparaba `self-referential-member` para colgar la ruta de grafo
 * de `Composite`. El frente AY5 retiró esa ancla de `Composite` (V = 0 sobre
 * población entera juzgada, costo cero — `ola-ay/informes/AY5.md` §3): el
 * detector `self-referential-member` SIGUE registrado y emitiendo nivel 1
 * (verificado — sigue apareciendo como `Finding`), pero desde entonces NINGUNA
 * hipótesis lo ancla, así que este archivo dejó de tener algo que probar con
 * ese fixture — no porque el mecanismo que este test cubre se haya roto, sino
 * porque el ancla que usaba para ejercitarlo quedó huérfana. El fixture pasa
 * a disparar `many-returns` (ancla VIVA de `Chain of Responsibility`, sin
 * tocar) sobre el check `eslabón único / interfaz-por-grafo`
 * (`chain-of-responsibility.ts`, discriminador de la forma "un solo
 * eslabón"), que tiene la misma propiedad que el original: `graph === null`
 * ⇒ evidencia literal `"Sin grafo en esta corrida…"`; con grafo real, otra
 * evidencia, nunca esa cadena. Verificado end-to-end contra el analizador
 * real, no supuesto — ver `scratchpad-guardian-ay/probe-v1e.mts`.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CodeAnalysis } from "../../shared/types.js";
import { analyzeRepo } from "./code-analyzer.js";

/**
 * Una función con `>=3` guardas cortas de manejo diverso —el ancla
 * `many-returns`, `intra-function`— y un archivo que la usa: hacen falta DOS
 * archivos para que el grafo tenga nodos y aristas de verdad; con uno solo el
 * grafo sería trivial y el test pasaría sin probar nada, mismo cuidado que
 * documenta el fixture de `u1-unificacion.test.ts`.
 *
 * OLA AY · GUARDIÁN DE CIERRE — reemplaza el fixture de `self-referential-member`
 * (ver el docstring del módulo, arriba, para la razón completa: esa ancla dejó
 * de estar registrada por `Composite` y el fixture viejo quedó sin ninguna
 * hipótesis que colgarle). `handle` dispara DOS cosas a la vez, verificadas
 * contra el analizador real:
 *
 *   1. `many-returns` (nivel 1): 3 guardas de preámbulo (excluidas del conteo,
 *      `many-returns.ts`) + un `while` que cierra el prefijo + 4 retornos
 *      contados después ⇒ dispara con el umbral SonarSource S1142 (>3).
 *   2. `Chain of Responsibility` (nivel 2, `required`): las 3 guardas
 *      invocan >=2 mensajes DISTINTOS (`rejectMissingA`/`rejectMissingB`) ⇒
 *      "candidato real" — y su discriminador "un solo eslabón" es la MISMA
 *      forma que tenía Composite: `graph === null` ⇒ evidencia literal
 *      "Sin grafo en esta corrida…"; con grafo real, otra evidencia, nunca
 *      esa cadena (`chain-of-responsibility.ts#eslabonUnicoConfirmadoPorGrafo`,
 *      o el nombre que tenga ese check hoy — buscar por el texto citado
 *      arriba si el nombre cambió).
 */
const FIXTURE: Record<string, string> = {
  "handler.ts": `
export class Handler {
  other: { rejectMissingA(req: any): unknown } = { rejectMissingA: (req: any) => req };
  handle(req: any): unknown {
    if (!req.a) return this.other.rejectMissingA(req);
    if (!req.b) return rejectMissingB(req);
    if (!req.c) return null;
    while (req.busy) {
      if (req.d) return handleD(req);
      if (req.e) return handleE(req);
      req.busy = false;
    }
    if (req.f) return handleF(req);
    return process(req);
  }
}
function rejectMissingB(req: unknown): unknown { return req; }
function handleD(req: unknown): unknown { return req; }
function handleE(req: unknown): unknown { return req; }
function handleF(req: unknown): unknown { return req; }
function process(req: unknown): unknown { return req; }
`,
  "uso.ts": `
import { Handler } from "./handler.js";

export function run(h: Handler, req: unknown): unknown {
  return h.handle(req);
}
`,
};

async function makeFixture(): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ck-v1-")));
  for (const [rel, contents] of Object.entries(FIXTURE)) {
    await fs.writeFile(path.join(root, rel), contents);
  }
  return root;
}

const previo = process.env.CK_HIPOTESIS_CON_GRAFO;
afterEach(() => {
  if (previo === undefined) delete process.env.CK_HIPOTESIS_CON_GRAFO;
  else process.env.CK_HIPOTESIS_CON_GRAFO = previo;
});

async function analizar(dir: string, conGrafo: boolean): Promise<CodeAnalysis> {
  process.env.CK_HIPOTESIS_CON_GRAFO = conGrafo ? "1" : "0";
  return analyzeRepo({ dir, repoName: "v1", limits: { maxFindings: "unlimited" } });
}

/** Toda la evidencia publicada de todas las hipótesis, aplanada — es lo que
 *  el producto MUESTRA, no un intermedio interno. */
function evidencias(a: CodeAnalysis): string[] {
  const out: string[] = [];
  for (const f of a.findings) {
    for (const h of f.hypotheses ?? []) {
      for (const c of [...(h.checks ?? []), ...(h.discriminators ?? [])]) {
        out.push(`${h.pattern}|${c.label}|${c.passed}|${c.why}`);
      }
    }
  }
  return out.sort();
}

function porKind(a: CodeAnalysis): Record<string, number> {
  const m: Record<string, number> = {};
  for (const f of a.findings) m[f.kind] = (m[f.kind] ?? 0) + 1;
  return m;
}

describe("la pasada de grafo de las hipótesis (Ola V, frente V1)", () => {
  it("el ancla `intra-function` y su hipótesis existen en el fixture — sin ellas no hay nada que probar", async () => {
    const dir = await makeFixture();
    const a = await analizar(dir, true);
    // OLA AY (guardián): `many-returns`, no `self-referential-member` — ver el
    // docstring del `FIXTURE` de arriba para la razón completa del cambio.
    expect(a.findings.some((f) => f.kind === "many-returns")).toBe(true);
    expect(a.findings.some((f) => (f.hypotheses ?? []).length > 0)).toBe(true);
  });

  it("EL TEST DE LA OLA: sin la pasada, la evidencia estructural se publica como 'sin grafo'; con la pasada, se evalúa de verdad", async () => {
    const dir = await makeFixture();
    const sin = evidencias(await analizar(dir, false));
    const con = evidencias(await analizar(dir, true));

    // Antes: el `build()` de producción de una hipótesis anclada en un
    // hallazgo `intra-*` recibe `graph === null` SIEMPRE, y sus checks
    // estructurales lo dicen con todas las letras.
    expect(sin.some((e) => /sin grafo/i.test(e))).toBe(true);

    // Después: ningún check publica ya esa evidencia — todos pudieron mirar.
    expect(con.filter((e) => /sin grafo/i.test(e))).toEqual([]);

    // Y la evidencia publicada cambió: no es que "el grafo llegó y no cambió
    // nada", es que el producto afirma otra cosa.
    expect(con).not.toEqual(sin);
  });

  it("el NIVEL 1 no se mueve: la pasada cuelga hipótesis, nunca produce ni retira un hallazgo", async () => {
    const dir = await makeFixture();
    const sin = await analizar(dir, false);
    const con = await analizar(dir, true);
    expect(porKind(con)).toEqual(porKind(sin));
    expect(con.findings.length).toBe(sin.findings.length);
  });

  it("`CK_ANALISIS_DOS_PASADAS=0` apaga también esta pasada — la promesa de la Ola N sigue entera", async () => {
    const dir = await makeFixture();
    const previoDos = process.env.CK_ANALISIS_DOS_PASADAS;
    try {
      process.env.CK_ANALISIS_DOS_PASADAS = "0";
      const conInterruptorGeneral = evidencias(await analizar(dir, true));
      expect(conInterruptorGeneral.some((e) => /sin grafo/i.test(e))).toBe(true);
    } finally {
      if (previoDos === undefined) delete process.env.CK_ANALISIS_DOS_PASADAS;
      else process.env.CK_ANALISIS_DOS_PASADAS = previoDos;
    }
  });
});
