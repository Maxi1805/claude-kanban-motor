/**
 * CONTRATO-F6.md §1.4: "Ninguna hipótesis declara su confianza."
 * `confidence` SIEMPRE sale de `engine.ts#build`/`toPatternHypothesis`
 * (`min(ceiling, escalera de discriminadores confirmados)`), nunca un
 * literal a mano en un archivo de hipótesis concreta — eso es exactamente
 * lo que hoy hacen los tres `pattern-*.ts` viejos (`confidence: "media"`
 * escrito a mano) y lo que F6 existe para reemplazar.
 *
 * Ámbito deliberadamente amplio (todo `hypotheses/*.ts`, no sólo los
 * archivos de S0): cada una de las 17 migraciones futuras entra bajo esta
 * misma compuerta sin tener que agregar su propio test — S1 no debe poder
 * "arreglar" un caso difícil escribiendo `confidence: "alta"` a mano.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname);

function isOwnTest(fileName: string): boolean {
  return fileName.endsWith(".test.ts");
}

describe("no-declared-confidence", () => {
  it("ningún archivo de hipótesis (fuera de engine.ts y de los propios tests) declara `confidence: \"...\"` a mano", () => {
    const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".ts") && f !== "engine.ts" && !isOwnTest(f));
    const violations: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (/confidence\s*:\s*"(alta|media|baja)"/.test(line)) {
          violations.push(`${file}:${i + 1} — ${line.trim()}`);
        }
      });
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});
