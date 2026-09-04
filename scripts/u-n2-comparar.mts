/**
 * Ola U, frente N2 — tabla antes/después por repo y por estado, con la
 * distinción que de verdad importa: cuántas de las "recomendaciones"
 * (`ausente`+`parcial`) son RECOMENDACIONES CON CONTENIDO y cuántas son el
 * placeholder DIFERIDO de `template-method.ts#deferredStructuralHypothesis`
 * (un único check "familia-declarada-fuera-de-este-archivo-pendiente-de-grafo"
 * que dice, textualmente, que no se pudo confirmar nada).
 *
 * Uso: npx tsx scripts/u-n2-comparar.mts
 */
import fs from "node:fs";

const SLUGS = ["guava", "newtonsoft", "sqlalchemy", "nest", "rubocop", "jekyll", "eslint"];
const LANG: Record<string, string> = {
  guava: "Java",
  newtonsoft: "C#",
  sqlalchemy: "Python",
  nest: "TypeScript",
  rubocop: "Ruby",
  jekyll: "Ruby",
  eslint: "JavaScript",
};
const STATES = ["ausente", "parcial", "ya-aplicado", "aplicado-eludido"] as const;

interface Row {
  state: string;
  anchor: string;
  checks: { label: string; passed: boolean }[];
}

function isPlaceholder(r: Row): boolean {
  return r.checks.length === 1 && r.checks[0]!.label.startsWith("familia-declarada-fuera");
}

function load(path: string): Row[] | null {
  if (!fs.existsSync(path)) return null;
  return JSON.parse(fs.readFileSync(path, "utf8")).rows as Row[];
}

function summarize(rows: Row[]): Record<string, number> & { total: number; recs: number; recsReales: number; placeholders: number } {
  const out: Record<string, number> = {};
  for (const s of STATES) out[s] = 0;
  let placeholders = 0;
  for (const r of rows) {
    out[r.state] = (out[r.state] ?? 0) + 1;
    if (isPlaceholder(r)) placeholders++;
  }
  const recs = (out["ausente"] ?? 0) + (out["parcial"] ?? 0);
  return { ...out, total: rows.length, recs, recsReales: recs - placeholders, placeholders } as never;
}

const header = ["repo", "lenguaje", "total", ...STATES, "recs", "placeholders", "recs REALES"];
const lines: string[][] = [];
const acc = { antes: { total: 0, recs: 0, recsReales: 0, placeholders: 0 }, despues: { total: 0, recs: 0, recsReales: 0, placeholders: 0 } };
const perState: Record<string, { antes: number; despues: number }> = {};
for (const s of STATES) perState[s] = { antes: 0, despues: 0 };

for (const slug of SLUGS) {
  for (const fase of ["antes", "despues"] as const) {
    const rows = load(`/tmp/u-n2-${fase}-${slug}.json`);
    if (!rows) {
      lines.push([slug, LANG[slug] ?? "?", `(${fase}: SIN DATO)`, "", "", "", "", "", "", ""]);
      continue;
    }
    const s = summarize(rows);
    lines.push([`${slug} (${fase})`, LANG[slug] ?? "?", String(s.total), ...STATES.map((k) => String(s[k] ?? 0)), String(s.recs), String(s.placeholders), String(s.recsReales)]);
    acc[fase].total += s.total;
    acc[fase].recs += s.recs;
    acc[fase].recsReales += s.recsReales;
    acc[fase].placeholders += s.placeholders;
    for (const k of STATES) perState[k]![fase] += s[k] ?? 0;
  }
}

const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => (l[i] ?? "").length)));
const fmt = (cells: string[]): string => cells.map((c, i) => (c ?? "").padEnd(widths[i]!)).join(" | ");
console.log(fmt(header));
console.log(widths.map((w) => "-".repeat(w)).join("-+-"));
for (const l of lines) console.log(fmt(l));
console.log();
console.log("TOTAL por estado (antes -> después):");
for (const k of STATES) console.log(`  ${k.padEnd(18)} ${String(perState[k]!.antes).padStart(4)} -> ${String(perState[k]!.despues).padStart(4)}`);
console.log(`  ${"TOTAL hipótesis".padEnd(18)} ${String(acc.antes.total).padStart(4)} -> ${String(acc.despues.total).padStart(4)}`);
console.log(`  ${"recomendaciones".padEnd(18)} ${String(acc.antes.recs).padStart(4)} -> ${String(acc.despues.recs).padStart(4)}`);
console.log(`  ${"  de ellas vacías".padEnd(18)} ${String(acc.antes.placeholders).padStart(4)} -> ${String(acc.despues.placeholders).padStart(4)}`);
console.log(`  ${"RECS REALES".padEnd(18)} ${String(acc.antes.recsReales).padStart(4)} -> ${String(acc.despues.recsReales).padStart(4)}`);
