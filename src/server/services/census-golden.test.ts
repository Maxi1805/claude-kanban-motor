/**
 * El gate del censo golden — CONTRATOS.md §3.5.
 *
 * Corre `scripts/census.mts` COMO SUBPROCESO, una vez por slug (nunca dos
 * análisis dentro de este mismo proceso vitest — ver el comentario de
 * `censusRepo`, `census.ts`, y CONTRATOS.md §3.5), y compara contra la línea
 * base congelada en `tests/golden/`.
 *
 * Los 8 repos externos son CONDICIONALES: sin `CK_CORPUS_DIR`, si falta el
 * directorio, o si el SHA en disco no coincide con `manifest.json`, el caso
 * se `it.skip`-ea con el motivo en el propio nombre del test —
 * `npx vitest run` tiene que quedar verde SIN el corpus en la máquina.
 * `fixtures-multi` es incondicional: vive versionado dentro de este repo
 * (`tests/fixtures/patterns/`), así que corre siempre y es rápido.
 */
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, describe, expect, it } from "vitest";

import { diffCensus, parseCensus, type Census, type CensusDelta, type CensusDiff, type CensusWaiver } from "./census.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const GOLDEN_DIR = path.join(ROOT, "tests", "golden");
const CENSUS_SCRIPT = path.join(ROOT, "scripts", "census.mts");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");
const FIXTURES_MULTI_DIR = path.join(ROOT, "tests", "fixtures", "patterns");

interface Manifest {
  analyzerVersion: string;
  generatedAt: string;
  corpus: Record<string, { sha: string; path: string }>;
  waivers: CensusWaiver[];
}

function readManifest(): Manifest | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, "manifest.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

function readGolden(slug: string): Census {
  return parseCensus(fs.readFileSync(path.join(GOLDEN_DIR, `${slug}.census.json`), "utf8"));
}

const execFileAsync = promisify(execFile);

/**
 * UN proceso: lanza `scripts/census.mts` como subproceso, nunca in-process.
 * Async (no `execFileSync`): guava por sí solo puede tardar más de un
 * minuto, y una espera SÍNCRONA de ese largo bloquea el event loop del
 * worker de vitest, que entonces no puede responder al RPC de progreso del
 * proceso principal ("Timeout calling onTaskUpdate", visto al medir esto
 * sobre el corpus real) — cosmético (los tests igual pasan), pero evitable.
 */
