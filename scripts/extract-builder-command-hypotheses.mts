/**
 * Extractor puntual para el frente F1 (Builder + Command) — hermano de
 * `sample-hypotheses-for-judgment.mts` pero SIN muestreo: la población viva
 * de Builder+Command es de sólo 12 hipótesis en total (7+5) entre las dos
 * poblaciones, así que se toman TODAS en vez de tomar una muestra.
 *
 * Mismo esquema de columnas, mismo cálculo de `id` (`finding.id::pattern`,
 * `finding.id` = `stableFindingId`) y mismo UPSERT por `id` que el script
 * hermano, para que esta fila conviva sin duplicarse si más adelante alguien
 * corre el muestreo real con Builder/Command agregados a TARGET_PATTERNS.
 *
 * Uso:
 *   npx tsx scripts/extract-builder-command-hypotheses.mts <dir> <slug> [--out=ruta.csv]
 */
import fs from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { encodeCsv, parseCsv } from "../src/server/services/detect/precision/csv.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import type { CodeFinding } from "../src/shared/types.js";

const TARGET_PATTERNS: readonly string[] = ["Builder", "Command"];

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
  verdict: string;
  causeTag: string;
  note: string;
  stillPresent: boolean;
}

interface Args {
  dir: string;
  slug: string;
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
    console.error("Uso: npx tsx scripts/extract-builder-command-hypotheses.mts <dir> <slug> [--out=ruta.csv]");
    process.exit(1);
  }
  return {
    dir: path.resolve(dir),
    slug,
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
    verdict: at(r, "verdict"),
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

/** Mismo UPSERT que el script hermano: nunca pisa `verdict`/`causeTag`/`note` ya cargado. */
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
  const { dir, slug, out } = parseArgs(process.argv.slice(2));

  const t0 = performance.now();
  const analysis = await analyzeRepo({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
  const wallMs = Math.round(performance.now() - t0);

  const withIds = analysis.findings.map(withStableId);
  const fresh = withIds.flatMap((f) => toRows(f, slug, dir));

  const existing = readCsv(out);
  const merged = mergeRows(existing, fresh);
  writeCsv(out, merged);

  const newRows = merged.length - existing.length;
  console.error(`[extract-builder-command] ${slug}: analyzeRepo ${wallMs}ms, ${analysis.findings.length} hallazgos totales.`);
  console.error(`  Builder+Command extraídos: ${fresh.length} (censo completo, sin muestreo).`);
  for (const r of fresh) console.error(`    ${r.pattern.padEnd(8)} ${r.file}:${r.startLine} state=${r.state}`);
  console.error(`  ${newRows} fila(s) nueva(s) → ${merged.length} totales en ${out}.`);
}

main();
