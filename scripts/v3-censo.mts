/**
 * OLA V · FRENTE V3 — censo de Command/Iterator (antes/después no aplica acá:
 * SÓLO mide el árbol tal como está ahora, con mi arreglo aplicado). Un
 * proceso por repo (`analyzeRepoCached`), imprime hipótesis Command/Iterator
 * por estado y las filas completas (archivo:línea) para poder elegir qué
 * verificar a mano.
 *
 * Uso: npx tsx scripts/v3-censo.mts <dir> <slug>
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const [, , dir, slug] = process.argv;
if (!dir || !slug) {
  console.error("Uso: npx tsx scripts/v3-censo.mts <dir> <slug>");
  process.exit(1);
}

const t0 = performance.now();
const { analysis: a, cache } = await analyzeRepoCached({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
console.error(`[analyzer-cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)}`);

// `CodeFinding` (el tipo público que devuelve `analyzeRepoCached`) NO trae
// `language` — ese campo vive en el `Finding` interno de `detect/types.ts`,
// no en la forma que cruza al cliente. Ambas anclas de Command/Iterator son
// `inter-file` (`Finding.language` siempre `null` ahí de todos modos, ver
// docstring de `command.ts`/`iterator.ts`), así que no hace falta: se agrupa
// sólo por patrón/estado.
const wanted = new Set(["Command", "Iterator"]);
const rows: { pattern: string; state: string; kind: string; file: string; line: number; id: string }[] = [];
for (const f of a.findings) {
  for (const h of f.hypotheses ?? []) {
    if (!wanted.has(h.pattern)) continue;
    const loc = f.locations[0];
    rows.push({
      pattern: h.pattern,
      state: h.state,
      kind: f.kind,
      file: loc?.file ?? "?",
      line: loc?.startLine ?? 0,
      id: f.id ?? stableFindingId(f),
    });
  }
}

const byPattern: Record<string, Record<string, number>> = {};
for (const r of rows) {
  const p = (byPattern[r.pattern] ??= {});
  p[r.state] = (p[r.state] ?? 0) + 1;
}

console.log(`\n=== ${slug} (${dir}) — wallMs=${Math.round(performance.now() - t0)} ===`);
console.log("por patrón/estado:", JSON.stringify(byPattern));
for (const r of rows) {
  console.log(`${r.pattern}\t${r.state}\t${r.kind}\t${r.file}:${r.line}\t${r.id}`);
}
