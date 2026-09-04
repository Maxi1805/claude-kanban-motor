/**
 * `evaluateRecallGate` y el cruce, con datos sintéticos — la parte de la
 * compuerta de recall que se puede probar sin volcar un repo.
 * `recall-gate.test.ts` es la integración (planillas y mediciones reales);
 * esto prueba el CRITERIO en aislamiento, incluidas las dos propiedades que
 * hacen que la compuerta sirva para algo:
 *
 *   - que una pérdida SIN motivo escrito rompa, y
 *   - que escribir el motivo NO mueva la cifra de recall (si la moviera, la
 *     columna sería un botón para apagar la medición).
 */
import { describe, expect, it } from "vitest";

import { contentFindingKey } from "../../code-finding-ids.js";
import {
  buildLivePool,
  classifyRow,
  evaluateRecallGate,
  fileOfWhere,
  HERITAGE_PREFIX,
  type DumpedFinding,
  type RecallSnapshot,
} from "./recall-logic.js";
import type { PrecisionRow } from "./types.js";

function row(overrides: Partial<PrecisionRow> = {}): PrecisionRow {
  return {
    id: "k:1",
    slug: "click",
    kind: "k",
    language: "python",
    pattern: "",
    file: "a.py",
    startLine: 1,
    endLine: 2,
    symbol: "f",
    title: "t",
    detail: "d",
    metricLabel: "m",
    metricValue: "1",
    evidence: "e",
    verdict: "verdadero",
    patternFit: "",
    note: "",
    stillPresent: true,
    lossReason: "",
    ...overrides,
  };
}

function dumped(overrides: Partial<DumpedFinding> = {}): DumpedFinding {
  return { id: "k:1", kind: "k", title: "t", where: ["a.py:1"], symbols: ["f"], ...overrides };
}

function snapshot(slug: string, status: Record<string, "id" | "contenido" | "perdido">, fp = "FP"): RecallSnapshot {
  return {
    slug,
    sha: "abc",
    measuredAt: "2026-01-01T00:00:00Z",
    analyzerFingerprint: fp,
    poolFindings: 10,
    source: "test",
    status,
  };
}

describe("fileOfWhere", () => {
  it("saca sólo el último :línea, no un dos puntos que sea parte de la ruta", () => {
    expect(fileOfWhere("src/a.ts:120")).toBe("src/a.ts");
    expect(fileOfWhere("C:/x/a.ts:9")).toBe("C:/x/a.ts");
    expect(fileOfWhere("src/a.ts")).toBe("src/a.ts");
  });
});

describe("classifyRow — el cruce por DOS llaves", () => {
  it("encuentra por id cuando el id no cambió", () => {
    const pool = buildLivePool([dumped()]);
    expect(classifyRow(row(), pool)).toBe("id");
  });

  it("EL CASO QUE JUSTIFICA LA SEGUNDA LLAVE: el detector cambió el id pero el hallazgo es el mismo", () => {
    // `stableFindingId` hashea TODAS las ubicaciones: adjuntar una ubicación
    // secundaria mueve el hash sin cambiar nada de lo que un humano lee.
    const pool = buildLivePool([dumped({ id: "k:OTRO-HASH" })]);
    expect(classifyRow(row(), pool)).toBe("contenido");
  });

  it("perdido cuando no está por ninguna de las dos", () => {
    const pool = buildLivePool([dumped({ id: "k:OTRO", title: "otro título", where: ["b.py:1"] })]);
    expect(classifyRow(row(), pool)).toBe("perdido");
  });

  it("el título separa dos hallazgos del mismo (kind, archivo, símbolo) — sin él, uno taparía al otro", () => {
    const pool = buildLivePool([dumped({ id: "k:9", title: "2 fragmentos de 30 líneas" })]);
    expect(classifyRow(row({ id: "k:8", title: "3 fragmentos de 11 líneas" }), pool)).toBe("perdido");
    expect(classifyRow(row({ id: "k:8", title: "2 fragmentos de 30 líneas" }), pool)).toBe("contenido");
  });

  it("la clave de contenido se arma con la PRIMERA ubicación, igual que en la planilla", () => {
    const pool = buildLivePool([dumped({ id: "x", where: ["a.py:44", "z.py:1"], symbols: ["f", "g"] })]);
    expect(pool.contentKeys.has(contentFindingKey({ kind: "k", file: "a.py", symbol: "f", title: "t" }))).toBe(true);
    expect(pool.contentKeys.has(contentFindingKey({ kind: "k", file: "z.py", symbol: "g", title: "t" }))).toBe(false);
  });

  it("un hallazgo sin ubicaciones no revienta el pool", () => {
    const pool = buildLivePool([dumped({ where: [], symbols: [] })]);
    expect(pool.contentKeys.has(contentFindingKey({ kind: "k", file: "", symbol: "", title: "t" }))).toBe(true);
  });
});

