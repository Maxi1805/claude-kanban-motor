/**
 * Ola 13 — instrumento de muestreo/juicio para la ALTERNATIVA que la rama
 * NEGATIVA de Builder emite ahora (`hypotheses/builder.ts#buildAlternative`,
 * "Parameter Object"). MISMO esquema de columnas y MISMO mecanismo de
 * muestreo/upsert que `sample-hypotheses-for-judgment.mts` (RNG con
 * semilla — `detect/precision/rng.js`, CSV mínimo — `detect/precision/
 * csv.js`, sólo IMPORTADOS, nunca editados — "no toques detect/" sigue
 * intacto) — archivo PROPIO porque una fila acá es una `PatternAlternative`
 * (sin `state`/`confidence` de patrón — ver `hypotheses/types.ts`), no una
 * `PatternHypothesis`.
 *
 * POR QUÉ RESUELVE `ctx.file` A MANO (`resolveLiveFileUnit`, R1): ver el
 * docstring de `measure-builder-alternative.mts` — el mismo razonamiento
 * completo. Este script es la versión "para juzgar a mano" (muestra +
 * columnas legibles + upsert); aquél es la versión "para contar".
 *
 * Uso:
 *   npx tsx scripts/sample-builder-alternative-for-judgment.mts <dir> <slug> [--n=25] [--seed=1805] [--out=ruta.csv]
 *
 * Sin `--out`: escribe/amplía `tests/golden/precision/builder-alternative.hypotheses.csv`.
 */
import fs from "node:fs";
import path from "node:path";

