/**
 * La compuerta de punta a punta — DIAGNÓSTICO-5B §5, tarea de esta ola,
 * punto 1.
 *
 * La Ola 5 cerró con 1730 tests en verde y el producto COMPLETAMENTE ROTO:
 * 38 detectores registrados, 15 sin tier en `detect/impact.ts`, y
 * `crossAnalyze` tiraba excepción sobre los 8 repos del corpus. Ningún test
 * ejercitaba el camino REAL de producción — todo el resto de la suite corre
 * detectores individuales con fakes (`run.test.ts`) o piezas aisladas
 * (`code-analyzer.test.ts`). Este archivo es el que faltaba: llama
 * `analyzeRepo` exactamente como lo llama `code-inspector.ts` en su rama de
 * caché fría (`limits: { maxFindings: "unlimited" }`, sin `incremental` ni
 * `graphCache` — ver `analyzeWithPersistentCache`), sobre un repo de
 * verdad, SIN mockear el runner de detectores ni el grafo. Sin try/catch: si
 * `crossAnalyze` tira, este test tira, no lo esconde.
 *
 * Única desviación de "exactamente lo que hace `code-inspector.ts`": SÍ pasa
 * `onGraph` (opción pública de `AnalyzeOptions`, un observador puro — no
 * cambia `limits` ni el resultado) para capturar el `CodeGraph` crudo.
 * `CodeAnalysis.graph` (el resumen) lo arma `code-inspector.ts` DESPUÉS de
 * `analyzeRepo` (`summarizeGraph`, privado de ese módulo — ver su propio
 * docstring: "opcional... corrido fuera de `code-inspector.ts`... simplemente
 * no lo trae"), así que una llamada desnuda a `analyzeRepo` JAMÁS lo puebla;
 * `onGraph` es la única vía pública de observar el grafo sin reconstruir esa
 * capa de persistencia entera acá.
 *
 * Dos casos, mismo motivo que `census-golden.test.ts` (que ya resuelve
 * exactamente este dilema para el censo):
 *
 *  - `cobra` (corpus externo, condicional a `CK_CORPUS_DIR` — mismo gate,
 *    mismo `manifest.json`, misma señal "sha desincronizado" que el censo
 *    golden): 19 archivos Go, ~1,4s medidos, un repo REAL de escala
 *    suficiente para que las ocho comprobaciones de `assertRealPathHealthy`
 *    (ver su docstring) tengan producción de verdad que atravesar.
 *  - `tests/fixtures/patterns/` (incondicional, versionado en este repo,
 *    multi-lenguaje: go/js/py/rb/ts/vue): corre SIEMPRE, barato. Existe para
 *    los detectores de PATRONES, y SÍ corre `assertRealPathHealthy` completo
 *    (las mismas ocho comprobaciones que `cobra`), así la compuerta nunca
 *    depende del corpus externo para EXISTIR: en cada `npx vitest run`, con
 *    o sin corpus, corre la misma red de seguridad que atrapó los defectos
 *    de la Ola 5.
 *
 * OLA Q (F4) — SE SACÓ EL PISO LITERAL DE KINDS EN COBRA
 * (`MIN_DISTINCT_KINDS`, "≥12 kinds distintos"). Nació como "cobra emite 14
 * kinds hoy, dejo dos de holgura" — un número escrito a mano contra UNA
 * corrida de UN repo de 19 archivos. Eso no mide nada estructural: mide
 * cuánto encuentran los detectores en ese repo puntual, y ese número BAJA
 * cada vez que una mejora de precisión legítima le saca un falso positivo —
 * pasó tres veces en la Ola P (14→12→11: P6 en `flag-accumulator`, P8 en
 * `inappropriate-intimacy`, P3 sumando `speculative-abstraction`, cada una
 * con su caso citado y correcto) sin que nada se hubiera roto. Bajar el piso
 * de nuevo para volver a verde repite el mismo error con otro número.
 *
 * La garantía que de verdad hacía falta no es "cuántos kinds emite cobra
 * hoy": es "¿las TRES rutas de ejecución del runner (`Detector.scope` de
 * `types.ts` — `intra-function`/`intra-file`/`inter-file`, la partición real
 * de `run.ts#runInterFile`/`runPerLanguage`, no un catálogo de kinds)
 * siguen produciendo hallazgos DE VERDAD sobre un repo real, no sólo
 * `coverage` sin error?". Esa pregunta es estructural — no decae con la
 * precisión de un detector puntual (basta con que UNO de los ~10-20
 * detectores de cada scope siga encontrando algo real), sólo con el colapso
 * de una ruta entera del runner — y por eso es el chequeo (8) de
 * `assertRealPathHealthy`, corre en LOS DOS casos (no sólo cobra, a
 * diferencia del viejo piso) y no necesita ningún número escrito a mano.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeRepo } from "./code-analyzer.js";
import { impactOf } from "./detect/impact.js";
import { DETECTORS } from "./detect/registry.js";
import type { CodeGraph } from "./graph/types.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const GOLDEN_DIR = path.join(ROOT, "tests", "golden");
const FIXTURES_MULTI_DIR = path.join(ROOT, "tests", "fixtures", "patterns");

/**
 * Espejo del `UNLIMITED_STORAGE_LIMITS` privado (no exportado) de
 * `code-inspector.ts` — mismo valor literal, redeclarado acá porque no hay
 * nada que importar. Deliberadamente NO se omite `limits`: sin él,
 * `analyzeRepo` cae a `DEFAULT_ANALYZE_LIMITS` (paginado a ~200 grupos), que
 * es lo que TODO OTRO test de este repo hace por comodidad — nunca lo que
 * `code-inspector.ts` hace en producción. Este archivo existe precisamente
 * para dejar de mockear ese camino.
 */
