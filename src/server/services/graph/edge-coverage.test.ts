/**
 * LA COMPUERTA DE COBERTURA DE ARISTAS — CONTRATO-F9.md §5, Ola 9 (F6).
 *
 * "Cada tipo de arista emite en todo lenguaje que tenga esa construcción, o
 * declara por qué no." Réplica EXACTA del patrón de
 * `detect/language-coverage.test.ts` — dos bloques:
 *
 *  1. `verdictForEdgeCell`/`edgeCoverageMatrix` (`edge-coverage.ts`, F0) +
 *     `applyWaivers` (ACÁ, F6) puros, con specs/muestras FALSOS — corre
 *     siempre, sin corpus. Incluye la prueba de que la compuerta ATRAPA una
 *     regresión real: una arista que emitía y deja de emitir en un lenguaje
 *     que la tiene se pone ROJA sin waiver, y una exención vencida (la celda
 *     ya emite) se pone roja EN LA OTRA DIRECCIÓN. No es hipotético: los
 *     números de la primera prueba son los medidos de A7 (guava, `imports`,
 *     0 antes del fix de `graph/imports-target.ts#dottedModuleTarget` → 15
 *     después — ver ese archivo).
 *  2. El corpus real de 8 repos — CONDICIONAL, mismo patrón EXACTO que
 *     `census-golden.test.ts`/`detect/language-coverage.test.ts`: sin
 *     `CK_CORPUS_DIR`, o si el repo no está en disco, o el SHA no coincide
 *     con `tests/golden/manifest.json`, el caso se `it.skip`-ea con el
 *     motivo en el nombre — `npx vitest run` tiene que quedar verde SIN el
 *     corpus en la máquina.
 *
 * Este bloque 2 corre `scripts/edge-coverage.mts` COMO SUBPROCESO, una vez
 * por repo (nunca `analyzeRepo` dos veces en este mismo proceso —
 * `web-tree-sitter` corrompe su caché de `require`, ver `census.ts`).
 *
 * *** ROJA EL DÍA 1, PERO NO BLOQUEANTE — §5.4. *** `edge-coverage-waivers.json`
 * (`tests/golden/`) es la lista congelada de celdas conocidas y todavía
 * abiertas. El test falla si aparece una celda `mudo-sin-razon` que NO está
 * en la lista (violación real, sin blanquear) y falla TAMBIÉN si una celda
 * de la lista ya emite (`emitio`) — la exención quedó vencida y hay que
 * borrar su línea. Las dos direcciones, siempre. Cada frente que arregla una
 * celda borra su línea del JSON; cuando el archivo queda vacío, la compuerta
 * pasa a ser dura sin que nadie tenga que acordarse.
 */
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { LANGUAGES_MEASURED } from "../detect/language-coverage.js";
import { edgeCoverageMatrix, verdictForEdgeCell, type EdgeCoverageCell, type EdgeCoverageSample } from "./edge-coverage.js";
import { EDGE_KIND_SPECS } from "./edge-kinds.js";
import type { EdgeKind } from "./types.js";

/**
 * Forma que produce `scripts/edge-coverage.mts` por repo — duplicada acá a
 * propósito (no importada del script): un `.test.ts` importando de un
 * `.mts` fuera de `src/` es territorio sin precedente en este proyecto (los
 * scripts SIEMPRE importan DE `src/`, nunca al revés — mismo sentido que
 * `scripts/language-coverage.mts` importando `RepoCoverageSample` de
 * `detect/language-coverage.ts`, no lo opuesto). Si esta forma diverge de la
 * real, la deserialización de `runWorker` revienta en la corrida de corpus
 * — no hay manera de que se desincronice en silencio.
 */
interface RepoEdgeCoverageSample {
  slug: string;
  languageFacts: Record<string, { filesAnalysed: number; lines: number }>;
  edgesByKindLanguage: Record<string, number>;
}

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const GOLDEN_DIR = path.join(ROOT, "tests", "golden");
const WORKER_SCRIPT = path.join(ROOT, "scripts", "edge-coverage.mts");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");
const WAIVERS_PATH = path.join(GOLDEN_DIR, "edge-coverage-waivers.json");

