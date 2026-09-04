/**
 * LA COMPUERTA DE PRECISIÓN/RECALL DE F3 — CONTRATO-F3.md §3.5.
 *
 * El diseño anterior medía ABSTENCIÓN, y el spike de referencias demostró que
 * la abstención no ve el modo de falla real: resolver por unicidad global
 * sola produce un hub falso de fan-in 50 en `jekyll/lib` (37 de esos 50 sólo
 * por el nombre `each`, el iterador universal de Ruby) SIN abstenerse ni una
 * sola vez. Se cambió a precisión. Y el mismo spike después demostró que
 * **la precisión sola tampoco alcanza**: la cascada de 4 etapas da 100% de
 * precisión sobre lo aceptado, pero el recall estimado es ~36% — dos tercios
 * de las referencias reales del repo nunca entran al grafo — y esa pérdida
 * NO está repartida: una sola etapa (rol sintáctico) se come la mayoría de lo
 * que se pierde. Por eso esta compuerta tiene DOS cláusulas:
 *
 *   CLÁUSULA 1 — precisión ≥ 0,90 sobre las aristas ACEPTADAS, contra las
 *                200 aristas etiquetadas a mano de `labeled-dataset.json`.
 *                Ésta es la que ROMPE EL BUILD si no se cumple.
 *   CLÁUSULA 2 — recall estimado, REPORTADO POR ETAPA (no sólo el total).
 *                Ésta NUNCA rompe el build — se IMPRIME siempre, aunque la
 *                cláusula 1 pase, porque el objetivo es que el número sea
 *                VISIBLE, no que bloquee (así lo pide la tarea de esta ola:
 *                agregar el número al agregado es exactamente lo que
 *                escondía que namespace léxico pierde ~0% y rol sintáctico
 *                se come casi toda la pérdida — verlo por etapa es la mitad
 *                del punto de esta compuerta).
 *
 * REQUISITO DE HONESTIDAD (explícito, no implícito): el conjunto etiquetado
 * tiene 200 aristas de UN SOLO repo (jekyll) y UN SOLO lenguaje (Ruby). Todo
 * lo que este archivo imprime — precisión, recall por etapa — es una
 * medición de ESE repo y ESE lenguaje. NO es una garantía universal: otro
 * repo, otro lenguaje, u otra forma de código Ruby idiomático pueden dar
 * números distintos. Quien lea "precisión 0,90" en un reporte de CI y lo
 * repita como si aplicara a cualquier lenguaje está sobre-generalizando una
 * muestra de un solo punto de datos.
 *
 * ---
 *
 * CABLEADO A LA CASCADA REAL — qué falta cuando `graph/resolve.ts` +
 * `graph/stages.ts` existan (hoy no existen; hasta entonces esta compuerta
 * corre contra `probe-cascade.ts`, el puerto TS de la cascada de 4 etapas
 * del spike — ver su docstring para qué le falta respecto del contrato: las
 * 5 etapas restantes de `ResolutionStageId`, en particular
 * `bare-constant-receiver`, el refinamiento medido que CONTRATO-F3.md §3.5
 * exige que suba el recall sin bajar la precisión de 0,90):
 *
 *   1. Construir `FileFacts[]` para `jekyll/lib` (vía `facts/extract.ts`,
 *      cuando exista) y `ResolutionCandidate[]` a partir de ellos (vía
 *      `graph/build.ts` o `graph/references.ts`).
 *   2. Llamar `resolveReferences(ALL_STAGES, candidates, ctx, { trace })`
 *      de `graph/resolve.ts`, acumulando cada `CandidateTrace` emitido.
 *   3. Mapear cada `CandidateTrace` a un `CascadeOutcome` (`cascade-outcome.ts`):
 *      `from = trace.candidateId`'s `ResolutionCandidate.from.file`,
 *      `symbol = ...from.ref.name`, `useLine = ...from.ref.line`,
 *      `accepted = trace.final === "resolved"`,
 *      `finalStage = trace.finalStage ?? trace.final` (para `ambiguous`/
 *      `unresolved`, que no tienen `finalStage`, usar el propio `final` como
 *      etiqueta — el reporte de recall por etapa ya sabe tratar cualquier
 *      string que no sea una de las 3 etapas de rechazo del probe como "otra
 *      etapa / cascada real").
 *   4. Reemplazar la llamada a `runProbeCascade(rootDir)` de este archivo por
 *      la función nueva. TODO lo demás — la carga del dataset, el cruce por
 *      `(from, symbol)`, el cálculo de precisión con intervalo de Wilson, el
 *      recall por etapa — sigue igual sin tocarse: ambos caminos producen
 *      `readonly CascadeOutcome[]`, que es la única superficie de la que
 *      depende el resto de este archivo.
 *   5. Los mapas `STRATUM_TO_REJECT_STAGE` (`labeled-dataset.ts`) y el
 *      resumen impreso más abajo van a ganar filas nuevas a medida que la
 *      cascada real reporte etapas que el probe no tiene
 *      (`local-shadow`, `bare-constant-receiver`, `namespace-container`,
 *      `single-file-component`, `path-proximity`) — el código de abajo ya
 *      agrupa por `finalStage` STRING, así que una etapa nueva aparece sola
 *      en el reporte sin tocar una línea de este archivo.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { runProbeCascade } from "./probe-cascade.js";
import type { CascadeOutcome } from "./cascade-outcome.js";
import { candidateKey } from "./cascade-outcome.js";
import { loadLabeledDataset, STRATUM_TO_REJECT_STAGE, type LabeledSample } from "./labeled-dataset.js";
import { wilsonInterval } from "./wilson.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const GOLDEN_DIR = path.join(ROOT, "tests", "golden");
const MANIFEST_PATH = path.join(GOLDEN_DIR, "manifest.json");
const LABELED_DATASET_PATH = path.join(GOLDEN_DIR, "graph", "cascade-labeled-dataset.jekyll.json");

/** Cláusula 1 de CONTRATO-F3.md §3.5 — la única cifra que rompe el build en este archivo. */
const PRECISION_GATE = 0.9;

