/**
 * EL INSTRUMENTO DE PRECISIÓN, mitad 2 de 2 (la que NO corre el analizador)
 * — calcula precisión por `kind` a partir de la(s) planilla(s) ya juzgadas.
 * Separado de `sample-findings-for-judgment.mts` a propósito: ese script
 * muestrea (pesado, corre `analyzeRepo`); éste sólo lee CSV y calcula
 * (liviano, se puede correr después de cargar dos veredictos sin esperar un
 * análisis completo de nuevo).
 *
 * Uso:
 *   npx tsx scripts/precision-report.mts tests/golden/precision/*.verdicts.csv [--by-language] [--all]
 *
 * Pasar varios archivos agrega TODAS sus filas en un solo reporte por kind
 * (cruza poblaciones — útil para "cuántos casos reales de `demeter-chain`
 * vimos en total"); pasar uno solo da el reporte de esa población sola.
 *
 * `--by-language` agrega el desglose por `(kind, lenguaje)`
 * (`report.ts#buildPrecisionReportByLanguage`) — la pregunta que responde:
 * "`demeter-chain` en Java, ¿cuántos juzgados y qué precisión, con
 * intervalo?", en vez del promedio por kind que mezcla todos los lenguajes.
 * Una celda con `judged` por debajo de `MIN_JUDGED_FOR_SIGNAL` se marca
 * "BASE INSUFICIENTE" en vez de mostrar un porcentaje sin base.
 *
 * Por defecto sólo filas `stillPresent` (vigentes) entran al cálculo — el
 * mismo criterio de `gate-logic.ts#evaluateGate` (una fila que el detector
 * ya no emite no debería contar como si fuera el estado actual). `--all`
 * agrega también las filas muertas, para auditar contra el histórico.
 */
import { readPrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";
import {
  buildPrecisionReport,
  buildPrecisionReportByLanguage,
  formatPrecisionReport,
  formatPrecisionReportByLanguage,
} from "../src/server/services/detect/precision/report.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const byLanguage = argv.includes("--by-language");
  const includeDead = argv.includes("--all");
  const files = argv.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("Uso: npx tsx scripts/precision-report.mts <archivo.csv> [más...] [--by-language] [--all]");
    process.exit(1);
  }

  const allRows = files.flatMap((f) => readPrecisionCsv(f));
  if (allRows.length === 0) {
    console.error(`Sin filas en: ${files.join(", ")} — ¿archivo(s) vacíos o inexistentes?`);
    process.exit(1);
  }
  const rows = includeDead ? allRows : allRows.filter((r) => r.stillPresent);

  console.log(formatPrecisionReport(buildPrecisionReport(rows)));

  if (byLanguage) {
    console.log("\n— por (kind, lenguaje) —");
    console.log(formatPrecisionReportByLanguage(buildPrecisionReportByLanguage(rows)));
  }

  const judged = rows.filter((r) => r.verdict !== "").length;
  const dudoso = rows.filter((r) => r.verdict === "dudoso").length;
  const deadNote = includeDead ? "" : ` (${allRows.length - rows.length} fila(s) muerta(s) excluida(s) — pasar --all para incluirlas)`;
  console.log(
    `\nTotal: ${rows.length} muestreados${deadNote} · ${judged} juzgados (${dudoso} dudoso(s) entre ellos) · ` +
      `${rows.length - judged} pendiente(s).`,
  );
}

main();