const UNLIMITED_STORAGE_LIMITS = { maxFindings: "unlimited" } as const;

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

/**
 * Las comprobaciones que SÍ hubieran atrapado el desastre de la Ola 5 —
 * ninguna de ellas mockea nada: (1) no tirar (sin try/catch alrededor de
 * `analyzeRepo`: si `crossAnalyze` explota, el test explota, acá y en
 * CUALQUIER caso que llame a esta función — no sólo en el condicional a
 * corpus); (2) hallazgos no vacíos; (3) ninguna fila de `coverage` en
 * `error` — el síntoma exacto que hubiera delatado "15 detectores sin tier"
 * (`impactOf` tirando dentro de `crossAnalyze` si algo del ranking lo
 * invoca) o cualquier detector que explote silenciosamente; (4) `impactOf`
 * no tira para NINGÚN `detectorId` que aparezca en `coverage` — no sólo los
 * que emitieron hallazgos reales (ese es el único llamado a `impactOf` en
 * el camino de producción, `ranking.ts`, y sólo dispara por hallazgo real:
 * un detector con cobertura pero cero hallazgos en el repo bajo prueba
 * jamás pasaría por ranking.ts, así que la comprobación DIRECTA de "detector
 * sin tier" tiene que ser esta, invocando `impactOf` a mano por cada fila de
 * `coverage`, no una inferencia sobre qué apareció en `findings`); (5) el
 * grafo de código se construyó de verdad (F3), no quedó `null` — sólo se
 * chequea en el caso que además captura `graph` vía `onGraph`; (6)
 * `truncated === false` — centinela del techo de almacenamiento
 * (DIAGNÓSTICO-5B §1: `MAX_STORED_FINDINGS` ignorando `"unlimited"`): un
 * repo chico y limpio JAMÁS debería truncarse con límites sin techo; (7) el
 * registro completo de detectores corrió — el `Set` de `detectorId`
 * distintos en `coverage` cubre EXACTAMENTE `DETECTORS`, ni de menos (un
 * detector nunca invocado por el runner real, silenciosamente) ni de más
 * (un id fantasma que no está en el registro); (8) — OLA Q (F4), reemplaza
 * el viejo piso literal "≥N kinds distintos" en cobra — cada scope
 * estructural del runner (`Detector.scope`: `intra-function`, `intra-file`,
 * `inter-file`) tiene AL MENOS UN `kind` con hallazgos reales
 * (`findings > 0` en alguna fila de `coverage` de ese scope): a diferencia
 * de un piso de diversidad total, que necesita volumen y decae con cada
 * mejora de precisión, esto sólo pide que las tres rutas de ejecución
 * (`run.ts#runInterFile` y las dos ramas de `runPerLanguage`) sigan vivas,
 * algo que hasta un fixture chico puede probar — por eso corre en los DOS
 * casos, no sólo en cobra.
 *
 * Las ocho valen para CUALQUIER repo real, chico o grande, mono-lenguaje o
 * no — por eso viven acá y no en el bloque condicional a `CK_CORPUS_DIR`:
 * si vivieran sólo ahí, la ventana que rompió la Ola 5 (detector sin tier,
 * detector nunca invocado) seguiría abierta en el camino que corre siempre,
 * sin corpus externo.
 */