export interface EdgeCoverageWaiver {
  readonly kind: string;
  readonly language: string;
  readonly razon: string;
  readonly ola: number;
}

/* ────────────────────────────────────────────────────────────────────────
 * La aplicación de waivers — CONTRATO-F9.md §5.4, "las dos direcciones".
 * ──────────────────────────────────────────────────────────────────────── */

export interface WaiverApplication {
  /** Celdas `mudo-sin-razon` SIN waiver que las cubra — rompen la compuerta. */
  readonly violations: readonly EdgeCoverageCell[];
  /** Waivers cuya celda YA emite (`emitio`) — la exención quedó vencida, hay que borrar la línea. */
  readonly staleWaivers: readonly EdgeCoverageWaiver[];
}

function waiverKey(kind: string, language: string): string {
  return `${kind} ${language}`;
}

export function applyWaivers(cells: readonly EdgeCoverageCell[], waivers: readonly EdgeCoverageWaiver[]): WaiverApplication {
  const byKey = new Map<string, EdgeCoverageWaiver>();
  for (const w of waivers) byKey.set(waiverKey(w.kind, w.language), w);

  const violations: EdgeCoverageCell[] = [];
  const staleWaivers: EdgeCoverageWaiver[] = [];
  for (const cell of cells) {
    const waiver = byKey.get(waiverKey(cell.kind, cell.language));
    if (cell.verdict === "mudo-sin-razon") {
      if (!waiver) violations.push(cell); // sin blanquear — VIOLACIÓN.
      continue;
    }
    if (cell.verdict === "emitio" && waiver) staleWaivers.push(waiver); // exención vencida.
  }
  return { violations, staleWaivers };
}

/* ────────────────────────────────────────────────────────────────────────
 * Bloque 1 — lógica pura, sin corpus.
 * ──────────────────────────────────────────────────────────────────────── */

function sample(overrides: Partial<EdgeCoverageSample> = {}): EdgeCoverageSample {
  return { language: "java", filesAnalysed: 3229, lines: 400_000, edgesEmitted: 0, capabilities: new Set(["imports"]), ...overrides };
}

