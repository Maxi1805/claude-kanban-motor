/**
 * Ola 13 — mide la ALTERNATIVA (Parameter Object) que la rama NEGATIVA de
 * Builder emite ahora (`hypotheses/builder.ts#buildAlternative`) contra un
 * repo real, con `ctx.file` VIVO — el `required` propio de la alternativa
 * (`solo-asigna-o-reenvia`) lee el AST, igual que `ensambla-con-logica`, así
 * que sin árbol vivo NUNCA confirma nada (ver el docstring de `builder.ts`,
 * sección "OLA 13").
 *
 * POR QUÉ ESTE SCRIPT RESUELVE `ctx.file` A MANO (`resolveLiveFileUnit`, R1)
 * EN VEZ DE LEER `finding.hypotheses`: el ancla de Builder es
 * `intra-function`/`intra-file`, así que su único paso por `attachHypotheses`
 * ocurre DENTRO de `analyzeFile`, con el árbol vivo — pero `analyzeRepo`
 * libera ese árbol antes de devolver `CodeAnalysis` (sólo `CodeFinding[]`
 * público, sin AST). `buildAlternative` tampoco está cableado en
 * `attachHypotheses` todavía (ver `hypotheses/types.ts#PatternAlternative`,
 * "límite de cableado declarado" — esta ola tiene prohibido tocar `detect/`,
 * que es donde viviría el campo `Finding.alternatives`). Así que este script
 * reparsea BAJO DEMANDA, sólo los archivos que tienen un `Finding`-ancla de
 * Builder, vía `resolveLiveFileUnit` (el mismo mecanismo que R1 le dio a
 * `crossAnalyze`) — mismo idiom que `measure-builder-structural.mts` ya usa
 * para `evaluateGraphShape`, un nivel más abajo (acá hace falta el árbol,
 * ahí hacía falta el grafo).
 *
 * ADAPTADOR `CodeFinding` (público) → `Finding` (interno) — igual criterio
 * que `measure-builder-structural.mts`: sólo rellena lo que `builder.ts`
 * lee de verdad para este camino (`.kind`, `.locations`, `.language`,
 * `.trigger[0]` para `primaryMagnitude`). `.language` SÍ se preserva acá
 * (a diferencia de aquel script): `buildAlternative` lo usa para el TEXTO
 * del remedio (`parameterObjectSuggestion`) — inferido de la extensión del
 * archivo primario, no de `CodeFinding` (que no lo expone).
 *
 * Cachea cada `FileUnit` vivo por ruta (una corrida puede tener varios
 * `Finding`s en el mismo archivo) y libera TODOS los árboles al final —
 * nunca deja uno vivo entre corridas.
 *
 * Uso (SIEMPRE por el semáforo — corrida potencialmente pesada, `analyzeRepo`
 * sobre el repo entero):
 *   ./scripts/con-analisis.sh npx tsx scripts/measure-builder-alternative.mts <dir> <slug> > salida.json
 */
import path from "node:path";

import { analyzeRepo, resolveLiveFileUnit, type LiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { Capability } from "../src/server/services/detect/capabilities.js";
import { pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { Finding, FileUnit, RoleLocation } from "../src/server/services/detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../src/server/services/graph/neighborhood.js";
import { buildAlternative, hypothesis } from "../src/server/services/hypotheses/builder.js";
import type { HypothesisContext, PatternAlternative } from "../src/server/services/hypotheses/types.js";
import type { CodeFinding } from "../src/shared/types.js";

/** Sólo para el TEXTO del remedio (`parameterObjectSuggestion`) — nunca para el criterio. */
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

/** Ver el docstring del módulo — adaptador mínimo, suficiente para lo que `builder.ts` lee. */
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

interface Row {
  slug: string;
  language: string | null;
  file: string;
  startLine: number;
  endLine: number;
  symbol: string | undefined;
  kind: string;
  remedy: string;
  why: string;
  suggestion: string;
  builderAlsoFired: boolean; // debería ser SIEMPRE false — mutuamente exclusivo con Builder; señal de alarma si no.
}

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-builder-alternative.mts <dir> <slug>");
    process.exit(1);
  }
  const absDir = path.resolve(dir);

  const analysis = await analyzeRepo({
    dir: absDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });

  const anchors = new Set<string>(hypothesis.anchors);
  // Ver el mismo dedup, con el mismo motivo, en `sample-builder-alternative-for-judgment.mts`.
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
    const live = await resolveLiveFileUnit(absDir, relPath);
    if (!live) return null;
    liveFiles.set(relPath, live);
    return live.unit;
  }

  const rows: Row[] = [];
  let totalCandidates = 0;
  let builderFired = 0;
  let alternativeFired = 0;
  let neitherFired = 0;

  try {
    for (const cf of candidates) {
      const finding = toInternalFinding(cf);
      if (!finding) continue;
      totalCandidates++;

      const primaryPath = finding.locations[0]!.file;
      const primaryFile = await fileAt(primaryPath);
      // Ola 13/12: `ensambla-con-logica`/`solo-asigna-o-reenvia` sólo miran
      // el archivo PRIMARIO vía `ctx.file` (mismo límite que producción,
      // ver `hypotheses/run.ts#attachHypotheses`: `file: fileAt(primaryPath(finding))`).
      const ctx: HypothesisContext = {
        file: primaryFile,
        fileAt: () => null, // no hace falta resolver OTROS archivos para este ancla intra-*.
        repo: { repoName: slug, files: [], functions: [], clones: [], graph: null },
        capabilities: new Set<Capability>(), // Builder.needs === [].
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
      // (que es `undefined` siempre y silenciaría este script sin avisar).
      const alt: PatternAlternative | null = buildAlternative(finding, null, ctx);

      if (builderH) builderFired++;
      if (alt) alternativeFired++;
      if (!builderH && !alt) neitherFired++;

      if (alt) {
        const loc = finding.locations[0]!;
        rows.push({
          slug,
          language: finding.language,
          file: loc.file,
          startLine: loc.startLine,
          endLine: loc.endLine,
          symbol: loc.symbol,
          kind: finding.kind,
          remedy: alt.remedy,
          why: alt.why,
          suggestion: alt.suggestion,
          builderAlsoFired: builderH !== null,
        });
      }
    }
  } finally {
    for (const live of liveFiles.values()) live.release();
  }

  console.log(
    JSON.stringify(
      {
        slug,
        dir: absDir,
        totalCandidateFindings: totalCandidates,
        builderFired,
        alternativeFired,
        neitherFired,
        rows,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
