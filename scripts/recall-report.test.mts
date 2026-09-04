/**
 * EL TEST QUE FIJA EL CÓDIGO DE SALIDA DEL INSTRUMENTO DE RECALL.
 *
 * ═══ POR QUÉ EXISTE, Y POR QUÉ VIVE EN `scripts/` ═══
 *
 * El defecto que este archivo clava lleva OCHO olas reportado con las mismas
 * palabras en el cierre de cada una: *"`recall-report.mts --exigir-vigente` sale
 * con código 0 aunque haya pérdidas SIN DECLARAR"*. Nunca se arregló, y la razón
 * de fondo es que NADIE LO PROBABA: `recall-gate.test.ts` prueba
 * `evaluateRecallGate` (la medición) y nada probaba el SCRIPT (la decisión de
 * con qué código salir). Un instrumento sin test cuyo verde todo el proyecto
 * cita es una red de seguridad que no atrapa nada.
 *
 * Vive en `scripts/` y no en `src/server/services/detect/precision/` por una
 * razón medida, no por comodidad: `analyze-cache.ts#computeCodeFingerprint`
 * hashea **todo archivo bajo `src/server/services/`, con cualquier extensión,
 * incluidos los `.test.ts`**. Un test nuevo ahí adentro cambia la huella del
 * analizador, y con eso (a) los 21 snapshots de recall pasan a `stale` y
 * `--exigir-vigente` sale 2 por vejez —tapando justo el chequeo que este frente
 * vino a arreglar— y (b) se invalida la caché de análisis de todo el árbol, que
 * son 7 min 30 s de re-corrida que pagarían los demás. `scripts/` NO está en
 * `DEFAULT_FINGERPRINT_ROOTS`. Verificado midiendo la huella antes y después:
 * IDÉNTICA. El `include` de `vitest.config.ts` es el de fábrica desde la raíz,
 * así que `.test.mts` bajo `scripts/` se descubre igual, y `tsconfig.json`
 * incluye `scripts/**\/*.mts`, así que también se typechequea.
 *
 * ═══ QUÉ INTENCIÓN VERIFICA CADA BLOQUE ═══
 *
 * 1. LA DECISIÓN PURA (`evaluateRecallExit`) — *"¿el veredicto depende de lo que
 *    se midió?"* Cada código en sus DOS direcciones: falla cuando debe y pasa
 *    cuando debe. Incluye el caso exacto de las ocho olas: pérdida silenciosa
 *    SIN ningún flag y CON `--exigir-vigente`, las dos != 0.
 *
 * 2. EL SCRIPT DE VERDAD (spawn) — *"¿el script llama a la decisión?"* Los tests
 *    unitarios de arriba pasarían igual si `recall-report.mts` se olvidara de
 *    usar `evaluateRecallExit`, que es LITERALMENTE el defecto que se está
 *    arreglando. Así que estos casos corren el binario y leen su código de
 *    salida, contra fixtures propios en un directorio temporal — nunca contra
 *    `tests/golden/`, que es archivo compartido y donde una inyección sin
 *    restaurar deja una planilla corrupta.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  EXIT_OK,
  EXIT_PERDIDA_SIN_DECLARAR,
  EXIT_SNAPSHOT_VIEJO,
  EXIT_VERDADERO_SIN_MEDIR,
  evaluateRecallExit,
  formatRecallExit,
  unmeasuredQueCuenta,
  type RecallExitInput,
} from "./recall-exit.mjs";
import type { RecallRowOutcome, RecallSnapshot, RecallUnmeasured, StaleSnapshot } from "../src/server/services/detect/precision/recall-logic.js";
import { CSV_COLUMNS } from "../src/server/services/detect/precision/types.js";

const execFileAsync = promisify(execFile);

/* ─────────────────────────── constructores mínimos ─────────────────────────── */

function perdidaSilenciosa(id: string): RecallRowOutcome {
  return {
    slug: "cobra",
    id,
    kind: "argument-mutation",
    language: "go",
    file: "doc/man_docs.go",
    symbol: "cmd",
    title: "muta su argumento",
    status: "perdido",
    lossReason: "",
  };
}

function sinMedir(slug: string, judgedTrue: number, reason: RecallUnmeasured["reason"]): RecallUnmeasured {
  return { slug, judgedTrue, reason };
}

function viejo(slug: string): StaleSnapshot {
  return { slug, measuredAt: "2026-01-01T00:00:00.000Z", snapshotFingerprint: "huella-vieja" };
}

