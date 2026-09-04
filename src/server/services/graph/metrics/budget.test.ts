/**
 * Test de `budget.ts` — LOS DOS ROLES DE UN PRESUPUESTO, Y POR QUÉ NO SON EL MISMO.
 *
 * Este archivo nace en la Ola AI (frente AI1) con el defecto que costó la
 * reproducibilidad del analizador: el MISMO helper de reloj de pared se usaba
 * para dos cosas incompatibles.
 *
 *  - CEDER EL EVENT LOOP (`detect/run.ts`): agotarse es correcto y no cambia
 *    NADA de la salida — se cede y se sigue por donde se iba.
 *  - ABANDONAR UN CÁLCULO (`GraphMetric.compute`): agotarse DESCARTA el
 *    resultado, y sus llamadores lo degradan a "sin hallazgos". Si la
 *    condición es un reloj, el CONTENIDO de la salida depende de la carga de
 *    la máquina.
 *
 * Los tests de acá fijan esa distinción para que no se pueda volver atrás sin
 * romper algo.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createBudget, createComputeBudget, DEFAULT_METRIC_BUDGET_MS } from "./budget.js";

/** Quema CPU de forma síncrona durante al menos `ms` — un `await` no sirve:
 *  lo que se quiere probar es que un cálculo SÍNCRONO largo no cambia de
 *  respuesta, y un `sleep` cedería el event loop, que es justo lo contrario. */
function quemar(ms: number): void {
  const hasta = performance.now() + ms;
  // eslint-disable-next-line no-empty
  while (performance.now() < hasta) {}
}

describe("budget — el presupuesto de TAJADA (`createBudget`) SE AGOTA POR RELOJ", () => {
  it("recién creado no está agotado", () => {
    expect(createBudget().expired()).toBe(false);
  });

  it("después de quemar más que su techo, está agotado — es un reloj de pared y así debe ser", () => {
    const b = createBudget();
    quemar(DEFAULT_METRIC_BUDGET_MS + 5);
    expect(b.expired()).toBe(true);
  });

  it("su techo es el declarado, no un número suelto", () => {
    expect(createBudget().maxMs).toBe(DEFAULT_METRIC_BUDGET_MS);
    expect(DEFAULT_METRIC_BUDGET_MS).toBeGreaterThan(0);
  });
});

describe("budget — el presupuesto de CÁLCULO (`createComputeBudget`) NO ES UN RELOJ", () => {
  it("nunca se agota, por más que se queme mucho más que el techo por tajada", () => {
    const b = createComputeBudget();
    expect(b.expired()).toBe(false);
    quemar(DEFAULT_METRIC_BUDGET_MS * 3);
    expect(b.expired()).toBe(false);
  });

  it("dos presupuestos de cálculo dan la MISMA respuesta en cualquier momento — de ahí sale el determinismo", () => {
    const a = createComputeBudget();
    quemar(DEFAULT_METRIC_BUDGET_MS + 5);
    const b = createComputeBudget();
    expect(a.expired()).toBe(b.expired());
    expect(a.expired()).toBe(false);
  });
});

/**
 * LA COMPUERTA. No prueba una función: prueba una INVARIANTE del árbol, y es
 * la única forma de que el defecto no vuelva por un llamador nuevo.
 *
 * INTENCIÓN: "ningún cálculo que ABANDONE su resultado puede tener un reloj de
 * pared como condición". Se expresa como: en producción, el único archivo que
 * puede llamar `createBudget()` es el que lo usa para CEDER el event loop.
 */
describe("budget — compuerta: quién puede usar el reloj de pared", () => {
  const AQUI = path.dirname(fileURLToPath(import.meta.url));
  const SERVICES = path.resolve(AQUI, "../..");
  /** El único uso legítimo: `run.ts` cede el event loop y sigue por donde iba. */
  const PERMITIDOS = new Set([path.join("detect", "run.ts")]);

  function archivosTs(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const abs = path.join(dir, entry);
      if (statSync(abs).isDirectory()) {
        out.push(...archivosTs(abs));
        continue;
      }
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
      out.push(abs);
    }
    return out;
  }

  it("sólo `detect/run.ts` llama `createBudget()` — todo lo demás usa `createComputeBudget()`", () => {
    const infractores: string[] = [];
    for (const abs of archivosTs(SERVICES)) {
      const rel = path.relative(SERVICES, abs);
      if (rel === path.join("graph", "metrics", "budget.ts")) continue; // el propio módulo
      const src = readFileSync(abs, "utf8");
      // Sólo llamadas reales, no menciones en comentarios: se exige el paréntesis
      // de llamada pegado y que NO esté precedido por `createCompute`.
      // Se descartan las LÍNEAS que son enteramente comentario (`*` de un bloque
      // o `//` de línea): el defecto se explica por escrito en varios de estos
      // archivos y nombrar el helper en una explicación no es usarlo.
      const sinComentarios = src.replace(/^[ \t]*(?:\*|\/\/).*$/gm, "");
      const llama = /(?<!Compute)createBudget\s*\(/.test(sinComentarios);
      if (llama && !PERMITIDOS.has(rel)) infractores.push(rel);
    }
    expect(infractores, `usan el reloj de pared para decidir CONTENIDO: ${infractores.join(", ")}`).toEqual([]);
  });
});
