/**
 * OLA U · FRENTE M0 — generalización de `sample-hypotheses-for-judgment.mts`
 * para TODOS los patrones registrados (ese script hardcodea 4: Decorator,
 * Proxy, Chain of Responsibility, Strategy — el frente M0 necesita muestrear
 * los 17 para construir la línea base del nivel 2 sobre el corpus). No se
 * edita el original (no es archivo propio de este frente); esta es una copia
 * paralela, misma mecánica de muestreo/upsert, `TARGET_PATTERNS` derivado de
 * `hypotheses/registry.ts` en vez de escrito a mano.
 *
 * Uso:
 *   npx tsx scripts/u-m0-sample-hypotheses.mts <dir> <slug> [--n=10] [--seed=1805] [--out=ruta.csv]
 *
 * Sin `--out`: escribe/amplía `tests/golden/precision/<slug>.hypotheses.csv`
 * (MISMO archivo/esquema que el instrumento original — un juez humano puede
 * seguir usando `hypotheses-precision-report.mts` sin cambios sobre lo que
 * este script produce).
 */
import fs from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { fnv1a32, seededShuffle } from "../src/server/services/detect/precision/rng.js";
import { encodeCsv, parseCsv } from "../src/server/services/detect/precision/csv.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { HYPOTHESES } from "../src/server/services/hypotheses/registry.js";
import type { CodeFinding } from "../src/shared/types.js";

const TARGET_PATTERNS: readonly string[] = HYPOTHESES.map((h) => h.pattern);

const DEFAULT_SEED = 1805;
const DEFAULT_N = 10;
const MAX_EVIDENCE_CHARS = 220;

const CSV_COLUMNS: readonly string[] = [
  "id",
  "slug",
  "pattern",
  "state",
  "kind",
  "file",
  "startLine",
  "endLine",
  "symbol",
  "title",
  "detail",
  "confidence",
  "cost",
  "toConfirm",
  "places",
  "evidence",
  "verdict",
  "causeTag",
  "note",
  "stillPresent",
];

/**
 * `verdict` — nivel 2 tiene CUATRO categorías (una más que el nivel 1,
 * CONTEXTO.md §3): "verdadero" (la afirmación de la hipótesis, tal como está
 * escrita, es correcta al leer el código citado), "falso" (no lo es),
 * "problema-si-patron-no" (el PROBLEMA que el ancla señala es real, pero el
 * patrón propuesto no es el remedio correcto — sólo aplica a
 * ausente/parcial), "dudoso" (no se puede decidir con la evidencia
 * disponible, se excluye del cálculo de precisión).
 */
interface HypothesisRow {
  id: string;
  slug: string;
  pattern: string;
  state: string;
  kind: string;
  file: string;
  startLine: number;
  endLine: number;
  symbol: string;
  title: string;
  detail: string;
  confidence: string;
  cost: string;
  toConfirm: string;
  places: string;
  evidence: string;
  verdict: "" | "verdadero" | "falso" | "problema-si-patron-no" | "dudoso";
  causeTag: string;
  note: string;
  stillPresent: boolean;
}

interface Args {
  dir: string;
  slug: string;
  n: number;
  seed: number;
  out: string;
}

function parseArgs(argv: readonly string[]): Args {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = new Map<string, string>();
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    flags.set(eq === -1 ? a.slice(2) : a.slice(2, eq), eq === -1 ? "true" : a.slice(eq + 1));
  }
  const [dir, slug] = positional;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/u-m0-sample-hypotheses.mts <dir> <slug> [--n=10] [--seed=1805] [--out=ruta.csv]");
    process.exit(1);
  }
  return {
    dir: path.resolve(dir),
    slug,
    n: Number(flags.get("n") ?? DEFAULT_N),
    seed: Number(flags.get("seed") ?? DEFAULT_SEED),
    out: flags.get("out") ?? path.resolve("tests/golden/precision", `${slug}.hypotheses.csv`),
  };
}

function evidenceLine(rootDir: string, file: string, startLine: number): string {
  if (!file) return "";
  try {
    const text = fs.readFileSync(path.join(rootDir, file), "utf8");
    const raw = text.split(/\r?\n/)[startLine - 1] ?? "";
    const trimmed = raw.trim();
    return trimmed.length > MAX_EVIDENCE_CHARS ? trimmed.slice(0, MAX_EVIDENCE_CHARS - 3) + "..." : trimmed;
  } catch {
    return "";
  }
}

function withStableId(f: CodeFinding): CodeFinding {
  return f.id ? f : { ...f, id: stableFindingId(f) };
}

function toRows(finding: CodeFinding, slug: string, dir: string): HypothesisRow[] {
  const loc = finding.locations[0];
  const rows: HypothesisRow[] = [];
  for (const h of finding.hypotheses ?? []) {
    if (!TARGET_PATTERNS.includes(h.pattern)) continue;
    const id = `${finding.id}::${h.pattern}`;
    rows.push({
      id,
      slug,
      pattern: h.pattern,
      state: h.state,
      kind: finding.kind,
      file: loc?.file ?? "",
      startLine: loc?.startLine ?? 0,
      endLine: loc?.endLine ?? 0,
      symbol: loc?.symbol ?? "",
      title: finding.title,
      detail: finding.detail,
      confidence: h.confidence ?? "",
      cost: h.cost,
      toConfirm: h.toConfirm.join(" | "),
      places: h.places.map((p) => `${p.role}@${p.file}:${p.startLine}`).join(" | "),
      evidence: evidenceLine(dir, loc?.file ?? "", loc?.startLine ?? 0),
      verdict: "",
      causeTag: "",
      note: "",
      stillPresent: true,
    });
  }
  return rows;
}