const LIMPIO: RecallExitInput = { silentLoss: [], unmeasured: [], stale: [] };

/* ───────────────────────────── 1. LA DECISIÓN PURA ──────────────────────────── */

describe("evaluateRecallExit — el veredicto depende de lo que se midió", () => {
  it("sin ninguna falla sale 0, con y sin --exigir-vigente", () => {
    expect(evaluateRecallExit(LIMPIO, { exigirVigente: false })).toEqual({ code: EXIT_OK, fallas: [] });
    expect(evaluateRecallExit(LIMPIO, { exigirVigente: true })).toEqual({ code: EXIT_OK, fallas: [] });
  });

  it("EL DEFECTO DE OCHO OLAS: una pérdida SIN DECLARAR sale != 0 CON --exigir-vigente", () => {
    const v = evaluateRecallExit({ ...LIMPIO, silentLoss: [perdidaSilenciosa("argument-mutation:7i1KtTURD6LyJhJu")] }, { exigirVigente: true });
    expect(v.code).toBe(EXIT_PERDIDA_SIN_DECLARAR);
    expect(v.code).not.toBe(EXIT_OK);
  });

  it("una pérdida SIN DECLARAR sale != 0 TAMBIÉN sin ningún flag — no es una condición del integrador, es un defecto", () => {
    const v = evaluateRecallExit({ ...LIMPIO, silentLoss: [perdidaSilenciosa("x:1")] }, { exigirVigente: false });
    expect(v.code).toBe(EXIT_PERDIDA_SIN_DECLARAR);
  });

  it("una pérdida DECLARADA no aparece acá: `silentLoss` ya la excluye, y declarar no puede bajar el código a 0 por otra vía", () => {
    // `evaluateRecallGate` reparte las pérdidas en declaredLoss/silentLoss; la
    // decisión sólo mira `silentLoss`. Éste es el contrato: 26 pérdidas
    // declaradas en el árbol de hoy y exit 0.
    expect(evaluateRecallExit(LIMPIO, { exigirVigente: true }).code).toBe(EXIT_OK);
  });

  it("un verdadero medible SIN MEDIR rompe SÓLO bajo --exigir-vigente", () => {
    const conHueco: RecallExitInput = { ...LIMPIO, unmeasured: [sinMedir("guava", 173, "sin-snapshot")] };
    expect(evaluateRecallExit(conHueco, { exigirVigente: false }).code).toBe(EXIT_OK);
    expect(evaluateRecallExit(conHueco, { exigirVigente: true }).code).toBe(EXIT_VERDADERO_SIN_MEDIR);
  });

  it("`fuera-del-snapshot` cuenta igual que `sin-snapshot`: los dos significan que no hay medición", () => {
    const v = evaluateRecallExit({ ...LIMPIO, unmeasured: [sinMedir("cobra", 1, "fuera-del-snapshot")] }, { exigirVigente: true });
    expect(v.code).toBe(EXIT_VERDADERO_SIN_MEDIR);
  });

  it("`poblacion-sin-sha-congelado` NO rompe: está excluida por diseño y es la única que hay en el árbol de hoy (ck-analyzer, 34)", () => {
    const soloCkAnalyzer: RecallExitInput = { ...LIMPIO, unmeasured: [sinMedir("ck-analyzer", 34, "poblacion-sin-sha-congelado")] };
    expect(evaluateRecallExit(soloCkAnalyzer, { exigirVigente: true })).toEqual({ code: EXIT_OK, fallas: [] });
    expect(unmeasuredQueCuenta(soloCkAnalyzer.unmeasured)).toHaveLength(0);
  });

  it("un snapshot viejo conserva su código HISTÓRICO 2, y sólo bajo --exigir-vigente", () => {
    const conViejo: RecallExitInput = { ...LIMPIO, stale: [viejo("guava")] };
    expect(evaluateRecallExit(conViejo, { exigirVigente: false }).code).toBe(EXIT_OK);
    expect(evaluateRecallExit(conViejo, { exigirVigente: true }).code).toBe(2);
    expect(EXIT_SNAPSHOT_VIEJO).toBe(2);
  });

  it("con varias fallas devuelve la MÁS GRAVE (3 > 4 > 2) y las lista TODAS", () => {
    const todo: RecallExitInput = {
      silentLoss: [perdidaSilenciosa("x:1")],
      unmeasured: [sinMedir("guava", 173, "sin-snapshot")],
      stale: [viejo("hugo")],
    };
    const v = evaluateRecallExit(todo, { exigirVigente: true });
    expect(v.code).toBe(EXIT_PERDIDA_SIN_DECLARAR);
    expect(v.fallas.map((f) => f.code)).toEqual([EXIT_PERDIDA_SIN_DECLARAR, EXIT_VERDADERO_SIN_MEDIR, EXIT_SNAPSHOT_VIEJO]);
  });

  it("el texto de stderr nombra el id perdido y la vía de escape, y está vacío cuando no hay fallas", () => {
    expect(formatRecallExit(evaluateRecallExit(LIMPIO, { exigirVigente: true }))).toBe("");
    const texto = formatRecallExit(evaluateRecallExit({ ...LIMPIO, silentLoss: [perdidaSilenciosa("x:1")] }, { exigirVigente: true }));
    expect(texto).toContain("SIN DECLARAR");
    expect(texto).toContain("lossReason");
    expect(texto).toContain("código 3");
  });

  it("los cuatro códigos son distintos entre sí y ninguno es 0 salvo EXIT_OK", () => {
    const codigos = [EXIT_OK, EXIT_SNAPSHOT_VIEJO, EXIT_PERDIDA_SIN_DECLARAR, EXIT_VERDADERO_SIN_MEDIR];
    expect(new Set(codigos).size).toBe(4);
    expect(EXIT_OK).toBe(0);
  });
});

