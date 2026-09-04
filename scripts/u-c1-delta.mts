/**
 * C1 (Ola U) — DELTA por kind entre dos volcados de `dump-hallazgos.mts`
 * (antes/después del mismo repo). Sólo resta; no interpreta.
 *
 * Uso: npx tsx scripts/u-c1-delta.mts <base.json> <post.json>
 */
import { readFileSync } from "node:fs";

const [, , a, b] = process.argv;
type Dump = { dir: string; total: number; porKind: Record<string, { n: number }> };
const A = JSON.parse(readFileSync(a!, "utf8")) as Dump;
const B = JSON.parse(readFileSync(b!, "utf8")) as Dump;
const kinds = [...new Set([...Object.keys(A.porKind), ...Object.keys(B.porKind)])].sort();
const lines: string[] = [];
for (const k of kinds) {
  const na = A.porKind[k]?.n ?? 0;
  const nb = B.porKind[k]?.n ?? 0;
  if (na !== nb) lines.push(`  ${k}: ${na} -> ${nb} (${nb - na >= 0 ? "+" : ""}${nb - na})`);
}
console.log(`${A.dir}: total ${A.total} -> ${B.total} (${B.total - A.total >= 0 ? "+" : ""}${B.total - A.total})`);
for (const l of lines) console.log(l);
