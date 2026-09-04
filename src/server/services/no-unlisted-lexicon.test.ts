/**
 * El inventario de constantes como test — PLAN.md §7 / Ola 0.
 *
 * La crítica de genericidad encontró que el inventario anterior ("42 números
 * + 9 listas") se había hecho contando a mano, y que un conteo a mano se
 * queda desactualizado en cuanto alguien agrega una constante sin saberlo.
 * Este test reemplaza esa tabla: escanea él mismo los archivos de la capa
 * de análisis (`ANALYSIS_FILES` abajo), encuentra toda constante SCREAMING_CASE con forma de lista
 * (regex literal / `new Set(` / array / objeto) o de umbral numérico, y
 * falla si aparece una que no esté en `lexicon-inventory.json` con su
 * clasificación, su fase de retiro prevista y su reemplazo — o si el
 * inventario tiene una entrada que ya no existe en el código (inventario
 * podado en ambas direcciones, no sólo de alta).
 *
 * El escaneo es deliberadamente MÁS ancho que el grep de una sola línea
 * citado en PLAN.md §7 (`^\s*const NAME = *(/|new Set|\[)`), que tiene dos
 * agujeros reales medidos al construir este test:
 *
 *   1. No reconoce `export const` — así quedó `CONSTRUCTOR_NAMES` tras F1
 *      (antes 3 copias `const` sin exportar, ahora 1 `export const`): el
 *      grep de una sola línea dejaría de verla sin que nadie lo notara.
 *   2. No reconoce asignaciones que cruzan la línea del `=` (p.ej.
 *      `const LAZY_SINGLETON_ACCESSOR =\n  /.../`) — invisible al grep,
 *      visible al lector. Se encontraron 3 constantes reales así:
 *      `LAZY_SINGLETON_ACCESSOR`, el segundo `RE` de
 *      `pattern-structural.ts` (línea 360) y `RETURN_NEW`.
 *
 * Se agregó además una tercera forma que el conteo original de PLAN.md §7 no
 * contemplaba: el objeto `{ ... }` (`DEFAULT_ANALYZE_LIMITS`, `POPULARITY`,
 * `SRC`) — sin esto, envolver una lista o un umbral en un objeto sería una
 * forma trivial de esquivar el inventario.
 *
 * Deliberadamente NO reconoce `new RegExp(...)` construido en tiempo de
 * ejecución a partir de un parámetro (patrón que existía en la vía vieja
 * retirada, `pattern-structural.ts`, función `findLeak`, variable local
 * `CONSTRUCT`): eso no es una lista hardcodeada, es un patrón derivado del
 * propio nombre de la clase que se está mirando — no hay nada que
 * inventariar ahí.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname);

/**
 * Los archivos de la capa de análisis — PLAN.md §7, "el grep exhaustivo".
 * F-RETIRO-VÍA-VIEJA: bajó de 7 a 3 — `pattern-structural.ts`/
 * `pattern-wrapping.ts`/`pattern-behavioral.ts`/`code-opportunities.ts` se
 * borraron enteros (vía vieja de detección por vocabulario/forma, retirada
 * por decisión del usuario); `lexicon-inventory.json` se podó de sus 46
 * entradas en la misma tarea.
 */
const ANALYSIS_FILES = ["code-analyzer.ts", "code-grammar.ts", "code-suggest.ts"] as const;

type Shape = "regex" | "set" | "array" | "object" | "number";

interface FoundConst {
  file: string;
  line: number;
  name: string;
  shape: Shape;
}

const KNOWN_CLASSIFICATIONS = new Set([
  "product-config",
  "grammar-node-name",
  "domain-lexicon",
  "threshold-cited",
  "threshold-uncited",
  "engineering-budget",
]);

interface InventoryEntry {
  file: string;
  line: number;
  name: string;
  shape: Shape;
  classification: string;
  retirementPhase: string;
  citation?: string;
  note?: string;
}

interface Inventory {
  version: number;
  scannedFiles: readonly string[];
  totalEntries: number;
  countsByClassification: Record<string, number>;
  entries: InventoryEntry[];
}

/**
 * Multilínea y consciente de `export`: ve más allá del grep de una sola
 * línea de PLAN.md §7 — ver docstring del archivo. `[\s\S]{0,4000}?` porque
 * algunas regex de léxico de dominio superan largo los 60-100 caracteres
 * (p.ej. `LISTENER_FIELD_NAME`) y el punto es capturar sólo el ARRANQUE del
 * valor para clasificar la forma, no el valor completo.
 */
