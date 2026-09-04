/**
 * EXTENSIÓN del instrumento de precisión (`sample-findings-for-judgment.mts`)
 * — ese script muestrea por `kind` de HALLAZGO; el frente "precisión de los
 * cuatro patrones que producen todo el volumen" necesita muestrear por
 * PATRÓN de HIPÓTESIS (Decorator / "Proxy (inicialización perezosa)" /
 * Chain of Responsibility / Strategy), con TODOS los estados — no sólo
 * `ausente`/`parcial` (`actionablePatterns` de `sample.ts` los excluye a
 * propósito, correcto para el instrumento original: mide si la
 * RECOMENDACIÓN pendiente es buena. Acá hace falta también juzgar si un
 * `ya-aplicado`/`aplicado-eludido` está bien clasificado — R5 en RAICES.md
 * es exactamente un `ausente` que debía ser `ya-aplicado`).
 *
 * NO se toca `detect/precision/*`: se reusan sus piezas puras (RNG con
 * semilla — `rng.ts` — y el CSV mínimo — `csv.ts`) importándolas, nunca
 * editándolas. El esquema de columnas es propio de este script porque una
 * fila acá es UNA hipótesis (pattern+state ya fijos), no un hallazgo con una
 * lista de patrones colgando — la forma de `PrecisionRow` no alcanza.
 *
 * Uso:
 *   npx tsx scripts/sample-hypotheses-for-judgment.mts <dir> <slug> [--n=20] [--seed=1805] [--out=ruta.csv]
 *
 * Sin `--out`: escribe/amplía `tests/golden/precision/<slug>.hypotheses.csv`.
 * Mismo UPSERT por `id` que el instrumento original (nunca pisa un
 * `verdict`/`causeTag`/`note` ya cargado).
 */
import fs from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { fnv1a32, seededShuffle } from "../src/server/services/detect/precision/rng.js";
import { encodeCsv, parseCsv } from "../src/server/services/detect/precision/csv.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import type { CodeFinding, CodeFindingHypothesis } from "../src/shared/types.js";

/** Los cuatro patrones de este frente — nombres EXACTOS tal como los emiten `hypotheses/*.ts` (grep verificado, no adivinado). */
const TARGET_PATTERNS: readonly string[] = ["Decorator", "Proxy (inicialización perezosa)", "Chain of Responsibility", "Strategy"];

const DEFAULT_SEED = 1805;
const DEFAULT_N = 20;
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
 * `verdict` — "¿la afirmación de ESTA hipótesis (patrón+estado, tal como
 * está escrita) es correcta, leyendo el código citado?": para
 * `ausente`/`parcial` responde a la vez "¿hay problema real?" Y "¿el patrón
 * es el remedio correcto?" (una sola pregunta, porque la fila YA es un
 * patrón específico, no una lista); para `ya-aplicado`/`aplicado-eludido`
 * responde "¿de verdad ya está aplicado / conscientemente evitado, como
 * dice?". "dudoso" se excluye del cálculo de precisión — mismo criterio que
 * `detect/precision/types.ts`.
 * `causeTag` — sólo con sentido si `verdict = "falso"`: causa según la
 * taxonomía del encargo (`idioma-framework` / `ancla-equivocada` /
 * `estado-mal-clasificado` / `evidencia-otro-archivo` / `otro`).
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
  verdict: "" | "verdadero" | "falso" | "dudoso";
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
    console.error(
      "Uso: npx tsx scripts/sample-hypotheses-for-judgment.mts <dir> <slug> [--n=20] [--seed=1805] [--out=ruta.csv]",
    );
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

/** Una fila por (finding, hipótesis-de-patrón-objetivo) — un finding puede tener varias (p.ej. `repeated-switch` cuelga State Y Strategy). */
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

/** Mismo mecanismo que `sample.ts#selectSample` (semilla derivada de `seedBase:slug:grupo`, orden previo por `id` para que el shuffle sea reproducible) pero agrupando por PATRÓN en vez de por `kind`. */
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

/** Mismo UPSERT que `verdicts-io.ts#mergeRows`: nunca pisa `verdict`/`causeTag`/`note` ya cargado; lo que ya no aparece en el pool vivo se conserva marcado `stillPresent: false`. */
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
  const analysis = await analyzeRepo({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
  const wallMs = Math.round(performance.now() - t0);

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
  console.error(`[precision-hypotheses] ${slug}: analyzeRepo ${wallMs}ms, ${analysis.findings.length} hallazgos totales.`);
  console.error(`  Censo real por patrón (TODOS los estados, población completa antes de muestrear):`);
  for (const p of TARGET_PATTERNS) console.error(`    ${p.padEnd(32)} ${censusByPattern.get(p) ?? 0}`);
  console.error(`  ${newRows} fila(s) nueva(s) → ${merged.length} totales en ${out}.`);
}

main();
