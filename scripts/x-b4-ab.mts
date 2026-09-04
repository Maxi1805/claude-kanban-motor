/**
 * OLA X — frente B4. A/B del cambio de `facade.ts#bypassesOf` AISLADO en UN
 * SOLO PROCESO: corre `analyzeRepo` dos veces sobre el mismo árbol, con
 * `CK_B4_BYPASS_LEGACY=1` (antes) y sin él (después). Mismo instante, mismo
 * código de los otros nueve frentes: el delta no puede contaminarse con lo
 * que otro frente edite entre una medición y la otra.
 *
 * Uso: npx tsx scripts/x-b4-ab.mts <dir> <slug> <salida.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const [, , dir, slug, out] = process.argv;
if (!dir || !slug || !out) process.exit(1);

const MINE = new Set(["Facade", "Decorator"]);
type Row = { id: string; kind: string; file: string; pattern: string; state: string; places: number };

async function pass(legacy: boolean): Promise<Row[]> {
  if (legacy) process.env.CK_B4_BYPASS_LEGACY = "1";
  else delete process.env.CK_B4_BYPASS_LEGACY;
  const a = await analyzeRepo({ dir: path.resolve(dir), repoName: slug, limits: { maxFindings: "unlimited" } });
  const rows: Row[] = [];
  for (const f of a.findings) {
    const id = f.id ?? stableFindingId(f);
    for (const h of f.hypotheses ?? []) {
      if (!MINE.has(h.pattern)) continue;
      rows.push({ id, kind: f.kind, file: f.locations[0]?.file ?? "", pattern: h.pattern, state: h.state, places: (h.places ?? []).length });
    }
  }
  return rows;
}

const antes = await pass(true);
const despues = await pass(false);

const key = (r: Row): string => `${r.id}|${r.pattern}`;
const mapA = new Map(antes.map((r) => [key(r), r]));
const mapD = new Map(despues.map((r) => [key(r), r]));
const REC = new Set(["ausente", "parcial"]);

const cambios: { id: string; kind: string; file: string; pattern: string; de: string; a: string }[] = [];
for (const [k, r] of mapD) {
  const prev = mapA.get(k);
  if (!prev) cambios.push({ id: r.id, kind: r.kind, file: r.file, pattern: r.pattern, de: "(nueva)", a: r.state });
  else if (prev.state !== r.state) cambios.push({ id: r.id, kind: r.kind, file: r.file, pattern: r.pattern, de: prev.state, a: r.state });
}
for (const [k, r] of mapA) if (!mapD.has(k)) cambios.push({ id: r.id, kind: r.kind, file: r.file, pattern: r.pattern, de: r.state, a: "(desaparece)" });

const hist = (rows: Row[]): Record<string, number> => {
  const h: Record<string, number> = {};
  for (const r of rows) h[`${r.pattern}/${r.state}`] = (h[`${r.pattern}/${r.state}`] ?? 0) + 1;
  return h;
};
const recs = (rows: Row[]): number => rows.filter((r) => REC.has(r.state)).length;
const placesTotal = (rows: Row[]): number => rows.reduce((n, r) => n + r.places, 0);

writeFileSync(out, JSON.stringify({ slug, antes: hist(antes), despues: hist(despues), recsAntes: recs(antes), recsDespues: recs(despues), placesAntes: placesTotal(antes), placesDespues: placesTotal(despues), cambios }, null, 1));
console.error(`${slug} recs ${recs(antes)}→${recs(despues)} | places ${placesTotal(antes)}→${placesTotal(despues)} | cambios=${cambios.length} | antes=${JSON.stringify(hist(antes))} despues=${JSON.stringify(hist(despues))}`);
