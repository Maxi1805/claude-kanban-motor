/**
 * EL INSTRUMENTO DE PRECISIÓN, mitad 1 de 2 (la que corre el analizador) —
 * genera o AMPLÍA la planilla de juicio manual de UNA población real: hasta
 * `--n` hallazgos por `kind`, muestra determinista (semilla fija, Fisher-
 * Yates propio — `detect/precision/rng.ts` — nunca `Math.random()`),
 * UPSERT sobre lo ya juzgado (nunca pisa un veredicto cargado — ver
 * `detect/precision/verdicts-io.ts#mergeRows`).
 *
 * POR QUÉ EXISTE: `census.ts`/`census.mts` miden RECALL — ¿el detector
 * SIGUE disparando lo mismo que antes? — nunca VERACIDAD: ¿lo que dispara
 * es cierto? No había, antes de esto, ningún instrumento en este repo que
 * muestreara HALLAZGOS reales de un detector para que un humano los juzgue
 * verdadero/falso; la única compuerta de precisión que existía
 * (`graph/gate/precision-recall.test.ts`) mide aristas del grafo de
 * referencias, no los `Finding`s que el usuario ve en el panel.
 *
 * UN REPO POR PROCESO — misma regla que `census.mts`/`measure-hypothesis-
 * states.mts` (dos análisis en el mismo proceso node corrompen el caché de
 * `require` de `web-tree-sitter`, ver `code-analyzer.ts#loadRuntime`).
 *
 * Uso:
 *   npx tsx scripts/sample-findings-for-judgment.mts <dir> <slug> [--n=15] [--seed=1805] [--out=ruta.csv]
 *
 * Sin `--out`: escribe/amplía `tests/golden/precision/<slug>.verdicts.csv`.
 * Corrida repetida sobre el mismo `--out` (mismo slug, incluso después de
 * que el repo haya cambiado, o subiendo `--n`) hace TOP-UP, nunca
 * sobrescribe un `verdict`/`patternFit`/`note` ya cargado — ver el
 * docstring de `detect/precision/verdicts-io.ts#mergeRows`.
 *
 * QUÉ JUZGAR EN CADA FILA (a mano, columna `verdict` del CSV):
 *   verdadero — leyendo `file:startLine` (columna `evidence` es sólo un
 *     adelanto de una línea, no el reemplazo de mirar el código citado), el
 *     problema que describen `title`/`detail` es real: un revisor sin
 *     conocimiento especial del dominio de ESTE repo estaría de acuerdo en
 *     que hay un problema de diseño o mantenibilidad ahí.
 *   falso — la condición sintáctica dispara pero no hay problema real (un
 *     idiomatismo de lenguaje/plataforma, una API fluida, un método de
 *     ciclo de vida con un llamador que el detector no puede ver, etc.).
 *   dudoso — no se puede decidir con la evidencia visible sin conocimiento
 *     que sólo tiene quien mantiene ese código — se EXCLUYE del cálculo de
 *     precisión (mismo criterio que `LabelVerdict` en
 *     `graph/gate/labeled-dataset.ts`).
 * Si la columna `pattern` no está vacía Y `verdict = verdadero`, juzgar
 * TAMBIÉN `patternFit`: dado que el problema es real, ¿el patrón propuesto
 * es el remedio correcto (no sobre-ingeniería, ataca la causa real, no un
 * patrón elegido porque "algo tenía que sugerirse")? Esa es la cifra que
 * más importa: el producto son las recomendaciones de patrón, no los
 * smells sueltos — un ancla verdadera con un patrón mal elegido sigue
 * siendo una mala recomendación.
 *
 * Una vez juzgado, `npx tsx scripts/precision-report.mts <csv...>` (o
 * `npx vitest run detect/precision/gate.test.ts`) calcula la precisión por
 * kind sin volver a analizar nada.
 *
 * RECONCILIACIÓN POR CONTENIDO (defecto 1) — antes de escribir, cada fila
 * huérfana de `existing` (su `id` ya no está en el pool vivo de esta
 * corrida) se busca por `contentFindingKey` (`kind`+`file`+`symbol`+`title`)
 * contra TODO `analysis.findings`, no sólo lo muestreado — si el hallazgo,
 * para quien lo juzgó, sigue siendo el mismo bajo un id nuevo (un detector
 * que empezó a adjuntar/sacar una ubicación secundaria), migra: conserva el
 * veredicto, adopta el id nuevo. Ver `detect/precision/verdicts-io.ts#mergeRows`.
 *
 * LENGUAJE POR FILA (defecto 3) — se resuelve contra `analysis.files`
 * (`CodeFileSummary.language`, la MISMA fuente que alimenta el mapa de
 * hotspots), nunca inferido del `slug`: un repo puede mezclar lenguajes
 * (`vueuse`: TS y Vue; `preact`: JS y JSX). Se backfillea también en filas
 * `existing` que todavía no lo traían (planillas de antes de este campo).
 */
