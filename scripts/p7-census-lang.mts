/**
 * Sonda P7 (Ola P) — censo por (kind, lenguaje) para los tres kinds del frente
 * (`parallel-hierarchies`, `distributed-duplication`, `manual-notification`),
 * sobre UNA lista de repos pasada por línea de comandos. Usa `censusRepo`
 * (el mismo instrumento oficial del proyecto) y cruza cada clave
 * `archivo|hallazgo:kind` con la clave hermana `archivo|archivo:lenguaje`
 * para poder desglosar por lenguaje — el `Census` no lo hace nativamente.
 *
 * Uso: npx tsx scripts/p7-census-lang.mts <slug1>=<dir1> [<slug2>=<dir2> ...]
 */
import { censusRepo } from "../src/server/services/census.js";

const KINDS = ["parallel-hierarchies", "distributed-duplication", "manual-notification"];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Uso: npx tsx scripts/p7-census-lang.mts <slug>=<dir> [...]");
    process.exit(1);
  }
  const totals = new Map<string, number>(); // `${kind}|${lang}` -> volumen
  for (const arg of args) {
    const [slug, dir] = arg.split("=");
    if (!slug || !dir) continue;
    const t0 = performance.now();
    const census = await censusRepo(dir, slug);
    const ms = Math.round(performance.now() - t0);
    const langByFile = new Map<string, string>();
    for (const key of Object.keys(census.keys)) {
      const m = /^(.*)\|archivo:(.+)$/.exec(key);
      if (m) langByFile.set(m[1]!, m[2]!);
    }
    const perKindLang = new Map<string, number>();
    for (const [key, value] of Object.entries(census.keys)) {
      const m = /^(.*)\|hallazgo:(.+)$/.exec(key);
      if (!m) continue;
      const [, file, kind] = m;
      if (!KINDS.includes(kind!)) continue;
      const lang = langByFile.get(file!) ?? "?";
      const k = `${kind}|${lang}`;
      perKindLang.set(k, (perKindLang.get(k) ?? 0) + value);
      totals.set(k, (totals.get(k) ?? 0) + value);
    }
    console.log(`[${slug}] analysedFiles=${census.meta.analysedFiles} elapsedMs=${ms}`);
    for (const kind of KINDS) {
      const rows = [...perKindLang.entries()].filter(([k]) => k.startsWith(`${kind}|`));
      if (rows.length === 0) continue;
      for (const [k, v] of rows.sort()) console.log(`    ${k} = ${v}`);
    }
  }
  console.log("=== TOTAL (todos los repos pasados) ===");
  for (const [k, v] of [...totals.entries()].sort()) console.log(`  ${k} = ${v}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
