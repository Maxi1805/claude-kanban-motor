/**
 * OLA V · FRENTE V7 — censo del NIVEL 2 sobre UN repo del corpus, acotado a los ocho
 * patrones que este frente tiene que falsificar (los que cerraron la Ola U en 0 % con
 * base flaca): Composite, Prototype, Command, Iterator, Abstract Factory, Chain of
 * Responsibility, State, Builder.
 *
 * Mismo esquema de `id` que `sample-hypotheses-for-judgment.mts` (`${finding.id}::${pattern}`,
 * con `finding.id = stableFindingId`) para que los veredictos de este frente sean
 * cruzables contra `tests/golden/precision/*.hypotheses.csv` sin traducir nada.
 *
 * UN repo por proceso (mismo motivo que `u-int-censo.mts`: dos `analyzeRepo` en el mismo
 * proceso corrompen el caché de `web-tree-sitter`). Se invoca bajo `scripts/con-analisis.sh`.
 *
 * Uso: npx tsx scripts/v7-censo.mts <dir> <slug> <salida.json>
 */
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const TARGET_PATTERNS = new Set([
  "Composite",
  "Prototype",
  "Command",
  "Iterator",
  "Abstract Factory",
  "Chain of Responsibility",
  "State",
  "Builder",
]);

const EXT_TO_LANG = new Map<string, string>();
for (const decl of LANGUAGE_DECLS) for (const ext of decl.extensions) EXT_TO_LANG.set(ext, decl.id);

function languageOfFile(file: string): string {
  return EXT_TO_LANG.get(path.extname(file).toLowerCase()) ?? "?";
}

function evidenceLine(rootDir: string, file: string, startLine: number): string {
  if (!file) return "";
  try {
    const text = readFileSync(path.join(rootDir, file), "utf8");
    const raw = text.split(/\r?\n/)[startLine - 1] ?? "";
    return raw.trim().slice(0, 240);
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const [, , dir, slug, out] = process.argv;
  if (!dir || !slug || !out) {
    console.error("Uso: npx tsx scripts/v7-censo.mts <dir> <slug> <salida.json>");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);

  const t0 = performance.now();
  const { analysis, cache } = await analyzeRepoCached({
    dir: rootDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  const wallMs = Math.round(performance.now() - t0);
  console.error(
    `[v7] ${slug}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)} wallMs=${wallMs}`,
  );

  interface Row {
    id: string;
    repo: string;
    kind: string;
    pattern: string;
    state: string;
    lang: string;
    file: string;
    line: number;
    symbol: string;
    confidence: string | null;
    toConfirm: string;
    evidence: string;
  }
  const rows: Row[] = [];

  for (const finding of analysis.findings) {
    const hyps = (finding.hypotheses ?? []).filter((h) => TARGET_PATTERNS.has(h.pattern));
    if (hyps.length === 0) continue;
    const loc = finding.locations[0];
    const lang = loc ? languageOfFile(loc.file) : "?";
    const fid = finding.id ?? stableFindingId(finding);
    for (const h of hyps) {
      rows.push({
        id: `${fid}::${h.pattern}`,
        repo: slug,
        kind: finding.kind,
        pattern: h.pattern,
        state: h.state,
        lang,
        file: loc?.file ?? "?",
        line: loc?.startLine ?? 0,
        symbol: loc?.symbol ?? "",
        confidence: h.confidence ?? null,
        toConfirm: h.toConfirm.join(" | "),
        evidence: evidenceLine(rootDir, loc?.file ?? "", loc?.startLine ?? 0),
      });
    }
  }

  const byPattern: Record<string, { total: number; ausente: number; parcial: number; yaAplicado: number; aplicadoEludido: number }> = {};
  for (const r of rows) {
    const e = (byPattern[r.pattern] ??= { total: 0, ausente: 0, parcial: 0, yaAplicado: 0, aplicadoEludido: 0 });
    e.total++;
    if (r.state === "ausente") e.ausente++;
    else if (r.state === "parcial") e.parcial++;
    else if (r.state === "ya-aplicado") e.yaAplicado++;
    else if (r.state === "aplicado-eludido") e.aplicadoEludido++;
  }

  writeFileSync(out, JSON.stringify({ dir: rootDir, slug, wallMs, byPattern, rows }, null, 1));
  console.log(`${out}: ${rows.length} hipótesis (8 patrones V7), ${Object.keys(byPattern).length} patrones con población.`);
}

main();
