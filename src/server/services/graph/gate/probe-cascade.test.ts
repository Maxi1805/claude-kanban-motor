/**
 * Correctud del puerto TS de la cascada del probe — INCONDICIONAL (no
 * necesita el corpus externo): 4 archivos Ruby sintéticos bajo
 * `tests/fixtures/graph-cascade-probe/`, uno por salida posible de la
 * cascada de 4 etapas, para probar que el puerto clasifica cada una donde
 * corresponde antes de confiarle la compuerta de precisión/recall
 * (`precision-recall.test.ts`) a un corpus externo que puede no estar
 * disponible en toda corrida de `npx vitest run`.
 *
 *   a.rb — declara `Widget` (con un miembro no-declaración, `attr_accessor`,
 *          para que NO caiga en el caso "cuerpo son sólo declaraciones" —
 *          ver `isDeclOnlyBody`) y el método `paint`.
 *   b.rb — `Widget.new.paint`: `Widget` es el RECEPTOR de `.new` (pasa rol
 *          sintáctico), `paint` es el MÉTODO de una llamada con receptor
 *          (lo rechaza rol sintáctico).
 *   c.rb — llama a `paint` sin receptor (pasa rol sintáctico) desde una
 *          clase que no hereda de `Widget` — lo rechaza miembro-de-clase.
 *   d.rb — `Widget.new` desde un namespace sin relación con `App::Widget` —
 *          pasa rol y miembro, lo rechaza namespace léxico.
 */
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runProbeCascade } from "./probe-cascade.js";

const FIXTURE_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "tests",
  "fixtures",
  "graph-cascade-probe",
);

function findRow<T extends { from: string; symbol: string }>(
  rows: readonly T[],
  from: string,
  symbol: string,
): T | undefined {
  return rows.find((r) => r.from === from && r.symbol === symbol);
}

describe("runProbeCascade — fixtures sintéticas, una por salida de la cascada de 4 etapas", () => {
  it("clasifica cada candidato en la etapa terminal esperada", async () => {
    const { rows, summary } = await runProbeCascade(FIXTURE_DIR);

    const accepted = findRow(rows, "b.rb", "Widget");
    expect(accepted, "b.rb debería referenciar Widget (receptor de .new)").toBeDefined();
    expect(accepted?.accepted).toBe(true);
    expect(accepted?.finalStage).toBe("global-uniqueness");
    expect(accepted?.to).toBe("a.rb");

    const rejectedByRole = findRow(rows, "b.rb", "paint");
    expect(rejectedByRole, "b.rb debería tener un candidato para 'paint' (método de .new.paint)").toBeDefined();
    expect(rejectedByRole?.accepted).toBe(false);
    expect(rejectedByRole?.finalStage).toBe("syntactic-role");

    const rejectedByMember = findRow(rows, "c.rb", "paint");
    expect(rejectedByMember, "c.rb debería tener un candidato para 'paint' (llamada sin receptor)").toBeDefined();
    expect(rejectedByMember?.accepted).toBe(false);
    expect(rejectedByMember?.finalStage).toBe("class-member");

    const rejectedByScope = findRow(rows, "d.rb", "Widget");
    expect(rejectedByScope, "d.rb debería tener un candidato para 'Widget' (namespace no relacionado)").toBeDefined();
    expect(rejectedByScope?.accepted).toBe(false);
    expect(rejectedByScope?.finalStage).toBe("qualified-name");

    // Invariante de medibilidad, a escala de fixture: todo candidato cae en
    // exactamente una de las 4 salidas — la suma cierra sobre el total.
    expect(summary.rowsAccepted + summary.rowsRejectedRole + summary.rowsRejectedMember + summary.rowsRejectedScope).toBe(
      summary.candidateRows,
    );
    expect(summary.files).toBe(4);
  });
});
