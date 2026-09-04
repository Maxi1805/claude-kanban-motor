/**
 * C1 (Ola U) — tabla de hipótesis por patrón × estado × repo, leída de los
 * volcados de `dump-hallazgos.mts`. Sólo cuenta; no analiza nada.
 *
 * Uso: npx tsx scripts/u-c1-tally.mts <prefijo> <archivo.json...>
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const [, , ...files] = process.argv;
type Row = { pattern: string; state: string };
const byPattern = new Map<string, Map<string, number>>();
const byPatternRepo = new Map<string, Map<string, Map<string, number>>>();

for (const f of files) {
  const repo = path.basename(f).replace(/\.json$/, "").replace(/^[a-z0-9]+-/, "");
  const data = JSON.parse(readFileSync(f, "utf8")) as { findings: { hypotheses: Row[] }[] };
  for (const find of data.findings) {
    for (const h of find.hypotheses ?? []) {
      const m = byPattern.get(h.pattern) ?? new Map<string, number>();
      m.set(h.state, (m.get(h.state) ?? 0) + 1);
      byPattern.set(h.pattern, m);
      const r = byPatternRepo.get(h.pattern) ?? new Map<string, Map<string, number>>();
      const rm = r.get(repo) ?? new Map<string, number>();
      rm.set(h.state, (rm.get(h.state) ?? 0) + 1);
      r.set(repo, rm);
      byPatternRepo.set(h.pattern, r);
    }
  }
}

const STATES = ["ausente", "parcial", "ya-aplicado", "aplicado-eludido"];
const rec = (m: Map<string, number>): number => (m.get("ausente") ?? 0) + (m.get("parcial") ?? 0);
let totalAll = 0;
let totalRec = 0;
console.log("patrón\t" + STATES.join("\t") + "\tTOTAL\tRECOMENDACIONES");
for (const [p, m] of [...byPattern].sort((a, b) => a[0].localeCompare(b[0]))) {
  const tot = [...m.values()].reduce((a, b) => a + b, 0);
  totalAll += tot;
  totalRec += rec(m);
  console.log(`${p}\t${STATES.map((s) => m.get(s) ?? 0).join("\t")}\t${tot}\t${rec(m)}`);
}
console.log(`TOTAL\t\t\t\t\t${totalAll}\t${totalRec}`);

console.log("\n--- por repo (sólo patrones pedidos) ---");
for (const p of ["Composite", "Decorator", "Chain of Responsibility", "Proxy"]) {
  const r = byPatternRepo.get(p);
  if (!r) {
    console.log(`${p}: CERO en todos los repos`);
    continue;
  }
  for (const [repo, m] of [...r].sort()) {
    console.log(`${p}\t${repo}\t${STATES.map((s) => `${s}=${m.get(s) ?? 0}`).join(" ")}\trec=${rec(m)}`);
  }
}