function readManifestJekyllSha(): string | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as {
      corpus?: Record<string, { sha: string; path: string }>;
    };
    return manifest.corpus?.jekyll?.sha ?? null;
  } catch {
    return null;
  }
}

function gitSha(dir: string): string | null {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Igual disciplina que `census-golden.test.ts`: sin el corpus, o con el
 * corpus en otro commit, el caso se `it.skip`-ea con el motivo en el propio
 * nombre — `npx vitest run` tiene que quedar verde SIN el corpus en la
 * máquina. El conjunto etiquetado SÍ está versionado en este repo (copia
 * exacta bajo `tests/golden/graph/`), así que lo único condicional es poder
 * re-parsear `jekyll/lib` para reproducir los candidatos.
 */
function resolveRootDirOrSkipReason(): { rootDir: string | null; skipReason: string | null } {
  const corpusRoot = process.env.CK_CORPUS_DIR;
  if (!corpusRoot) return { rootDir: null, skipReason: "CK_CORPUS_DIR no está seteado" };

  const expectedSha = readManifestJekyllSha();
  if (!expectedSha) {
    return { rootDir: null, skipReason: "tests/golden/manifest.json no tiene entrada 'jekyll' (o no existe)" };
  }

  const jekyllDir = path.join(corpusRoot, "corpus", "jekyll");
  if (!fs.existsSync(jekyllDir)) return { rootDir: null, skipReason: `no existe ${jekyllDir}` };

  const actualSha = gitSha(jekyllDir);
  if (actualSha !== expectedSha) {
    return {
      rootDir: null,
      skipReason: `sha desincronizado (manifest=${expectedSha}, disco=${actualSha ?? "no es un repo git"}) — re-congelar`,
    };
  }

  // `labeled-dataset.json` (RESULTADO.md, "Método") se generó corriendo la
  // cascada sobre `jekyll/lib` (89 archivos .rb) — no sobre el repo entero.
  return { rootDir: path.join(jekyllDir, "lib"), skipReason: null };
}

interface StageReport {
  readonly stage: string;
  readonly sampledN: number;
  readonly sampledCorrect: number;
  readonly sampledIncorrect: number;
  readonly sampledDudosa: number;
  readonly rate: number;
  readonly rateWilson: { lower: number; upper: number };
  /** Población total que la cascada VIVA (no el dataset congelado) asignó a esta etapa. */
  readonly livePoolSize: number;
  readonly estCorrectInPool: number;
}

function buildStageReport(stage: string, sampled: readonly LabeledSample[], livePoolSize: number): StageReport {
  const decided = sampled.filter((s) => s.label !== "dudosa");
  const correct = decided.filter((s) => s.label === "correcta").length;
  const incorrect = decided.filter((s) => s.label === "incorrecta").length;
  const dudosa = sampled.length - decided.length;
  const rate = decided.length > 0 ? correct / decided.length : 0;
  return {
    stage,
    sampledN: sampled.length,
    sampledCorrect: correct,
    sampledIncorrect: incorrect,
    sampledDudosa: dudosa,
    rate,
    rateWilson: wilsonInterval(correct, decided.length),
    livePoolSize,
    estCorrectInPool: rate * livePoolSize,
  };
}

function formatStageReport(r: StageReport): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    `  ${r.stage.padEnd(16)} muestreado ${r.sampledCorrect}/${r.sampledN - r.sampledDudosa} correctas ` +
    `(${pct(r.rate)}, Wilson95 [${pct(r.rateWilson.lower)}, ${pct(r.rateWilson.upper)}])` +
    `${r.sampledDudosa > 0 ? ` · ${r.sampledDudosa} dudosa(s) excluida(s)` : ""}` +
    ` — población viva ${r.livePoolSize}, correctas estimadas ≈ ${r.estCorrectInPool.toFixed(1)}`
  );
}

