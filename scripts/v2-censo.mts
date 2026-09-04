/**
 * V2 (Ola V) — censo de COMPOSITE sobre UN repo, con la evidencia que ningún
 * volcado compartido guarda y que este frente necesita para decidir la
 * escalera con datos y no a ojo:
 *
 *  - la fila por hipótesis (patrón, estado, confianza, lenguaje, archivo:línea),
 *  - **el `role` de CADA ubicación del hallazgo ancla** — es donde
 *    `self-referential-member` escribe el TIPO declarado del miembro
 *    (`"children": Folder[]`), el único dato que separa una COLECCIÓN de hijos
 *    (lo que Composite compone) de un enlace escalar (padre, siguiente, vista
 *    cacheada). Sin esto el funnel de la Ola V no se puede medir sin abrir 81
 *    archivos a mano.
 *  - los `checks`/`discriminators` publicados, con su `passed` y su `why`.
 *  - el censo de NIVEL 1 por `kind` (para afirmar, no suponer, que el nivel 1
 *    no se movió entre el "antes" y el "después").
 *
 * `analyzeRepo` SIN caché a propósito: el caché está clavado por SHA del repo +
 * huella del analizador, y con siete frentes editando el mismo árbol una huella
 * nueva aparece cada pocos minutos — un HIT acá sería medir el árbol de otro.
 *
 * Uso: npx tsx scripts/v2-censo.mts <dir> <slug> <salida.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepo, LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const EXT_TO_LANG = new Map<string, string>();
for (const decl of LANGUAGE_DECLS) for (const ext of decl.extensions) EXT_TO_LANG.set(ext, decl.id);
const languageOfFile = (file: string): string => EXT_TO_LANG.get(path.extname(file).toLowerCase()) ?? "?";

const [, , dir, slug, out] = process.argv;
if (!dir || !slug || !out) {
  console.error("Uso: npx tsx scripts/v2-censo.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
const a = await analyzeRepo({ dir: path.resolve(dir), repoName: slug, limits: { maxFindings: "unlimited" } });
const ms = Math.round(performance.now() - t0);

interface Fila {
  id: string;
  repo: string;
  kind: string;
  pattern: string;
  state: string;
  confidence: string | null;
  lang: string;
  file: string;
  line: number;
  /** `file:line (símbolo)` de cada ubicación del ancla. `role` NO viaja: `code-analyzer.ts#toCodeFinding` lo descarta al publicar. */
  roles: string[];
  checks: { id: string; passed: boolean; why: string }[];
}

const filas: Fila[] = [];
const porKind: Record<string, number> = {};
const porKindLang: Record<string, number> = {};

for (const f of a.findings) {
  const loc = f.locations[0];
  const lang = loc ? languageOfFile(loc.file) : "?";
  porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;
  porKindLang[`${f.kind}|${lang}`] = (porKindLang[`${f.kind}|${lang}`] ?? 0) + 1;
  const hyps = f.hypotheses ?? [];
  if (hyps.length === 0) continue;
  const id = f.id ?? stableFindingId(f);
  for (const h of hyps) {
    filas.push({
      id,
      repo: slug,
      kind: f.kind,
      pattern: h.pattern,
      state: h.state,
      confidence: h.confidence ?? null,
      lang,
      file: loc?.file ?? "",
      line: loc?.startLine ?? 0,
      roles: f.locations.map((l) => `${l.file}:${l.startLine}${l.symbol ? ` (${l.symbol})` : ""}`),
      checks: [...(h.checks ?? []), ...(h.discriminators ?? [])].map((c) => ({
        id: (c as { id?: string }).id ?? (c as { label?: string }).label ?? "",
        passed: !!c.passed,
        why: c.why ?? "",
      })),
    });
  }
}

writeFileSync(out, JSON.stringify({ repo: slug, dir, ms, totalHallazgos: a.findings.length, porKind, porKindLang, filas }, null, 1));
const comp = filas.filter((f) => f.pattern === "Composite");
console.log(
  `${slug}: ${a.findings.length} hallazgos · ${filas.length} hipótesis · Composite ${comp.length} ` +
    `(${[...new Set(comp.map((c) => c.state))].join("/") || "—"}) · ancla self-referential-member ${porKind["self-referential-member"] ?? 0} · ${ms}ms`,
);