/* ─────────────── 2. EL SCRIPT DE VERDAD — que llame a la decisión ────────────── */

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "recall-report.mts");

let raiz = "";
let dirPlanillas = "";
let dirSnapshots = "";

/**
 * La huella con la que el fixture se declara "medido". Se pasa por
 * `CK_RECALL_FINGERPRINT` en vez de calcular la real del árbol por una razón
 * concreta: siete frentes escriben en `src/server/services/` a la vez, y ese
 * directorio ES la huella. Un test que compare "la huella que calculé yo hace
 * tres segundos" contra "la que calcula el hijo ahora" es un test que se pone
 * rojo cuando el vecino guarda un archivo. La comparación que importa —
 * `snapshot.analyzerFingerprint !== la de hoy ⇒ viejo` — se ejercita igual, y
 * es determinista.
 */
const HUELLA_VIGENTE = "huella-vigente-del-fixture";

/**
 * Una planilla con el encabezado REAL del instrumento (`types.ts#CSV_COLUMNS`,
 * no una versión abreviada: `readPrecisionCsv#col()` tira si falta cualquier
 * columna del contrato original) y una fila `verdadero` por entrada.
 */
function escribirPlanilla(filas: readonly { id: string; lossReason: string }[]): void {
  const valores: Record<string, string> = {
    slug: "fixture",
    kind: "argument-mutation",
    language: "go",
    pattern: "",
    file: "doc/man_docs.go",
    startLine: "227",
    endLine: "227",
    symbol: "cmd",
    title: "muta su argumento",
    detail: "",
    metricLabel: "",
    metricValue: "",
    evidence: "",
    verdict: "verdadero",
    patternFit: "",
    note: "",
    stillPresent: "true",
  };
  const cuerpo = filas
    .map((f) => CSV_COLUMNS.map((c) => (c === "id" ? f.id : c === "lossReason" ? `"${f.lossReason}"` : (valores[c] ?? ""))).join(","))
    .join("\n");
  fs.writeFileSync(path.join(dirPlanillas, "fixture.verdicts.csv"), `${CSV_COLUMNS.join(",")}\n${cuerpo}\n`, "utf8");
}

function escribirSnapshot(status: Record<string, "id" | "contenido" | "perdido">, fingerprint: string): void {
  const snap: RecallSnapshot = {
    slug: "fixture",
    sha: "0000000000000000000000000000000000000000",
    measuredAt: "2026-08-20T00:00:00.000Z",
    analyzerFingerprint: fingerprint,
    poolFindings: 10,
    source: "fixture en memoria — recall-report.test.mts",
    status,
  };
  fs.writeFileSync(path.join(dirSnapshots, "fixture.recall.json"), JSON.stringify(snap, null, 2) + "\n", "utf8");
}