const CONST_RE =
  /^[ \t]*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=\n]*)?=\s*([\s\S]{0,4000}?)[;\n]/gm;

function scanFile(fileName: string): FoundConst[] {
  const text = fs.readFileSync(path.join(ROOT, fileName), "utf8");
  const found: FoundConst[] = [];
  let m: RegExpExecArray | null;
  CONST_RE.lastIndex = 0;
  while ((m = CONST_RE.exec(text))) {
    const name = m[1];
    const valueStart = m[2].trimStart();
    const line = text.slice(0, m.index).split("\n").length;
    let shape: Shape | null = null;
    if (valueStart.startsWith("/")) shape = "regex";
    else if (valueStart.startsWith("new Set(")) shape = "set";
    else if (valueStart.startsWith("[")) shape = "array";
    else if (valueStart.startsWith("{")) shape = "object";
    else if (/^-?\d/.test(valueStart)) shape = "number";
    if (shape) found.push({ file: fileName, line, name, shape });
  }
  return found;
}

function scanAll(): FoundConst[] {
  return ANALYSIS_FILES.flatMap(scanFile);
}

function loadInventory(): Inventory {
  const raw = fs.readFileSync(path.join(ROOT, "lexicon-inventory.json"), "utf8");
  return JSON.parse(raw) as Inventory;
}

function key(e: { file: string; line: number; name: string }): string {
  return `${e.file}:${e.line}:${e.name}`;
}

describe("no-unlisted-lexicon", () => {
  it("encuentra al menos una constante en cada uno de los 7 archivos (el escaneo no está roto)", () => {
    for (const file of ANALYSIS_FILES) {
      expect(scanFile(file).length, `${file} no aportó ninguna constante — ¿cambió el formato?`).toBeGreaterThan(0);
    }
  });

  it("toda constante forma-lista/forma-umbral del código está en el inventario, con la misma forma", () => {
    const found = scanAll();
    const inventory = loadInventory();
    const byKey = new Map(inventory.entries.map((e) => [key(e), e]));

    const missing: string[] = [];
    const shapeMismatch: string[] = [];
    for (const f of found) {
      const inv = byKey.get(key(f));
      if (!inv) {
        missing.push(
          `${f.file}:${f.line} ${f.name} (forma: ${f.shape}) — no está en lexicon-inventory.json. ` +
            `Agregala con su clasificación (${[...KNOWN_CLASSIFICATIONS].join(" | ")}), su fase de ` +
            `retiro y su reemplazo antes de mergear.`,
        );
      } else if (inv.shape !== f.shape) {
        shapeMismatch.push(
          `${f.file}:${f.line} ${f.name} — el inventario dice forma "${inv.shape}" pero el código ` +
            `tiene forma "${f.shape}" ahora. Actualizá la entrada.`,
        );
      }
    }

    expect(missing, missing.join("\n")).toHaveLength(0);
    expect(shapeMismatch, shapeMismatch.join("\n")).toHaveLength(0);
  });

  it("el inventario no tiene entradas fantasma (constantes que ya no existen en el código)", () => {
    const found = new Set(scanAll().map(key));
    const inventory = loadInventory();
    const stale = inventory.entries
      .filter((e) => !found.has(key(e)))
      .map((e) => `${e.file}:${e.line} ${e.name} — ya no existe en el código, o cambió de línea/nombre. Podala del inventario o actualizá su ubicación.`);
    expect(stale, stale.join("\n")).toHaveLength(0);
  });

  it("toda entrada del inventario tiene una clasificación conocida y una fase de retiro no vacía", () => {
    const inventory = loadInventory();
    const bad = inventory.entries
      .filter((e) => !KNOWN_CLASSIFICATIONS.has(e.classification) || !e.retirementPhase?.trim())
      .map((e) => `${e.file}:${e.line} ${e.name} — clasificación "${e.classification}" o retirementPhase vacío`);
    expect(bad, bad.join("\n")).toHaveLength(0);
  });

  it("los totales resumidos en el inventario coinciden con sus propias entradas (sin edición manual del resumen)", () => {
    const inventory = loadInventory();
    expect(inventory.totalEntries).toBe(inventory.entries.length);
    const recomputed: Record<string, number> = {};
    for (const e of inventory.entries) {
      recomputed[e.classification] = (recomputed[e.classification] ?? 0) + 1;
    }
    expect(inventory.countsByClassification).toEqual(recomputed);
  });
});
