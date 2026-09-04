/**
 * OLA U · FRENTE M0 — combina los N censos por repo (salida de
 * `u-m0-census-hipotesis.mts`, uno por proceso/repo) en la línea base ÚNICA
 * del nivel 2 sobre los 13 repos del corpus: por PATRÓN × ESTADO, por
 * PATRÓN × LENGUAJE, y el total de RECOMENDACIONES REALES (`ausente`+
 * `parcial` — `ya-aplicado`/`aplicado-eludido` NO son recomendaciones,
 * CONTEXTO.md §1).
 *
 * Uso: npx tsx scripts/u-m0-aggregate-census.mts /tmp/u-m0/*.json
 */
import fs from "node:fs";

interface RepoCensus {
  slug: string;
  totalFindings: number;
  byPattern: Record<string, { total: number; states: Record<string, number>; byLang: Record<string, number> }>;
}

const STATES = ["ausente", "parcial", "ya-aplicado", "aplicado-eludido"] as const;

function main(): void {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Uso: npx tsx scripts/u-m0-aggregate-census.mts <censo1.json> [más...]");
    process.exit(1);
  }
  const censuses: RepoCensus[] = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));

  const patterns = new Set<string>();
  for (const c of censuses) for (const p of Object.keys(c.byPattern)) patterns.add(p);

  const byPatternState = new Map<string, Record<string, number>>();
  const byPatternLang = new Map<string, Record<string, number>>();
  for (const p of patterns) {
    const states: Record<string, number> = Object.fromEntries(STATES.map((s) => [s, 0]));
    const langs: Record<string, number> = {};
    for (const c of censuses) {
      const r = c.byPattern[p];
      if (!r) continue;
      for (const s of STATES) states[s] += r.states[s] ?? 0;
      for (const [lang, n] of Object.entries(r.byLang)) langs[lang] = (langs[lang] ?? 0) + n;
    }
    byPatternState.set(p, states);
    byPatternLang.set(p, langs);
  }

  const sortedPatterns = [...patterns].sort();

  console.log("=== Censo nivel 2 — 13 repos del corpus, por patrón × estado ===\n");
  let totalHyp = 0;
  let totalReal = 0;
  let totalYaAplicado = 0;
  let totalEludido = 0;
  const populatedPatterns: string[] = [];
  for (const p of sortedPatterns) {
    const s = byPatternState.get(p)!;
    const total = STATES.reduce((sum, k) => sum + s[k], 0);
    if (total === 0) continue;
    populatedPatterns.push(p);
    const real = s.ausente + s.parcial;
    totalHyp += total;
    totalReal += real;
    totalYaAplicado += s["ya-aplicado"];
    totalEludido += s["aplicado-eludido"];
    console.log(
      `  ${p.padEnd(34)} total=${String(total).padStart(4)}  ausente=${String(s.ausente).padStart(3)}` +
        `  parcial=${String(s.parcial).padStart(3)}  ya-aplicado=${String(s["ya-aplicado"]).padStart(3)}` +
        `  aplicado-eludido=${String(s["aplicado-eludido"]).padStart(3)}  ⇒ recomendaciones reales=${String(real).padStart(3)}`,
    );
  }
  console.log(`\n  Patrones con población: ${populatedPatterns.length} de ${sortedPatterns.length} registrados.`);
  const silent = sortedPatterns.filter((p) => !populatedPatterns.includes(p));
  if (silent.length) console.log(`  Patrones EN CERO (población 0 en todo el corpus): ${silent.join(", ")}`);

  console.log(
    `\n  TOTAL: ${totalHyp} hipótesis · ${totalReal} recomendaciones reales (ausente+parcial, ${((totalReal / totalHyp) * 100).toFixed(1)}%)` +
      ` · ${totalYaAplicado + totalEludido} no-recomendación (ya-aplicado ${totalYaAplicado} + aplicado-eludido ${totalEludido}, ${(((totalYaAplicado + totalEludido) / totalHyp) * 100).toFixed(1)}%)`,
  );

  console.log("\n=== Por patrón × lenguaje (todos los estados juntos) ===\n");
  const allLangs = new Set<string>();
  for (const langs of byPatternLang.values()) for (const l of Object.keys(langs)) allLangs.add(l);
  const sortedLangs = [...allLangs].sort();
  for (const p of populatedPatterns) {
    const langs = byPatternLang.get(p)!;
    const parts = sortedLangs.filter((l) => langs[l]).map((l) => `${l}=${langs[l]}`);
    console.log(`  ${p.padEnd(34)} ${parts.join(", ")}`);
  }

  console.log("\n=== Por repo — hallazgos totales (nivel 1) y hipótesis totales (nivel 2) ===\n");
  for (const c of censuses) {
    const hypInRepo = sortedPatterns.reduce((sum, p) => sum + (c.byPattern[p]?.total ?? 0), 0);
    console.log(`  ${c.slug.padEnd(20)} hallazgos=${String(c.totalFindings).padStart(5)}  hipótesis=${String(hypInRepo).padStart(4)}`);
  }
}

main();