async function analyzeRealPath(
  dir: string,
  repoName: string,
): Promise<{ analysis: Awaited<ReturnType<typeof analyzeRepo>>; graph: CodeGraph | null }> {
  let graph: CodeGraph | null = null;
  const analysis = await analyzeRepo({ dir, repoName, limits: UNLIMITED_STORAGE_LIMITS, onGraph: (r) => (graph = r.graph) });
  return { analysis, graph };
}

function assertRealPathHealthy(analysis: Awaited<ReturnType<typeof analyzeRepo>>): void {
  expect(analysis.findings.length, "camino real produjo cero hallazgos").toBeGreaterThan(0);

  expect(analysis.coverage, "sin datos de cobertura — el registro de detectores no corrió").toBeDefined();
  const coverage = analysis.coverage!;
  expect(coverage.length).toBeGreaterThan(0);
  const errored = coverage.filter((row) => row.status === "error");
  expect(errored, JSON.stringify(errored, null, 2)).toEqual([]);

  // `CodeFinding` (el contrato de salida) NO lleva `detectorId` — sólo
  // `kind`, que no está garantizado 1:1 con detector. `coverage` sí lo
  // lleva, y una fila existe para CADA detector del registro que corrió
  // sobre este repo (con o sin hallazgos) — ver `aggregateCoverage`. Barrer
  // acá es más fuerte que barrer sólo los detectores con hallazgos: es
  // exactamente la comprobación que `impact.test.ts` hace en abstracto
  // (exhaustividad contra `DETECTORS`) pero contra los detectores que DE
  // VERDAD corrieron en este repo, en el camino real.
  const coveredDetectorIds = new Set(coverage.map((row) => row.detectorId));
  for (const detectorId of coveredDetectorIds) {
    expect(() => impactOf(detectorId), `impactOf tira para "${detectorId}" — detector sin tier en detect/impact.ts`).not.toThrow();
  }

  // Conteo de detectores registrados: el SET de `detectorId` distintos (no
  // `coverage.length` en crudo — un detector `intra-*` aporta una fila POR
  // LENGUAJE presente en el repo, así que en un repo multi-lenguaje
  // `coverage.length` > `DETECTORS.length` aun cuando el registro corrió
  // completo; ver `aggregateCoverage`, clave `detectorId|language`) tiene
  // que cubrir EXACTAMENTE `DETECTORS` — ni faltar uno (nunca invocado por
  // el runner real) ni sobrar uno (id fantasma fuera del registro).
  const registeredIds = new Set(DETECTORS.map((d) => d.id));
  const missing = DETECTORS.map((d) => d.id).filter((id) => !coveredDetectorIds.has(id));
  const extra = [...coveredDetectorIds].filter((id) => !registeredIds.has(id));
  expect(missing, `detectores registrados que nunca corrieron: ${missing.join(", ")}`).toEqual([]);
  expect(extra, `detectorId en coverage que no está en el registro: ${extra.join(", ")}`).toEqual([]);

  expect(analysis.truncated, "un repo chico con límites 'unlimited' no debería truncarse").toBe(false);

  // (8) OLA Q (F4) — ver el docstring de esta función. Por cada scope
  // estructural del runner, al menos un `kind` con hallazgos reales: no
  // "corrió sin error" (eso ya lo prueban 1-7), sino que esa ruta de
  // ejecución produjo algo de verdad sobre un repo real. Robusto a que un
  // detector puntual mejore su precisión — alcanza con que UNO de los
  // ~10-20 detectores de cada scope siga encontrando algo real —; sólo
  // falla si una ruta entera del runner queda muda.
  const SCOPES = ["intra-function", "intra-file", "inter-file"] as const;
  for (const scope of SCOPES) {
    const kindsWithFindings = new Set(coverage.filter((row) => row.scope === scope && row.findings > 0).map((row) => row.kind));
    expect(
      kindsWithFindings.size,
      `scope "${scope}": ningún detector produjo hallazgos reales — ¿la ruta de ejecución de este scope murió?`,
    ).toBeGreaterThan(0);
  }
}