describe("evaluateRecallGate — qué rompe y qué no", () => {
  it("un verdadero perdido SIN lossReason es pérdida silenciosa (lo que rompe la compuerta)", () => {
    const r = evaluateRecallGate([row({ id: "k:1" })], [snapshot("click", { "k:1": "perdido" })]);
    expect(r.silentLoss).toHaveLength(1);
    expect(r.declaredLoss).toHaveLength(0);
    expect(r.silentLoss[0]?.kind).toBe("k");
  });

  it("el mismo perdido CON lossReason deja de romper, pero sigue perdido", () => {
    const r = evaluateRecallGate(
      [row({ id: "k:1", lossReason: "el criterio cambió: ahora se exige un consumidor externo" })],
      [snapshot("click", { "k:1": "perdido" })],
    );
    expect(r.silentLoss).toHaveLength(0);
    expect(r.declaredLoss).toHaveLength(1);
  });

  it("LA PROPIEDAD QUE IMPIDE COMPRAR EL NÚMERO: declarar no sube el recall ni un punto", () => {
    const rows = [row({ id: "k:1" }), row({ id: "k:2" })];
    const snaps = [snapshot("click", { "k:1": "id", "k:2": "perdido" })];
    const sinDeclarar = evaluateRecallGate(rows, snaps);
    const declarado = evaluateRecallGate(
      [rows[0]!, { ...rows[1]!, lossReason: "muerto a propósito" }],
      snaps,
    );
    expect(sinDeclarar.alive).toBe(1);
    expect(declarado.alive).toBe(1);
    expect(sinDeclarar.byKind[0]?.recall).toBe(0.5);
    expect(declarado.byKind[0]?.recall).toBe(0.5);
    // Lo único que cambia es de qué lado se cuenta la pérdida.
    expect(declarado.silentLoss).toHaveLength(0);
  });

  it("la deuda previa (`heredada:`) se cuenta aparte sin dejar de ser una pérdida declarada", () => {
    const r = evaluateRecallGate(
      [
        row({ id: "k:1", lossReason: `${HERITAGE_PREFIX} perdida antes de la compuerta, sin atribuir` }),
        row({ id: "k:2", lossReason: "lo maté yo en esta ola: el archivo es copia de upstream" }),
      ],
      [snapshot("click", { "k:1": "perdido", "k:2": "perdido" })],
    );
    expect(r.declaredLoss).toHaveLength(2);
    expect(r.inheritedLoss).toHaveLength(1);
    expect(r.silentLoss).toHaveLength(0);
  });

  it("sólo se miden filas juzgadas verdadero — falso/dudoso/pendiente no entran al denominador", () => {
    const r = evaluateRecallGate(
      [
        row({ id: "k:1", verdict: "verdadero" }),
        row({ id: "k:2", verdict: "falso" }),
        row({ id: "k:3", verdict: "dudoso" }),
        row({ id: "k:4", verdict: "" }),
      ],
      [snapshot("click", { "k:1": "id", "k:2": "perdido", "k:3": "perdido", "k:4": "perdido" })],
    );
    expect(r.measured).toBe(1);
    expect(r.silentLoss).toHaveLength(0);
  });

  it("NUNCA lee stillPresent: una fila marcada stillPresent=false que la medición encuentra viva cuenta VIVA", () => {
    // `stillPresent` se escribe contra la muestra de la corrida, no contra el
    // pool completo (ver el docstring del módulo) — construir el recall sobre
    // esa columna heredaría ese defecto.
    const r = evaluateRecallGate([row({ id: "k:1", stillPresent: false })], [snapshot("click", { "k:1": "id" })]);
    expect(r.alive).toBe(1);
    expect(r.silentLoss).toHaveLength(0);
  });
});

