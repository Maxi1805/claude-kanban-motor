/**
 * OLA U · INTEGRADOR — precisión del NIVEL 2 sobre el corpus, con Wilson 95 % y la CUARTA
 * categoría que el nivel 2 tiene y el nivel 1 no: `problema-si-patron-no` (el problema que
 * el ancla señala es real, pero el patrón propuesto NO es la respuesta). Se reporta APARTE,
 * nunca fundida con `falso`: son dos arreglos distintos — un `falso` pide apagar el ancla o
 * el chequeo; un `problema-si-patron-no` pide cambiar EL PATRÓN que se propone.
 *
 * DOS FUENTES DE VEREDICTO, con la misma regla de vigencia para las dos:
 *  1. Las planillas `tests/golden/precision/<slug>.hypotheses.csv` (línea base de M0). Una
 *     fila de M0 sólo se cuenta si la hipótesis SIGUE VIVA hoy en la misma ubicación Y CON
 *     EL MISMO ESTADO — un veredicto contesta "¿el código sostiene ESTA afirmación?", y si
 *     la afirmación cambió de estado el veredicto quedó vencido. De las 104 filas de M0,
 *     82 pasan ese filtro.
 *  2. El JSON de veredictos del integrador, para la población NUEVA que los frentes
 *     crearon (Strategy +62, Template Method reescrito, Decorator/CoR/Command movidos).
 *
 * Uso: npx tsx scripts/u-int-precision-nivel2.mts <censo-agregado.json> <veredictos.json>
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parseCsv } from "../src/server/services/detect/precision/csv.js";
import { wilsonInterval } from "../src/server/services/graph/gate/wilson.js";

const CORPUS = new Set([
  "click", "cobra", "eslint", "guava", "hugo", "jekyll", "lodash",
  "nest", "newtonsoft-json", "preact", "rubocop", "sqlalchemy", "vueuse",
]);
const PRECISION_DIR = path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");

interface Veredicto {
  pattern: string;
  verdict: string;
  fuente: "M0" | "integrador";
}

const [, , censoPath, veredictosPath] = process.argv;
if (!censoPath || !veredictosPath) {
  console.error("Uso: npx tsx scripts/u-int-precision-nivel2.mts <censo-agregado.json> <veredictos.json>");
  process.exit(1);
}

const censo = JSON.parse(readFileSync(censoPath, "utf8")) as {
  patternTable: Record<string, { total: number; reales: number }>;
  rows: { pattern: string; repo: string; file: string; line: number; state: string }[];
};
const vivos = new Map<string, string>();
for (const r of censo.rows) vivos.set(`${r.pattern}|${r.repo}|${r.file}|${r.line}`, r.state);

const veredictos: Veredicto[] = [];
let m0Total = 0;
let m0Vencidos = 0;
for (const file of readdirSync(PRECISION_DIR).filter((f) => f.endsWith(".hypotheses.csv"))) {
  const slug = file.slice(0, file.indexOf("."));
  if (!CORPUS.has(slug)) continue;
  const { header, records } = parseCsv(readFileSync(path.join(PRECISION_DIR, file), "utf8"));
  if (header.length === 0) continue;
  const col = (name: string): number => header.indexOf(name);
  for (const row of records) {
    const id = row[col("id")] ?? "";
    if (!id.startsWith("u-m0::")) continue;
    m0Total++;
    const pattern = row[col("pattern")] ?? "";
    const key = `${pattern}|${slug}|${row[col("file")]}|${Number(row[col("startLine")])}`;
    if (vivos.get(key) !== row[col("state")]) {
      m0Vencidos++;
      continue;
    }
    veredictos.push({ pattern, verdict: row[col("verdict")] ?? "", fuente: "M0" });
  }
}
for (const v of JSON.parse(readFileSync(veredictosPath, "utf8")) as { pattern: string; verdict: string }[]) {
  veredictos.push({ pattern: v.pattern, verdict: v.verdict, fuente: "integrador" });
}

const patterns = [...new Set(veredictos.map((v) => v.pattern))].sort();
console.log("| Patrón | población | n (V+F) | V | F | precisión | Wilson 95 % | problema-si-patrón-no | dudoso |");
console.log("|---|---:|---:|---:|---:|---:|---|---:|---:|");
let tV = 0;
let tF = 0;
let tP = 0;
let tD = 0;
for (const p of patterns) {
  const mine = veredictos.filter((v) => v.pattern === p);
  const V = mine.filter((v) => v.verdict === "verdadero").length;
  const F = mine.filter((v) => v.verdict === "falso").length;
  const P = mine.filter((v) => v.verdict === "problema-si-patron-no").length;
  const D = mine.filter((v) => v.verdict === "dudoso").length;
  const n = V + F;
  const w = wilsonInterval(V, n);
  tV += V;
  tF += F;
  tP += P;
  tD += D;
  console.log(
    `| ${p} | ${censo.patternTable[p]?.total ?? 0} | ${n} | ${V} | ${F} | ` +
      `**${n === 0 ? "—" : `${Math.round((100 * V) / n)} %`}** | [${Math.round(w.lower * 100)} %, ${Math.round(w.upper * 100)} %] | ${P} | ${D} |`,
  );
}
const n = tV + tF;
const w = wilsonInterval(tV, n);
console.log(
  `| **GLOBAL** | **${Object.values(censo.patternTable).reduce((s, x) => s + x.total, 0)}** | **${n}** | **${tV}** | **${tF}** | ` +
    `**${Math.round((100 * tV) / n)} %** | **[${Math.round(w.lower * 100)} %, ${Math.round(w.upper * 100)} %]** | **${tP}** | **${tD}** |`,
);
console.log(
  `\nFilas juzgadas vigentes: ${veredictos.length} ` +
    `(M0 ${veredictos.filter((v) => v.fuente === "M0").length} de ${m0Total} — ${m0Vencidos} vencidas por cambio de estado o desaparición; ` +
    `integrador ${veredictos.filter((v) => v.fuente === "integrador").length}).`,
);