const manifest = readManifest();
const corpusRoot = process.env.CK_CORPUS_DIR;

describe("compuerta de punta a punta — analyzeRepo(), el mismo llamado que code-inspector.ts", () => {
  it(
    "fixtures-multi (incondicional, versionado en este repo): camino real sano sin depender del corpus externo",
    async () => {
      const { analysis } = await analyzeRealPath(FIXTURES_MULTI_DIR, "fixtures-multi");
      assertRealPathHealthy(analysis);
    },
    30_000,
  );

  let skipReason: string | null = null;
  let cobraDir: string | null = null;
  if (!manifest) {
    skipReason = "manifest.json ausente en tests/golden — correr scripts/census-all.sh primero";
  } else if (!corpusRoot) {
    skipReason = "CK_CORPUS_DIR no está seteado";
  } else {
    const entry = manifest.corpus["cobra"];
    if (!entry) {
      skipReason = "cobra no está en manifest.json";
    } else {
      cobraDir = path.join(corpusRoot, entry.path);
      if (!fs.existsSync(cobraDir)) {
        skipReason = `no existe ${cobraDir}`;
      } else {
        const actualSha = gitSha(cobraDir);
        if (actualSha !== entry.sha) {
          skipReason = `sha desincronizado (manifest=${entry.sha}, disco=${actualSha ?? "no es un repo git"}) — re-congelar`;
        }
      }
    }
  }

  const test = skipReason ? it.skip : it;
  test(
    skipReason ? `cobra — SKIP: ${skipReason}` : "cobra: no tira, hallazgos no vacíos, coverage sana, cada scope produce hallazgos reales, grafo construido, sin truncar",
    async () => {
      const { analysis, graph } = await analyzeRealPath(cobraDir as string, "cobra");
      assertRealPathHealthy(analysis);

      expect(graph, "el grafo de código no se construyó").not.toBeNull();
      expect(graph!.nodes.length).toBeGreaterThan(0);

      // Sentinel adicional de exhaustividad del registro (DIAGNÓSTICO-5B
      // §5): cobra es de un solo lenguaje (Go) — cada detector intra-*
      // aporta exactamente una fila de cobertura (ese lenguaje) y cada
      // inter-file exactamente una (sin lenguaje), así que el TOTAL de
      // filas debería coincidir con `DETECTORS.length` cuando el runner de
      // verdad corrió el registro completo sin saltarse ninguno.
      expect(analysis.coverage!.length).toBe(DETECTORS.length);
    },
    120_000,
  );
});
