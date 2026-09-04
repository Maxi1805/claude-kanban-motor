/**
 * OLA U · INTEGRADOR — imprime, para UN repo, el texto completo de las hipótesis que caen en
 * las ubicaciones pedidas: qué afirma cada una, qué checks pasó y qué pide confirmar.
 *
 * Existe para poder JUZGAR el nivel 2 leyendo lo que el sistema DICE, no adivinándolo desde
 * el nombre del patrón. Un veredicto de nivel 2 contesta "¿el código citado sostiene ESTA
 * afirmación?", así que hace falta la afirmación textual.
 *
 * Uso: npx tsx scripts/u-int-detalle-hipotesis.mts <dir> <slug> <patrón>:<archivo>:<línea> [...]
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const [, , dir, slug, ...specs] = process.argv;
if (!dir || !slug || specs.length === 0) {
  console.error("Uso: npx tsx scripts/u-int-detalle-hipotesis.mts <dir> <slug> <patrón>:<archivo>:<línea> ...");
  process.exit(1);
}

const wanted = specs.map((s) => {
  const i = s.indexOf(":");
  const j = s.lastIndexOf(":");
  return { pattern: s.slice(0, i), file: s.slice(i + 1, j), line: Number(s.slice(j + 1)) };
});

const { analysis } = await analyzeRepoCached({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });

for (const w of wanted) {
  const finding = analysis.findings.find(
    (f) => f.locations[0]?.file === w.file && f.locations[0]?.startLine === w.line && (f.hypotheses ?? []).some((h) => h.pattern === w.pattern),
  );
  if (!finding) {
    console.log(`\n### NO ENCONTRADO ${w.pattern} @ ${w.file}:${w.line}`);
    continue;
  }
  const h = finding.hypotheses!.find((x) => x.pattern === w.pattern)!;
  console.log(`\n### ${w.pattern} · ${h.state} · ${w.file}:${w.line}`);
  console.log(`ANCLA ${finding.kind}: ${finding.title}`);
  console.log(`ubicaciones: ${finding.locations.slice(0, 6).map((l) => `${l.file}:${l.startLine}${l.symbol ? ` (${l.symbol})` : ""}`).join(" · ")}`);
  console.log(`fuente: ${h.source}`);
  console.log(`checks: ${h.checks.map((c) => `[${c.passed ? "OK" : "--"}] ${c.label}: ${c.why}`).join("\n        ")}`);
  if (h.toConfirm.length) console.log(`toConfirm: ${h.toConfirm.join(" | ")}`);
  if (h.places.length) console.log(`places: ${h.places.slice(0, 6).map((p) => `${p.file}:${p.startLine}${p.symbol ? ` (${p.symbol})` : ""}`).join(" · ")}`);
}