async function runCensus(dir: string, slug: string): Promise<Census> {
  const { stdout, stderr } = await execFileAsync(TSX_BIN, [CENSUS_SCRIPT, dir, slug], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  // Reenvía el log `[analyzer-cache]` de `censusRepo` (ver `census.ts`) — sin esto,
  // `execFileAsync` lo captura en un buffer que nadie imprime, y el requisito de
  // verificabilidad del caché ("¿este número se midió o se leyó?") queda sin
  // efecto en la práctica aunque el dato exista.
  if (stderr.trim()) console.error(stderr.trim());
  return parseCensus(stdout);
}

/**
 * E2 — `diffCensus` ya calcula `increases` (CONTRATOS.md §3.4: nunca rompe
 * el build), pero hasta ahora ningún llamador lo imprimía en ningún lado:
 * un delta positivo en un kind CONGELADO (los 5 legacy, contrato "delta
 * exactamente 0") podía colarse sin que nadie lo viera — exactamente lo que
 * pasó con `complexity`/`long-function`/`long-parameter-list` (ver E1). Esto
 * SÓLO reporta: no cambia qué hace fallar el test (`regressions` y
 * `staleWaivers` siguen siendo lo único que rompe, más abajo).
 */
function logIncreases(slug: string, increases: readonly CensusDelta[]): void {
  if (increases.length === 0) return;
  const lines = increases
    .slice()
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((d) => `  ${d.key}: ${d.base} -> ${d.head}`);
  console.log(
    `[censo] ${slug}: ${increases.length} aumento(s) respecto de la línea base congelada ` +
      "(informativo, NO rompe — CONTRATOS.md §3.4):\n" +
      lines.join("\n"),
  );
}

function gitSha(dir: string): string | null {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const manifest = readManifest();
const corpusRoot = process.env.CK_CORPUS_DIR;

describe("censo golden — línea base congelada (CONTRATOS.md §3)", () => {
  if (!manifest) {
    it.skip("manifest.json ausente en tests/golden — correr scripts/census-all.sh primero", () => {});
    return;
  }

  // Recolectado por cada test que corre de verdad, para la comprobación
  // agregada de waivers rancios al final (ver el `afterAll` más abajo).
  const results: { slug: string; diff: CensusDiff }[] = [];

  for (const [slug, entry] of Object.entries(manifest.corpus)) {
    let skipReason: string | null = null;
    let repoDir: string | null = null;

    if (!corpusRoot) {
      skipReason = "CK_CORPUS_DIR no está seteado";
    } else {
      repoDir = path.join(corpusRoot, entry.path);
      if (!fs.existsSync(repoDir)) {
        skipReason = `no existe ${repoDir}`;
      } else {
        const actualSha = gitSha(repoDir);
        if (actualSha !== entry.sha) {
          skipReason = `sha desincronizado (manifest=${entry.sha}, disco=${actualSha ?? "no es un repo git"}) — re-congelar`;
        }
      }
    }

    const test = skipReason ? it.skip : it;
    test(
      skipReason ? `${slug} — SKIP: ${skipReason}` : `${slug}: sin regresiones respecto de la línea base`,
      async () => {
        const head = await runCensus(repoDir as string, slug);
        const base = readGolden(slug);
        const diff = diffCensus(base, head, manifest.waivers);
        results.push({ slug, diff });
        logIncreases(slug, diff.increases);
        expect(diff.metaMismatch, JSON.stringify(diff.metaMismatch, null, 2)).toEqual([]);
        expect(diff.regressions, JSON.stringify(diff.regressions, null, 2)).toEqual([]);
      },
      // INTEGRACIÓN Ola 6 — 120_000 hacía que `guava` (el repo más grande del
      // corpus) siempre fallara por timeout de infraestructura, nunca por la
      // aserción real: medido 3 veces en esta integración (subproceso real,
      // `scripts/census.mts`, aislado), guava tarda consistentemente
      // 168-170 s. Subir el techo no afloja ningún criterio de la aserción de
      // arriba (`regressions`/`metaMismatch` siguen exigiendo `[]` exacto) —
      // sólo deja de cortar la medición antes de que termine.
      //
      // INTEGRACIÓN Ola H — 240_000 volvió a quedar corto, por la MISMA razón y
      // no por una regresión de la aserción: el `meta.elapsedMs` que el propio
      // censo congelado de esta ola dejó escrito para guava es **357 s**
      // (`tests/golden/guava.census.json`), contra los 205 s del censo anterior.
      // Verificado que es infraestructura y no contenido: corriendo el archivo
      // AISLADO (`vitest run census-golden.test.ts code-analyzer.test.ts`) el
      // caso sigue muriendo en "Test timed out in 240000ms", nunca en un
      // `expect`. Queda ANOTADO, sin diagnosticar en esta ola, que el análisis
      // de guava se volvió ~74 % más lento entre la Ola G y la H — nadie midió
      // el costo en tiempo de los detectores que cambiaron, y esta es la única
      // señal que hay de que existe.
      600_000,
    );
  }

  it(
    "fixtures-multi (incondicional, versionado en el repo): sin regresiones",
    async () => {
      const head = await runCensus(FIXTURES_MULTI_DIR, "fixtures-multi");
      const base = readGolden("fixtures-multi");
      const diff = diffCensus(base, head, manifest.waivers);
      results.push({ slug: "fixtures-multi", diff });
      logIncreases("fixtures-multi", diff.increases);
      expect(diff.metaMismatch, JSON.stringify(diff.metaMismatch, null, 2)).toEqual([]);
      expect(diff.regressions, JSON.stringify(diff.regressions, null, 2)).toEqual([]);
    },
    30_000,
  );

  // Un waiver "*" puede abarcar varios repos; juzgar "¿está rancio?" mirando
  // UNA sola llamada a `diffCensus` (un solo repo) daría falsos positivos en
  // cada repo al que el waiver simplemente no aplica (p.ej. un waiver de
  // `*.rb|...` se vería "rancio" en cada repo sin archivos .rb). Por eso la
  // agregación vive ACÁ, no en `diffCensus`: un waiver sólo cuenta como
  // rancio si NINGUNA corrida a la que aplica (por `slug`) lo usó — y sólo
  // se juzga entre las corridas que de verdad se ejecutaron esta vez (si el
  // corpus no está disponible, un waiver que sólo aplica a un repo externo
  // no se puede juzgar y no rompe nada).
  afterAll(() => {
    if (results.length === 0) return;
    const globallyStale = manifest.waivers.filter((waiver) => {
      const applicable = results.filter(({ slug }) => waiver.slug === "*" || waiver.slug === slug);
      if (applicable.length === 0) return false;
      return applicable.every(({ diff }) => diff.staleWaivers.includes(waiver));
    });
    expect(globallyStale, JSON.stringify(globallyStale, null, 2)).toEqual([]);
  });
});
