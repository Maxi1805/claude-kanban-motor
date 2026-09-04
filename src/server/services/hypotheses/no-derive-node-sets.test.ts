/**
 * CONTRATO-F6.md §1.7: "ninguna hipótesis llama `deriveNodeSets`". Los
 * `DerivedNodeSets` de una hipótesis SIEMPRE llegan por
 * `HypothesisContext.setsFor(language)` — cacheados desde el `probeSource`
 * dedicado del lenguaje (`code-analyzer.ts`) — nunca derivados del árbol del
 * archivo bajo análisis: ese es exactamente el Bug C que invalidó el primer
 * veredicto del spike (`impl/spikes/motor-hipotesis/RESULTADO-v2.md`, 46% de
 * mal-clasificación método↔clase en los fixtures de Prototype). Compuerta
 * amplia a propósito, misma razón que `no-declared-confidence.test.ts`: cubre
 * también las 17 migraciones futuras sin que cada una tenga que agregar su
 * propio grep.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname);

describe("no-derive-node-sets", () => {
  it("ningún archivo de hypotheses/* llama a deriveNodeSets(", () => {
    // Excluye los propios `.test.ts`: éste mismo archivo menciona el token
    // prohibido DENTRO de su regex/comentario para poder buscarlo, lo cual
    // no es una llamada real.
    const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const violations: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      text.split("\n").forEach((line, i) => {
        if (/\bderiveNodeSets\s*\(/.test(line)) violations.push(`${file}:${i + 1} — ${line.trim()}`);
      });
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});
