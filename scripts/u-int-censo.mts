/**
 * OLA U · INTEGRADOR — censo del NIVEL 2 sobre UN repo del corpus.
 *
 * Hermano de `scripts/u-m0-census-hipotesis.mts` (la línea base de M0), con TRES datos
 * más que M0 no guardó y que el cierre de la ola necesita:
 *
 *  1. `id` = `stableFindingId` real del hallazgo ancla (M0 lo declaró como limitación:
 *     sus filas usaban un id sintético `u-m0::…` y por eso no se pueden cruzar).
 *  2. `kind` del hallazgo ancla, por hipótesis — sin eso no se puede armar la TABLA DE
 *     ANCLAS (qué ancla domina cada patrón y qué precisión tiene esa ancla).
 *  3. La FILA COMPLETA de cada hipótesis (no un conteo agregado ni 6 ejemplos topeados),
 *     para poder re-muestrear con semilla sin volver a correr el analizador.
 *
 * El lenguaje sale de la PRIMERA ubicación del hallazgo, resuelto contra `LANGUAGE_DECLS`
 * (la misma tabla del analizador), igual que M0 — para que las dos tablas sean comparables
 * dígito a dígito.
 *
 * UN repo por proceso (dos `analyzeRepo` en el mismo proceso corrompen el caché de
 * `web-tree-sitter`). Se invoca bajo `scripts/con-analisis.sh`.
 *
 * Uso: npx tsx scripts/u-int-censo.mts <dir> <slug> <salida.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const EXT_TO_LANG = new Map<string, string>();
for (const decl of LANGUAGE_DECLS) for (const ext of decl.extensions) EXT_TO_LANG.set(ext, decl.id);

function languageOfFile(file: string): string {
  return EXT_TO_LANG.get(path.extname(file).toLowerCase()) ?? "?";
}

async function main(): Promise<void> {
  const [, , dir, slug, out] = process.argv;
  if (!dir || !slug || !out) {
    console.error("Uso: npx tsx scripts/u-int-censo.mts <dir> <slug> <salida.json>");
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
    `[u-int] ${slug}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)} wallMs=${wallMs}`,
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
    confidence: string | null;
  }
  const rows: Row[] = [];
  // Censo de NIVEL 1 por (kind, lenguaje) — el cruce obligatorio del encargo.
  const kindLang = new Map<string, number>();

  for (const finding of analysis.findings) {
    const loc = finding.locations[0];
    const lang = loc ? languageOfFile(loc.file) : "?";
    kindLang.set(`${finding.kind}|${lang}`, (kindLang.get(`${finding.kind}|${lang}`) ?? 0) + 1);
    const hyps = finding.hypotheses ?? [];
    if (hyps.length === 0) continue;
    const id = stableFindingId(finding);
    for (const h of hyps) {
      rows.push({
        id,
        repo: slug,
        kind: finding.kind,
        pattern: h.pattern,
        state: h.state,
        lang,
        file: loc?.file ?? "?",
        line: loc?.startLine ?? 0,
        confidence: h.confidence ?? null,
      });
    }
  }

  const kindLangRows = [...kindLang].map(([k, n]) => {
    const [kind, lang] = k.split("|");
    return { kind: kind!, lang: lang!, n };
  });

  writeFileSync(
    out,
    JSON.stringify({ slug, dir: rootDir, wallMs, cacheHit: cache.hit, totalFindings: analysis.findings.length, rows, kindLangRows }, null, 1),
  );
  console.error(`[u-int] ${slug}: ${analysis.findings.length} hallazgos · ${rows.length} hipótesis -> ${out}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