function selectSampleByPattern(rows: readonly HypothesisRow[], opts: { slug: string; n: number; seedBase: number }): Map<string, HypothesisRow[]> {
  const byPattern = new Map<string, HypothesisRow[]>();
  for (const r of rows) {
    const bucket = byPattern.get(r.pattern);
    if (bucket) bucket.push(r);
    else byPattern.set(r.pattern, [r]);
  }
  const selected = new Map<string, HypothesisRow[]>();
  for (const [pattern, pool] of byPattern) {
    const sorted = pool.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const seed = fnv1a32(`${opts.seedBase}:${opts.slug}:${pattern}`);
    const shuffled = seededShuffle(sorted, seed);
    selected.set(pattern, shuffled.slice(0, opts.n));
  }
  return selected;
}

function readCsv(filePath: string): HypothesisRow[] {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const { header, records } = parseCsv(text);
  if (header.length === 0) return [];
  const idx = new Map(header.map((h, i) => [h, i]));
  const col = (name: string): number => {
    const i = idx.get(name);
    if (i === undefined) throw new Error(`${filePath}: falta la columna "${name}"`);
    return i;
  };
  const at = (record: readonly string[], name: string): string => record[col(name)] ?? "";
  return records.map((r) => ({
    id: at(r, "id"),
    slug: at(r, "slug"),
    pattern: at(r, "pattern"),
    state: at(r, "state"),
    kind: at(r, "kind"),
    file: at(r, "file"),
    startLine: Number(at(r, "startLine")) || 0,
    endLine: Number(at(r, "endLine")) || 0,
    symbol: at(r, "symbol"),
    title: at(r, "title"),
    detail: at(r, "detail"),
    confidence: at(r, "confidence"),
    cost: at(r, "cost"),
    toConfirm: at(r, "toConfirm"),
    places: at(r, "places"),
    evidence: at(r, "evidence"),
    verdict: at(r, "verdict") as HypothesisRow["verdict"],
    causeTag: at(r, "causeTag"),
    note: at(r, "note"),
    stillPresent: at(r, "stillPresent") !== "false",
  }));
}

function rowToFields(r: HypothesisRow): string[] {
  return [
    r.id,
    r.slug,
    r.pattern,
    r.state,
    r.kind,
    r.file,
    String(r.startLine),
    String(r.endLine),
    r.symbol,
    r.title,
    r.detail,
    r.confidence,
    r.cost,
    r.toConfirm,
    r.places,
    r.evidence,
    r.verdict,
    r.causeTag,
    r.note,
    String(r.stillPresent),
  ];
}

function writeCsv(filePath: string, rows: readonly HypothesisRow[]): void {
  const sorted = rows
    .slice()
    .sort((a, b) => (a.pattern === b.pattern ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.pattern < b.pattern ? -1 : 1));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encodeCsv(CSV_COLUMNS, sorted.map(rowToFields)), "utf8");
}

function mergeRows(existing: readonly HypothesisRow[], fresh: readonly HypothesisRow[]): HypothesisRow[] {
  const freshIds = new Set(fresh.map((r) => r.id));
  const existingIds = new Set(existing.map((r) => r.id));
  const merged: HypothesisRow[] = existing.map((r) => (freshIds.has(r.id) ? r : { ...r, stillPresent: false }));
  for (const r of fresh) {
    if (!existingIds.has(r.id)) merged.push(r);
  }
  return merged;
}

async function main(): Promise<void> {
  const { dir, slug, n, seed, out } = parseArgs(process.argv.slice(2));

  const t0 = performance.now();
  const { analysis, cache } = await analyzeRepoCached({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
  const wallMs = Math.round(performance.now() - t0);
  console.error(`[u-m0-sample] ${slug}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason})`);

  const withIds = analysis.findings.map(withStableId);
  const allRows = withIds.flatMap((f) => toRows(f, slug, dir));

  const censusByPattern = new Map<string, number>();
  for (const r of allRows) censusByPattern.set(r.pattern, (censusByPattern.get(r.pattern) ?? 0) + 1);

  const selected = selectSampleByPattern(allRows, { slug, n, seedBase: seed });
  const fresh = [...selected.values()].flat();

  const existing = readCsv(out);
  const merged = mergeRows(existing, fresh);
  writeCsv(out, merged);

  const newRows = merged.length - existing.length;
  console.error(`[u-m0-sample] ${slug}: analyzeRepo ${wallMs}ms, ${analysis.findings.length} hallazgos totales.`);
  console.error(`  Censo real por patrón (TODOS los estados, población completa antes de muestrear):`);
  for (const p of TARGET_PATTERNS) if (censusByPattern.get(p)) console.error(`    ${p.padEnd(32)} ${censusByPattern.get(p) ?? 0}`);
  console.error(`  ${newRows} fila(s) nueva(s) → ${merged.length} totales en ${out}.`);
}

main();