describe("applyWaivers — CONTRATO-F9.md §5.4, las dos direcciones", () => {
  it("SIN waiver: una arista que existía y deja de emitir en un lenguaje que la tiene ⇒ ROJA (mudo-sin-razon) — la compuerta la atrapa", () => {
    // *** PRUEBA REAL, NO HIPOTÉTICA. *** Antes del fix de A7 (esta tarea):
    // `graph/imports-target.ts#resolveImportTarget` cortaba con
    // `!spec.startsWith(".")` para todo especificador ABSOLUTO separado por
    // PUNTOS (Java `import com.foo.Bar;`) — medido: guava daba `imports
    // java: 0` pese a tener `import_declaration` real (capacidad `imports`
    // presente, 1977 archivos analizados, sobre el piso de medición). Este
    // `sample` es exactamente ese estado, byte a byte. Si alguien revierte
    // `dottedModuleTarget` mañana, ESTA es la forma en que vuelve a pasar.
    const cell = verdictForEdgeCell(EDGE_KIND_SPECS.imports, sample({ edgesEmitted: 0 }));
    expect(cell.verdict).toBe("mudo-sin-razon");

    const { violations } = applyWaivers([cell], []); // ninguna línea en waivers.json todavía
    expect(violations).toHaveLength(1); // ROJO.
    expect(violations[0]).toMatchObject({ kind: "imports", language: "java" });
  });

  it("CON waiver vigente: la MISMA celda rota queda blanqueada — no rompe la compuerta mientras se arregla", () => {
    const cell = verdictForEdgeCell(EDGE_KIND_SPECS.imports, sample({ edgesEmitted: 0 }));
    const waiver: EdgeCoverageWaiver = { kind: "imports", language: "java", razon: "A7 — en investigación", ola: 9 };
    const { violations } = applyWaivers([cell], [waiver]);
    expect(violations).toHaveLength(0);
  });

  it("waiver VENCIDO: una vez arreglada (la celda ya emite), la línea sobrante rompe la compuerta EN LA OTRA DIRECCIÓN — obliga a borrarla", () => {
    // *** TAMBIÉN MEDIDO. *** Tras el fix de A7: guava da `imports java: 15`
    // (ver `graph/imports-target.test.ts` y el informe de esta tarea). Si la
    // línea de waiver para `(imports, java)` siguiera en el JSON, esto es lo
    // que tiene que fallar y avisar "sacá esta línea, ya no aplica".
    const cell = verdictForEdgeCell(EDGE_KIND_SPECS.imports, sample({ edgesEmitted: 15 }));
    expect(cell.verdict).toBe("emitio");
    const waiver: EdgeCoverageWaiver = { kind: "imports", language: "java", razon: "ya no debería estar", ola: 9 };
    const { staleWaivers, violations } = applyWaivers([cell], [waiver]);
    expect(staleWaivers).toHaveLength(1); // ROJO, la otra dirección.
    expect(violations).toHaveLength(0);
  });

  it("una celda `sin-construccion`/`no-aplicable`/`sin-muestra` nunca necesita waiver, con o sin uno presente", () => {
    const noAplicable = verdictForEdgeCell(EDGE_KIND_SPECS.extends, sample({ language: "go", capabilities: new Set() }));
    expect(noAplicable.verdict).toBe("no-aplicable");
    expect(applyWaivers([noAplicable], []).violations).toHaveLength(0);
    expect(applyWaivers([noAplicable], []).staleWaivers).toHaveLength(0);
  });
});