import { analyzeRepo, resolveLiveFileUnit, type LiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { Capability } from "../src/server/services/detect/capabilities.js";
import { encodeCsv, parseCsv } from "../src/server/services/detect/precision/csv.js";
import { fnv1a32, seededShuffle } from "../src/server/services/detect/precision/rng.js";
import { pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { Finding, FileUnit, RoleLocation } from "../src/server/services/detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../src/server/services/graph/neighborhood.js";
import { buildAlternative, hypothesis } from "../src/server/services/hypotheses/builder.js";
import type { HypothesisContext } from "../src/server/services/hypotheses/types.js";
import type { CodeFinding } from "../src/shared/types.js";

const DEFAULT_SEED = 1805;
const DEFAULT_N = 25;
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
 * Mismas columnas que `HypothesisRow` (`sample-hypotheses-for-judgment.mts`)
 * para que `hypotheses-precision-report.mts` (que sólo mira `id`/`slug`/
 * `pattern`/`state`/`verdict`/`causeTag`/`stillPresent`) lo lea sin cambios.
 * `pattern` = el REMEDIO ("Parameter Object"), no "Builder" — el patrón
 * descartado viaja en `detail`/`note`, nunca en la columna que el reporte
 * usa para bucketizar precisión (mezclarlo ahí falsearía "precisión de
 * Parameter Object" con filas de otro remedio).
 * `state` no es un `PatternState`: `PatternAlternative` no tiene los cuatro
 * estados (ver `hypotheses/types.ts`) — se deja fijo en `"alternativa"`,
 * legible, nunca inventado como uno de los cuatro que no aplican acá.
 */
interface AltRow {
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
    console.error("Uso: npx tsx scripts/sample-builder-alternative-for-judgment.mts <dir> <slug> [--n=25] [--seed=1805] [--out=ruta.csv]");
    process.exit(1);
  }
  return {
    dir: path.resolve(dir),
    slug,
    n: Number(flags.get("n") ?? DEFAULT_N),
    seed: Number(flags.get("seed") ?? DEFAULT_SEED),
    out: flags.get("out") ?? path.resolve("tests/golden/precision", "builder-alternative.hypotheses.csv"),
  };
}

const EXTENSION_LANGUAGE: Record<string, string> = {
  ".rb": "ruby",
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".vue": "vue",
  ".java": "java",
  ".cs": "csharp",
  ".go": "go",
};

function languageForPath(p: string): string | null {
  return EXTENSION_LANGUAGE[path.extname(p).toLowerCase()] ?? null;
}

function toInternalFinding(cf: CodeFinding): Finding | null {
  if (cf.locations.length === 0) return null;
  const threshold = resolveThreshold(pisoDeclarado(cf.metric.value, { rationale: "adaptador de medición (no de producción)" }), {
    language: "javascript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
  const locations = cf.locations.map((l) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol, role: "n/a" })) as [
    RoleLocation,
    ...RoleLocation[],
  ];
  return {
    id: cf.id ?? `${cf.kind}:${locations[0]?.file ?? ""}:${locations[0]?.startLine ?? 0}`,
    detectorId: cf.kind,
    kind: cf.kind,
    scope: "intra-function",
    language: languageForPath(locations[0]!.file),
    title: cf.title,
    detail: cf.detail,
    trigger: [{ label: cf.metric.label, value: cf.metric.value, threshold }],
    locations,
    severity: cf.severity,
    advice: cf.advice ?? { primary: { name: "n/a", kind: "refactorizacion", why: "n/a", source: "n/a" } },
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

function selectSample(rows: readonly AltRow[], opts: { slug: string; n: number; seedBase: number }): AltRow[] {
  const sorted = rows.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seed = fnv1a32(`${opts.seedBase}:${opts.slug}:builder-alternative`);
  const shuffled = seededShuffle(sorted, seed);
  return shuffled.slice(0, opts.n);
}

function readCsv(filePath: string): AltRow[] {
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
    verdict: at(r, "verdict") as AltRow["verdict"],
    causeTag: at(r, "causeTag"),
    note: at(r, "note"),
    stillPresent: at(r, "stillPresent") !== "false",
  }));
}

function rowToFields(r: AltRow): string[] {
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

function writeCsv(filePath: string, rows: readonly AltRow[]): void {
  const sorted = rows.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encodeCsv(CSV_COLUMNS, sorted.map(rowToFields)), "utf8");
}

/**
 * DEFECTO ENCONTRADO Y ARREGLADO EN ESTA MISMA OLA, medido: a diferencia de
 * `sample-hypotheses-for-judgment.mts` (que escribe un archivo POR slug —
 * `<slug>.hypotheses.csv` —, así que su `mergeRows` sólo compara filas del
 * MISMO slug), este script junta TODOS los slugs en un único archivo
 * (`builder-alternative.hypotheses.csv`, a propósito — es una sola
 * alternativa nueva, no 4 patrones con volumen para separar). Con el
 * `mergeRows` original (copiado sin ajustar), CADA corrida marcaba
 * `stillPresent: false` en TODAS las filas de OTROS slugs — nunca
 * reaparecen en `fresh` porque `fresh` sólo trae candidatos del slug que
 * se está corriendo ahora. Medido: las 15 filas de `rails`/`ck-analyzer`/
 * `guava-collect` quedaron en `false` apenas corrió `newtonsoft-json`.
 * Arreglo: la "vida" de una fila existente sólo se reevalúa si su `slug`
 * es el MISMO que se está muestreando en esta corrida — filas de otros
 * slugs viajan intactas, nunca tocadas por una corrida que no las mira.
 */
function mergeRows(existing: readonly AltRow[], fresh: readonly AltRow[], slug: string): AltRow[] {
  const freshIds = new Set(fresh.map((r) => r.id));
  const existingIds = new Set(existing.map((r) => r.id));
  const merged: AltRow[] = existing.map((r) => (r.slug !== slug || freshIds.has(r.id) ? r : { ...r, stillPresent: false }));
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

  const anchors = new Set<string>(hypothesis.anchors);
  // Deduplicado por (kind, file, startLine, endLine, symbol) — medido en
  // guava-collect/click: `analyzeRepo` puede producir 2-3 `CodeFinding`
  // SIN `id` propio apuntando a la MISMA ubicación exacta (overloads con el
  // mismo nombre, p.ej. Java `of(...)` — artefacto del pipeline de
  // resolución de ubicación, `code-analyzer.ts`/`detect/`, fuera del
  // alcance de esta ola: "no toques detect/"). Sin este dedup, la MISMA
  // evidencia estructural se cuenta 2-3 veces como si fueran muestras
  // independientes, inflando artificialmente el tamaño de muestra.
  const seenLocations = new Set<string>();
  const candidates = analysis.findings.filter((f) => {
    if (!anchors.has(f.kind)) return false;
    const loc = f.locations[0];
    const key = `${f.kind}|${loc?.file ?? ""}|${loc?.startLine ?? 0}|${loc?.endLine ?? 0}|${loc?.symbol ?? ""}`;
    if (seenLocations.has(key)) return false;
    seenLocations.add(key);
    return true;
  });

  const liveFiles = new Map<string, LiveFileUnit>();
  async function fileAt(relPath: string): Promise<FileUnit | null> {
    const cached = liveFiles.get(relPath);
    if (cached) return cached.unit;
    const live = await resolveLiveFileUnit(dir, relPath);
    if (!live) return null;
    liveFiles.set(relPath, live);
    return live.unit;
  }

  const allRows: AltRow[] = [];
  let builderFired = 0;
  let neitherFired = 0;

  try {
    for (const cf of candidates) {
      const finding = toInternalFinding(cf);
      if (!finding) continue;
      const primaryLoc = finding.locations[0]!;
      const primaryFile = await fileAt(primaryLoc.file);
      const ctx: HypothesisContext = {
        file: primaryFile,
        fileAt: () => null,
        repo: { repoName: slug, files: [], functions: [], clones: [], graph: null },
        capabilities: new Set<Capability>(),
        setsFor: () => ({
          functionNodes: new Set(),
          branchNodes: new Set(),
          chainNodes: new Set(),
          cloneNodes: new Set(),
          classNodes: new Set(),
          nestingNodes: new Set(),
          constructorNodes: new Set(),
          exceptionNodes: new Set(),
          switchContainerNodes: new Set(),
        }),
        neighborhood: EMPTY_NEIGHBORHOOD,
        branches: () => null,
      };

      const builderH = hypothesis.build(finding, null, ctx);
      // OJO: `buildAlternative` NO está registrada en `hypothesis` a propósito
      // (condición de fracaso medida, ver builder.ts) — se llama a la
      // función EXPORTADA directamente, nunca vía `hypothesis.buildAlternative`
      // (que es `undefined` siempre y silenciaría este script sin avisar,
      // corrompiendo además el CSV: `mergeRows` marcaría TODAS las filas
      // existentes del slug como `stillPresent: false` al no encontrar
      // ningún candidato "fresh").
      const alt = buildAlternative(finding, null, ctx);
      if (builderH) builderFired++;
      if (!builderH && !alt) neitherFired++;
      if (!alt) continue;

      const id = `${finding.id}::ParameterObject`;
      allRows.push({
        id,
        slug,
        pattern: alt.remedy,
        state: "alternativa (no es hipótesis de patrón — ver hypotheses/types.ts#PatternAlternative)",
        kind: finding.kind,
        file: primaryLoc.file,
        startLine: primaryLoc.startLine,
        endLine: primaryLoc.endLine,
        symbol: primaryLoc.symbol ?? "",
        title: finding.title,
        detail: `[descarta ${alt.discardedPattern}] ${alt.why}`,
        confidence: "",
        cost: alt.suggestion,
        toConfirm: alt.toConfirm.join(" | "),
        places: alt.places.map((p) => `${p.role}@${p.file}:${p.startLine}`).join(" | "),
        evidence: evidenceLine(dir, primaryLoc.file, primaryLoc.startLine),
        verdict: "",
        causeTag: "",
        note: "",
        stillPresent: true,
      });
    }
  } finally {
    for (const live of liveFiles.values()) live.release();
  }

  const fresh = selectSample(allRows, { slug, n, seedBase: seed });
  const existing = readCsv(out);
  const merged = mergeRows(existing, fresh, slug);
  writeCsv(out, merged);

  console.error(`[builder-alternative] ${slug}: analyzeRepo ${wallMs}ms, ${analysis.findings.length} hallazgos totales, ${candidates.length} candidatos Builder-ancla.`);
  console.error(`  Builder disparó: ${builderFired}. Alternativa (Parameter Object) disparó: ${allRows.length}. Ninguno: ${neitherFired}.`);
  console.error(`  Muestra: ${fresh.length} de ${allRows.length} → ${merged.length - existing.length} fila(s) nueva(s), ${merged.length} totales en ${out}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