const { rootDir, skipReason } = resolveRootDirOrSkipReason();
const test = skipReason ? it.skip : it;

describe("compuerta de precisión/recall de referencias — CONTRATO-F3.md §3.5 (SOLO jekyll/Ruby, ver docstring)", () => {
  test(
    skipReason
      ? `SKIP: ${skipReason}`
      : "el puerto TS de la cascada del probe reproduce las poblaciones por etapa que generaron el dataset",
    async () => {
      const dataset = loadLabeledDataset(LABELED_DATASET_PATH);
      const { summary } = await runProbeCascade(rootDir as string);

      // Si esto no coincide, o el puerto TS divergió del script que generó
      // `labeled-dataset.json`, o el checkout de jekyll cambió pese al sha
      // igual (no debería pasar) — cualquiera de las dos invalida el cruce
      // por `(from, symbol)` de más abajo, así que es un fallo duro, no una
      // advertencia. `files` (89 .rb bajo `jekyll/lib`) sale de
      // `spikes/cascada-refs/RESULTADO.md` §Método, no de un repo privado.
      expect(summary.files, "cantidad de archivos .rb bajo jekyll/lib").toBe(89);
      expect(summary.rowsAccepted).toBe(dataset.poolSizes.accepted);
      expect(summary.rowsRejectedRole).toBe(dataset.poolSizes.role);
      expect(summary.rowsRejectedMember).toBe(dataset.poolSizes.member);
      expect(summary.rowsRejectedScope).toBe(dataset.poolSizes.scope);
    },
    60_000,
  );

  test(
    skipReason
      ? `SKIP: ${skipReason}`
      : `precisión ≥ ${PRECISION_GATE} sobre lo aceptado (cláusula 1) + recall por etapa impreso (cláusula 2)`,
    async () => {
      const dataset = loadLabeledDataset(LABELED_DATASET_PATH);
      const { rows } = await runProbeCascade(rootDir as string);
      const byKey = new Map<string, CascadeOutcome>(rows.map((r) => [candidateKey(r.from, r.symbol), r]));

      const missing: string[] = [];
      const staleStratum: string[] = [];
      for (const s of dataset.sample) {
        const row = byKey.get(candidateKey(s.from, s.symbol));
        if (!row) {
          missing.push(`#${s.id} ${s.from}::${s.symbol} — no está entre los candidatos vivos de runProbeCascade`);
          continue;
        }
        const expectedStage = s.stratum === "accepted" ? "global-uniqueness" : STRATUM_TO_REJECT_STAGE[s.stratum];
        if (row.finalStage !== expectedStage) {
          staleStratum.push(
            `#${s.id} ${s.from}::${s.symbol} — estrato "${s.stratum}" (esperaba etapa "${expectedStage}") pero la corrida viva la asignó a "${row.finalStage}"`,
          );
        }
      }
      expect(missing, missing.join("\n")).toHaveLength(0);
      expect(staleStratum, staleStratum.join("\n")).toHaveLength(0);

      // ── Cláusula 1 — precisión sobre lo aceptado ──────────────────────
      const acceptedSample = dataset.sample.filter((s) => s.stratum === "accepted");
      const acceptedReport = buildStageReport("accepted", acceptedSample, dataset.poolSizes.accepted);
      const precision = acceptedReport.rate;

      // ── Cláusula 2 — recall por etapa, siempre impreso ────────────────
      const rejectStrata: readonly (keyof typeof STRATUM_TO_REJECT_STAGE)[] = ["role", "member", "scope"];
      const rejectReports = rejectStrata.map((stratum) =>
        buildStageReport(
          STRATUM_TO_REJECT_STAGE[stratum],
          dataset.sample.filter((s) => s.stratum === stratum),
          dataset.poolSizes[stratum],
        ),
      );

      const estTotalCorrectLost = rejectReports.reduce((sum, r) => sum + r.estCorrectInPool, 0);
      const estTotalCorrectUniverse = acceptedReport.livePoolSize + estTotalCorrectLost;
      const recallEstimate = estTotalCorrectUniverse > 0 ? acceptedReport.livePoolSize / estTotalCorrectUniverse : null;

      const lines = [
        "",
        "════════════════════════════════════════════════════════════════════",
        "COMPUERTA F3 — precisión/recall de referencias (jekyll/lib, Ruby, ÚNICO repo medido)",
        "════════════════════════════════════════════════════════════════════",
        `Cláusula 1 — precisión sobre lo aceptado: ${(precision * 100).toFixed(1)}% ` +
          `(Wilson95 inferior ${(acceptedReport.rateWilson.lower * 100).toFixed(1)}%) — gate ${(PRECISION_GATE * 100).toFixed(0)}%: ` +
          `${precision >= PRECISION_GATE ? "PASA" : "FALLA"}`,
        "",
        "Cláusula 2 — recall estimado POR ETAPA (informativo, no rompe el build):",
        formatStageReport(acceptedReport) + " [aceptación]",
        ...rejectReports.map(formatStageReport),
        `  recall global estimado ≈ ${recallEstimate === null ? "n/d" : (recallEstimate * 100).toFixed(1) + "%"} ` +
          `(${acceptedReport.livePoolSize} aceptadas / ≈${estTotalCorrectUniverse.toFixed(1)} correctas estimadas en el universo)`,
        "",
        "HONESTIDAD: lo de arriba es UN repo (jekyll) y UN lenguaje (Ruby). No es una garantía universal.",
        "Corre contra probe-cascade.ts (4 etapas), NO contra la cascada real de graph/resolve.ts + graph/stages.ts —",
        "ver el docstring de este archivo, sección 'CABLEADO A LA CASCADA REAL', para qué falta.",
        "════════════════════════════════════════════════════════════════════",
        "",
      ];
      // eslint-disable-next-line no-console
      console.log(lines.join("\n"));

      expect(
        precision,
        `precisión ${(precision * 100).toFixed(1)}% por debajo del gate ${(PRECISION_GATE * 100).toFixed(0)}% — ver el reporte impreso arriba`,
      ).toBeGreaterThanOrEqual(PRECISION_GATE);
    },
    60_000,
  );
});