describe("evaluateRecallGate — lo que NO se sabe se dice, no se supone", () => {
  it("un slug sin snapshot no es una pérdida: es sin medir", () => {
    const r = evaluateRecallGate([row({ slug: "hugo", id: "k:1" })], [snapshot("click", { "k:1": "id" })]);
    expect(r.measured).toBe(0);
    expect(r.silentLoss).toHaveLength(0);
    expect(r.unmeasured).toEqual([{ slug: "hugo", judgedTrue: 1, reason: "sin-snapshot" }]);
  });

  it("un veredicto cargado DESPUÉS de la última medición queda fuera del snapshot, no perdido", () => {
    const r = evaluateRecallGate(
      [row({ id: "k:1" }), row({ id: "k:2" })],
      [snapshot("click", { "k:1": "id" })],
    );
    expect(r.measured).toBe(1);
    expect(r.silentLoss).toHaveLength(0);
    expect(r.unmeasured).toEqual([{ slug: "click", judgedTrue: 1, reason: "fuera-del-snapshot" }]);
  });

  it("ck-analyzer se excluye por no tener SHA congelado, y se dice por qué", () => {
    const r = evaluateRecallGate(
      [row({ slug: "ck-analyzer", id: "k:1" })],
      [snapshot("ck-analyzer", { "k:1": "perdido" })],
    );
    expect(r.measured).toBe(0);
    expect(r.silentLoss).toHaveLength(0);
    expect(r.unmeasured).toEqual([{ slug: "ck-analyzer", judgedTrue: 1, reason: "poblacion-sin-sha-congelado" }]);
  });

  it("un snapshot medido con otro analizador se marca viejo (y no rompe)", () => {
    const r = evaluateRecallGate([row({ id: "k:1" })], [snapshot("click", { "k:1": "id" }, "FP-VIEJA")], "FP-DE-HOY");
    expect(r.stale).toHaveLength(1);
    expect(r.stale[0]?.slug).toBe("click");
    expect(r.silentLoss).toHaveLength(0);
  });

  it("sin huella actual no se chequea vigencia", () => {
    const r = evaluateRecallGate([row({ id: "k:1" })], [snapshot("click", { "k:1": "id" }, "FP-VIEJA")]);
    expect(r.stale).toHaveLength(0);
  });
});

describe("evaluateRecallGate — agregados", () => {
  it("deduplica por (slug,id) y se queda con la copia que trae el motivo escrito", () => {
    const r = evaluateRecallGate(
      [row({ id: "k:1" }), row({ id: "k:1", lossReason: "motivo" })],
      [snapshot("click", { "k:1": "perdido" })],
    );
    expect(r.measured).toBe(1);
    expect(r.declaredLoss).toHaveLength(1);
    expect(r.silentLoss).toHaveLength(0);
  });

  it("el mismo id en DOS poblaciones distintas no se deduplica entre sí", () => {
    const r = evaluateRecallGate(
      [row({ slug: "click", id: "k:1" }), row({ slug: "hugo", id: "k:1" })],
      [snapshot("click", { "k:1": "id" }), snapshot("hugo", { "k:1": "id" })],
    );
    expect(r.measured).toBe(2);
  });

  it("desglosa por kind, por lenguaje y por (kind, lenguaje) — la dimensión obligatoria del proyecto", () => {
    const r = evaluateRecallGate(
      [
        row({ id: "1", kind: "dup", language: "python" }),
        row({ id: "2", kind: "dup", language: "go" }),
        row({ id: "3", kind: "dup", language: "go" }),
      ],
      [snapshot("click", { "1": "id", "2": "perdido", "3": "perdido" })],
    );
    expect(r.byKind).toHaveLength(1);
    expect(r.byKind[0]?.recall).toBeCloseTo(1 / 3);
    // Un kind que se derrumbó en UN lenguaje y sobrevivió en otro: el promedio
    // por kind lo esconde, este desglose no.
    const go = r.byKindLanguage.find((c) => c.language === "go");
    const py = r.byKindLanguage.find((c) => c.language === "python");
    expect(go?.recall).toBe(0);
    expect(py?.recall).toBe(1);
    expect(r.byLanguage.map((c) => c.key)).toEqual(["go", "python"]);
  });

  it("las filas sin lenguaje resuelto tienen su propia celda, nunca se reparten", () => {
    const r = evaluateRecallGate(
      [row({ id: "1", language: "" }), row({ id: "2", language: "go" })],
      [snapshot("click", { "1": "id", "2": "id" })],
    );
    expect(r.byLanguage.map((c) => c.key).sort()).toEqual(["(sin lenguaje)", "go"]);
  });

  it("distingue vivo-por-id de vivo-sólo-por-contenido (un detector que cambió de forma se ve)", () => {
    const r = evaluateRecallGate(
      [row({ id: "1" }), row({ id: "2" })],
      [snapshot("click", { "1": "id", "2": "contenido" })],
    );
    expect(r.aliveById).toBe(1);
    expect(r.aliveByContent).toBe(1);
    expect(r.alive).toBe(2);
  });

  it("sin ninguna fila medida, el recall es null y no 0 — 'sin medir' no es 'todo perdido'", () => {
    const r = evaluateRecallGate([], []);
    expect(r.measured).toBe(0);
    expect(r.byKind).toHaveLength(0);
    expect(r.silentLoss).toHaveLength(0);
  });
});
