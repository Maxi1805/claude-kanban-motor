/**
 * OLA U · INTEGRADOR — agrega los 13 JSON de `u-int-censo.mts` en las dos tablas del cierre:
 * NIVEL 2 por patrón × estado × lenguaje, y el cruce de NIVEL 1 por (kind, lenguaje).
 *
 * Uso: npx tsx scripts/u-int-agregar.mts <dir-con-los-json> [--json salida.json]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

interface Row {
  id: string;
  repo: string;
  kind: string;
  pattern: string;
  state: string;
  lang: string;
  file: string;
  line: number;
  confidence: string | null;
}
interface KindLangRow {
  kind: string;
  lang: string;
  n: number;
}

const STATES = ["ausente", "parcial", "ya-aplicado", "aplicado-eludido"] as const;

const dir = process.argv[2] ?? "/tmp/u-int";
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;

const rows: Row[] = [];
const kindLang: KindLangRow[] = [];
const perRepo: { repo: string; findings: number; hyps: number }[] = [];

for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const data = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as {
    slug: string;
    totalFindings: number;
    rows: Row[];
    kindLangRows: KindLangRow[];
  };
  rows.push(...data.rows);
  kindLang.push(...data.kindLangRows);
  perRepo.push({ repo: data.slug, findings: data.totalFindings, hyps: data.rows.length });
}

const patterns = [...new Set(rows.map((r) => r.pattern))].sort();
console.log("## NIVEL 2 — por patrón × estado × lenguaje\n");
console.log("| Patrón | ausente | parcial | ya-aplicado | aplicado-eludido | total | reales | idiomas |");
console.log("|---|---:|---:|---:|---:|---:|---:|---|");
let tot = 0;
let totReales = 0;
let totNoRec = 0;
const patternTable: Record<string, { states: Record<string, number>; total: number; reales: number; byLang: Record<string, number> }> = {};
for (const p of patterns) {
  const rs = rows.filter((r) => r.pattern === p);
  const st: Record<string, number> = {};
  for (const s of STATES) st[s] = rs.filter((r) => r.state === s).length;
  const reales = st["ausente"]! + st["parcial"]!;
  const byLang: Record<string, number> = {};
  for (const r of rs) byLang[r.lang] = (byLang[r.lang] ?? 0) + 1;
  tot += rs.length;
  totReales += reales;
  totNoRec += st["ya-aplicado"]! + st["aplicado-eludido"]!;
  patternTable[p] = { states: st, total: rs.length, reales, byLang };
  const langs = Object.entries(byLang)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `${l}=${n}`)
    .join(", ");
  console.log(
    `| ${p} | ${st["ausente"]} | ${st["parcial"]} | ${st["ya-aplicado"]} | ${st["aplicado-eludido"]} | **${rs.length}** | **${reales}** | ${langs} |`,
  );
}
console.log(
  `\n**TOTAL: ${tot} hipótesis · ${totReales} recomendaciones reales (${((100 * totReales) / tot).toFixed(1)} %) · ` +
    `${totNoRec} no-recomendación (${((100 * totNoRec) / tot).toFixed(1)} %) · ${patterns.length} patrones con población.**\n`,
);

console.log("## Por repo\n");
console.log("| repo | hallazgos | hipótesis |");
console.log("|---|---:|---:|");
let fTot = 0;
for (const r of perRepo.sort((a, b) => a.repo.localeCompare(b.repo))) {
  console.log(`| ${r.repo} | ${r.findings} | ${r.hyps} |`);
  fTot += r.findings;
}
console.log(`| **TOTAL** | **${fTot}** | **${tot}** |\n`);

// ---- TABLA DE ANCLAS: kind dominante por patrón
console.log("## Ancla dominante por patrón (kind del hallazgo que la sostiene)\n");
console.log("| Patrón | total | ancla dominante | n | % | otras anclas |");
console.log("|---|---:|---|---:|---:|---|");
const anchors: Record<string, { kind: string; n: number }[]> = {};
for (const p of patterns) {
  const rs = rows.filter((r) => r.pattern === p);
  const byKind = new Map<string, number>();
  for (const r of rs) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
  const sorted = [...byKind].sort((a, b) => b[1] - a[1]).map(([kind, n]) => ({ kind, n }));
  anchors[p] = sorted;
  const top = sorted[0]!;
  const rest = sorted
    .slice(1)
    .map((x) => `${x.kind} ${x.n}`)
    .join(", ");
  console.log(`| ${p} | ${rs.length} | \`${top.kind}\` | ${top.n} | ${((100 * top.n) / rs.length).toFixed(0)} % | ${rest || "—"} |`);
}

// ---- Nivel 1: cruce (kind, lenguaje)
const kl = new Map<string, number>();
for (const r of kindLang) kl.set(`${r.kind}|${r.lang}`, (kl.get(`${r.kind}|${r.lang}`) ?? 0) + r.n);
const klObj: Record<string, number> = {};
for (const [k, n] of kl) klObj[k] = n;

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ patternTable, anchors, kindLang: klObj, perRepo, rows }, null, 1));
  console.error(`-> ${jsonOut}`);
}