async function correr(...flags: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("npx", ["tsx", SCRIPT, ...flags], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        CK_RECALL_PRECISION_DIR: dirPlanillas,
        CK_RECALL_SNAPSHOT_DIR: dirSnapshots,
        CK_RECALL_FINGERPRINT: HUELLA_VIGENTE,
      },
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("scripts/recall-report.mts — el código de salida del binario, no el de la función", () => {
  beforeAll(() => {
    raiz = fs.mkdtempSync(path.join(os.tmpdir(), "ck-recall-exit-"));
    dirPlanillas = path.join(raiz, "precision");
    dirSnapshots = path.join(dirPlanillas, "recall");
    fs.mkdirSync(dirSnapshots, { recursive: true });
  });

  afterAll(() => {
    if (raiz !== "") fs.rmSync(raiz, { recursive: true, force: true });
  });

  it(
    "PASA CUANDO DEBE: todo vivo, snapshot vigente, base completa ⇒ exit 0 con y sin --exigir-vigente",
    async () => {
      escribirPlanilla([{ id: "k:vivo", lossReason: "" }]);
      escribirSnapshot({ "k:vivo": "id" }, HUELLA_VIGENTE);
      const sinFlag = await correr();
      expect(sinFlag.code, sinFlag.stderr).toBe(0);
      expect(sinFlag.stdout).toContain("0 SIN DECLARAR");
      const conFlag = await correr("--exigir-vigente");
      expect(conFlag.code, conFlag.stderr).toBe(0);
    },
    180_000,
  );

  it(
    "FALLA CUANDO DEBE: una pérdida SIN DECLARAR ⇒ exit 3, con --exigir-vigente y sin él",
    async () => {
      escribirPlanilla([{ id: "k:muerto", lossReason: "" }]);
      escribirSnapshot({ "k:muerto": "perdido" }, HUELLA_VIGENTE);
      const conFlag = await correr("--exigir-vigente");
      expect(conFlag.stdout).toContain("1 SIN DECLARAR");
      expect(conFlag.code).toBe(EXIT_PERDIDA_SIN_DECLARAR);
      expect(conFlag.stderr).toContain("SIN DECLARAR");
      const sinFlag = await correr();
      expect(sinFlag.code).toBe(EXIT_PERDIDA_SIN_DECLARAR);
    },
    180_000,
  );

  it(
    "esa MISMA pérdida, DECLARADA en lossReason, vuelve a exit 0 — y el recall NO sube: sigue contando 0/1",
    async () => {
      escribirPlanilla([{ id: "k:muerto", lossReason: "declarada a propósito por el test de AI2" }]);
      escribirSnapshot({ "k:muerto": "perdido" }, HUELLA_VIGENTE);
      const r = await correr("--exigir-vigente");
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toContain("0 SIN DECLARAR");
      expect(r.stdout).toContain("VIVOS 0");
    },
    180_000,
  );

  it(
    "un verdadero medible SIN MEDIR ⇒ exit 4 bajo --exigir-vigente y exit 0 sin el flag",
    async () => {
      escribirPlanilla([{ id: "k:vivo", lossReason: "" }, { id: "k:sin-medir", lossReason: "" }]);
      escribirSnapshot({ "k:vivo": "id" }, HUELLA_VIGENTE);
      const conFlag = await correr("--exigir-vigente");
      expect(conFlag.code).toBe(EXIT_VERDADERO_SIN_MEDIR);
      expect(conFlag.stderr).toContain("SIN MEDIR");
      const sinFlag = await correr();
      expect(sinFlag.code, sinFlag.stderr).toBe(0);
    },
    180_000,
  );

  it(
    "un snapshot viejo ⇒ exit 2 bajo --exigir-vigente — el comportamiento HISTÓRICO, intacto",
    async () => {
      escribirPlanilla([{ id: "k:vivo", lossReason: "" }]);
      escribirSnapshot({ "k:vivo": "id" }, "huella-de-otra-ola");
      const conFlag = await correr("--exigir-vigente");
      expect(conFlag.code).toBe(EXIT_SNAPSHOT_VIEJO);
      const sinFlag = await correr();
      expect(sinFlag.code, sinFlag.stderr).toBe(0);
    },
    180_000,
  );

  it(
    "pérdida silenciosa Y snapshot viejo a la vez ⇒ gana la pérdida (3), y stderr nombra las dos",
    async () => {
      escribirPlanilla([{ id: "k:muerto", lossReason: "" }]);
      escribirSnapshot({ "k:muerto": "perdido" }, "huella-de-otra-ola");
      const r = await correr("--exigir-vigente");
      expect(r.code).toBe(EXIT_PERDIDA_SIN_DECLARAR);
      expect(r.stderr).toContain("código 3");
      expect(r.stderr).toContain("código 2");
    },
    180_000,
  );
});