describe("edgeCoverageMatrix + applyWaivers, matriz completa", () => {
  it("una celda mudo-sin-razon por kind sin waiver ⇒ tantas violaciones como celdas rotas", () => {
    const cells = edgeCoverageMatrix(Object.values(EDGE_KIND_SPECS), new Map(), ["java"]);
    // Sin muestra real (Map vacío) todas las celdas dan `sin-muestra` (0 archivos < piso) — cero violaciones.
    expect(applyWaivers(cells, []).violations).toHaveLength(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Bloque 2 — el corpus real (8 repos), CONDICIONAL.
 * ──────────────────────────────────────────────────────────────────────── */

const ALL_KINDS: readonly EdgeKind[] = [
  "contains",
  "references",
  "extends",
  "implements",
  "mixes-in",
  "instantiates",
  "imports",
  "satisfies",
  "calls",
  "affects",
  "carries",
  "invokes-indirect",
];

/**
 * Subconjunto de `FROZEN_MATRIX` (`capability-matrix.test.ts`, la matriz 9×11
 * ya verificada contra las sondas REALES de producción cada corrida) — sólo
 * las capacidades que `EDGE_KIND_SPECS[...].needs` usa hoy
 * (`herencia`/`interfaz`/`unidad-tipo-clase`/`modulos`/`imports`). Copiado,
 * no recalculado acá: recalcular exigiría un SEGUNDO `require("web-tree-sitter")`
 * en el mismo proceso donde `scripts/edge-coverage.mts` ya corre `analyzeRepo`
 * — el mismo riesgo de caché corrupto que `code-analyzer.ts#loadRuntime`
 * documenta (ver también el docstring de ese script). Si esta tabla diverge
 * de la sonda real, `capability-matrix.test.ts` se pone rojo PRIMERO —
 * ninguna compuerta depende de que ésta, sola, se mantenga sincronizada.
 * Ampliar `EDGE_KIND_SPECS.needs` a una capacidad nueva exige agregar su
 * columna acá.
 */
const CAPABILITIES_BY_LANGUAGE: ReadonlyMap<string, ReadonlySet<Capability>> = new Map([
  ["ruby", new Set<Capability>(["unidad-tipo-clase", "herencia", "modulos"])],
  ["typescript", new Set<Capability>(["unidad-tipo-clase", "herencia", "interfaz", "imports", "modulos"])],
  ["tsx", new Set<Capability>(["unidad-tipo-clase", "herencia", "interfaz", "imports", "modulos"])],
  ["vue", new Set<Capability>(["unidad-tipo-clase", "herencia", "interfaz", "imports", "modulos"])],
  ["javascript", new Set<Capability>(["unidad-tipo-clase", "herencia", "imports"])],
  ["python", new Set<Capability>(["unidad-tipo-clase", "herencia", "imports", "modulos"])],
  ["go", new Set<Capability>(["interfaz", "imports", "modulos"])],
  ["java", new Set<Capability>(["unidad-tipo-clase", "herencia", "interfaz", "imports", "modulos"])],
  ["csharp", new Set<Capability>(["unidad-tipo-clase", "herencia", "interfaz", "imports", "modulos"])],
]);

/**
 * Agrega N muestras de repo en una `EdgeCoverageSample` por `(kind,
 * lenguaje)` y calcula el veredicto de cada una llamando `verdictForEdgeCell`
 * DIRECTO — a propósito, NO vía `edgeCoverageMatrix(specs, Map, ...)`.
 * `edgeCoverageMatrix` exige que el caller arme un `Map` cuya clave
 * coincida BYTE A BYTE con la que arma internamente (`` `${spec.kind}X${language}` ``
 * para algún separador `X` — HOY es ` `, no un espacio, verificado
 * corriendo `edgeCoverageMatrix.toString()` contra la fuente real: cambió
 * mientras esta tarea corría, evidencia de que otro agente tocó
 * `graph/edge-coverage.ts` en paralelo). Depender de ESE detalle interno es
 * frágil por diseño — `verdictForEdgeCell(spec, sample)` no tiene ningún
 * paso de `Map`/clave de por medio, así que evita la clase entera de bug.
 */
function computeCells(repoSamples: readonly RepoEdgeCoverageSample[], kinds: readonly EdgeKind[], languages: readonly string[]): EdgeCoverageCell[] {
  const filesByLang = new Map<string, number>();
  const linesByLang = new Map<string, number>();
  for (const s of repoSamples) {
    for (const [lang, facts] of Object.entries(s.languageFacts)) {
      if (!languages.includes(lang)) continue;
      filesByLang.set(lang, (filesByLang.get(lang) ?? 0) + facts.filesAnalysed);
      linesByLang.set(lang, (linesByLang.get(lang) ?? 0) + facts.lines);
    }
  }
  const cells: EdgeCoverageCell[] = [];
  for (const kind of kinds) {
    const spec = EDGE_KIND_SPECS[kind];
    for (const lang of languages) {
      let edgesEmitted = 0;
      for (const s of repoSamples) edgesEmitted += s.edgesByKindLanguage[`${kind} ${lang}`] ?? 0;
      const sample: EdgeCoverageSample = {
        language: lang,
        filesAnalysed: filesByLang.get(lang) ?? 0,
        lines: linesByLang.get(lang) ?? 0,
        edgesEmitted,
        capabilities: CAPABILITIES_BY_LANGUAGE.get(lang) ?? new Set(),
      };
      cells.push(verdictForEdgeCell(spec, sample));
    }
  }
  return cells;
}

function readWaivers(): EdgeCoverageWaiver[] {
  try {
    return JSON.parse(fs.readFileSync(WAIVERS_PATH, "utf8")) as EdgeCoverageWaiver[];
  } catch {
    return [];
  }
}

interface Manifest {
  corpus: Record<string, { sha: string; path: string }>;
}

function readManifest(): Manifest | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, "manifest.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

function gitSha(dir: string): string | null {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const execFileAsync = promisify(execFile);

/** Un proceso, async — ver `census-golden.test.ts#runCensus` para por qué async (guava tarda >1 min). */
async function runWorker(dir: string, slug: string): Promise<RepoEdgeCoverageSample> {
  const { stdout, stderr } = await execFileAsync(TSX_BIN, [WORKER_SCRIPT, dir, slug], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  // Reenvía el log `[analyzer-cache]` de `edge-coverage.mts` — mismo motivo que
  // `census-golden.test.ts#runCensus`: sin esto el hit/miss existe pero nadie lo ve.
  if (stderr.trim()) console.error(stderr.trim());
  return JSON.parse(stdout) as RepoEdgeCoverageSample;
}

const manifest = readManifest();
const corpusRoot = process.env.CK_CORPUS_DIR;

describe("cobertura de aristas — corpus real (CONTRATO-F9.md §5)", () => {
  if (!manifest) {
    it.skip("manifest.json ausente en tests/golden — correr scripts/census-all.sh primero", () => {});
    return;
  }

  const availableSlugs: { slug: string; dir: string }[] = [];
  for (const [slug, entry] of Object.entries(manifest.corpus)) {
    const dir = corpusRoot ? path.join(corpusRoot, entry.path) : null;
    const skipReason = !corpusRoot
      ? "CK_CORPUS_DIR no está seteado"
      : !dir || !fs.existsSync(dir)
        ? `no existe ${dir}`
        : gitSha(dir) !== entry.sha
          ? "sha desincronizado — re-congelar"
          : null;
    if (skipReason) {
      it.skip(`${slug} — SKIP: ${skipReason}`, () => {});
    } else {
      availableSlugs.push({ slug, dir: dir as string });
    }
  }

  if (availableSlugs.length === 0) return;

  it(
    "cada (kind, lenguaje) emite en todo lenguaje que tenga esa construcción, o declara por qué no — TODO el corpus disponible",
    async () => {
      // REGLA DE MEMORIA — un repo por vez, guava sola. `Promise.all` acá
      // lanzaba los 8 repos del corpus (guava incluida) como subprocesos EN
      // PARALELO, la misma forma que causó el incidente medido de la regla
      // de memoria (14,5 GB de 15,7, SIGTERM, sesiones de Claude muertas,
      // incluida la del workflow que corría). `for...of` con `await` adentro
      // corre los `runWorker` uno detrás del otro — mismo patrón de
      // serialización que `census-golden.test.ts`/`ranking-acceptance.test.ts`.
      const repoSamples: RepoEdgeCoverageSample[] = [];
      for (const { dir, slug } of availableSlugs) {
        repoSamples.push(await runWorker(dir, slug));
      }
      const cells = computeCells(repoSamples, ALL_KINDS, [...LANGUAGES_MEASURED]);
      const waivers = readWaivers();
      const { violations, staleWaivers } = applyWaivers(cells, waivers);

      console.log(`\n[cobertura-de-aristas] ${availableSlugs.length}/${Object.keys(manifest.corpus).length} repos del corpus disponibles.`);
      const emitted = cells.filter((c) => c.verdict === "emitio");
      console.log(`[cobertura-de-aristas] ${emitted.length}/${cells.length} celdas EMITEN. ${waivers.length} waiver(s) en el archivo.`);
      if (violations.length > 0) {
        console.log(`\n[cobertura-de-aristas] ${violations.length} celda(s) mudas SIN razón declarada (rompen la compuerta):`);
        for (const v of violations) console.log(`  (${v.kind}, ${v.language}) — n=${v.n}`);
      }
      if (staleWaivers.length > 0) {
        console.log(`\n[cobertura-de-aristas] ${staleWaivers.length} waiver(s) VENCIDO(S) — la celda ya emite, borrar la línea de ${path.relative(ROOT, WAIVERS_PATH)}:`);
        for (const w of staleWaivers) console.log(`  (${w.kind}, ${w.language}) — "${w.razon}"`);
      }

      expect(violations, `${violations.length} celda(s) sin razón declarada`).toEqual([]);
      expect(staleWaivers, `${staleWaivers.length} waiver(s) vencido(s) — borrar del JSON`).toEqual([]);
    },
    900_000,
  );
});