import fs from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import {
  buildLiveContentKeyIndex,
  selectSample,
  toPrecisionRow,
} from "../src/server/services/detect/precision/sample.js";
import { mergeRows, readPrecisionCsv, writePrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";
import {
  buildPrecisionReport,
  buildPrecisionReportByLanguage,
  formatPrecisionReport,
  formatPrecisionReportByLanguage,
} from "../src/server/services/detect/precision/report.js";
import type { CodeFinding } from "../src/shared/types.js";

/** Fija — cambiarla invalida la reproducibilidad de toda muestra generada hasta ahora (una corrida con otra semilla NO es "la misma planilla ampliada", es otro sorteo). */
const DEFAULT_SEED = 1805;
const DEFAULT_N = 15;
const MAX_EVIDENCE_CHARS = 180;

interface Args {
  dir: string;
  slug: string;
  n: number;
  seed: number;
  out: string;
}

function parseArgs(argv: readonly string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = new Map<string, string>();
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    flags.set(eq === -1 ? a.slice(2) : a.slice(2, eq), eq === -1 ? "true" : a.slice(eq + 1));
  }
  const [dir, slug] = positional;
  if (!dir || !slug) {
    console.error(
      "Uso: npx tsx scripts/sample-findings-for-judgment.mts <dir> <slug> [--n=15] [--seed=1805] [--out=ruta.csv]",
    );
    process.exit(1);
  }
  return {
    dir: path.resolve(dir),
    slug,
    n: Number(flags.get("n") ?? DEFAULT_N),
    seed: Number(flags.get("seed") ?? DEFAULT_SEED),
    out: flags.get("out") ?? path.resolve("tests/golden/precision", `${slug}.verdicts.csv`),
  };
}

/** Línea de código en `file:startLine`, recortada — un adelanto, nunca el reemplazo de abrir el archivo. `""` si el archivo no se puede leer (no debería pasar contra el mismo `dir` recién analizado, pero un símlink roto u otra rareza del filesystem no tiene por qué tumbar el muestreo entero). */
function evidenceLine(rootDir: string, file: string, startLine: number): string {
  if (!file) return "";
  try {
    const text = fs.readFileSync(path.join(rootDir, file), "utf8");
    const raw = text.split(/\r?\n/)[startLine - 1] ?? "";
    const trimmed = raw.trim();
    return trimmed.length > MAX_EVIDENCE_CHARS ? trimmed.slice(0, MAX_EVIDENCE_CHARS - 3) + "..." : trimmed;
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const { dir, slug, n, seed, out } = parseArgs(process.argv.slice(2));

  const t0 = performance.now();
  const { analysis, cache } = await analyzeRepoCached({
    dir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  const wallMs = Math.round(performance.now() - t0);
  console.error(`[analyzer-cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)}`);

  // `analysis.files` (`CodeFileSummary.language`) — la misma fuente que el
  // mapa de hotspots, resuelta por ARCHIVO, no por slug: un repo puede
  // mezclar lenguajes (ver el docstring del módulo).
  const fileLanguage = new Map(analysis.files.map((f) => [f.path, f.language]));
  const languageOf = (f: CodeFinding): string => fileLanguage.get(f.locations[0]?.file ?? "") ?? "";

  const selected = selectSample(analysis.findings, { slug, n, seedBase: seed, languageOf });
  const fresh = [...selected.values()]
    .flat()
    .map((f) =>
      toPrecisionRow(f, slug, evidenceLine(dir, f.locations[0]?.file ?? "", f.locations[0]?.startLine ?? 0), languageOf(f)),
    );

  // El POOL VIVO son TODOS los hallazgos de esta corrida, no los muestreados:
  // `stillPresent` tiene que decir "el detector ya no lo emite", nunca "el
  // sorteo no lo eligió esta vez" — ver `verdicts-io.ts#mergeRows`.
  const liveContentKeyById = buildLiveContentKeyIndex(analysis.findings);
  const livePool = new Set(liveContentKeyById.keys());

  const existing = readPrecisionCsv(out);
  const merged = mergeRows(existing, fresh, livePool, liveContentKeyById)
    // Backfill de `language` — filas heredadas de antes de este campo (o que
    // `mergeRows` conservó tal cual porque ya estaban juzgadas) no lo traen;
    // se resuelve acá con la MISMA fuente que las filas frescas, nunca se
    // pisa un valor ya presente.
    .map((r) => (r.language ? r : { ...r, language: fileLanguage.get(r.file) ?? "" }));
  writePrecisionCsv(out, merged);

  const newRows = merged.length - existing.length;
  console.error(
    `[precision-sample] ${slug}: ${analysis.findings.length} hallazgos totales, ${selected.size} celda(s) kind×lenguaje con ≥1, ` +
      `${newRows} fila(s) nueva(s) → ${merged.length} totales en ${out} (analyzeRepo: ${wallMs}ms).`,
  );
  console.error(formatPrecisionReport(buildPrecisionReport(merged)));
  console.error("\n— por (kind, lenguaje) —");
  console.error(formatPrecisionReportByLanguage(buildPrecisionReportByLanguage(merged)));
}

main();
