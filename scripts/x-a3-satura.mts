/**
 * SONDA A3 (Ola X, frente A3) — mide cuánta población pierde cada detector
 * `inter-file` en su propio tope de volumen (`maxFindings` / `presupuesto()` de
 * `detect/thresholds.ts`), por repo.
 *
 * MÉTODO. `capDetectorFindings` (`detect/run.ts`) es determinista y NO reordena
 * según el cap: `kept = built.length <= cap ? built : built.slice(0, cap)` tras
 * ordenar por severidad. O sea que el conteo con el cap real se DERIVA de un solo
 * número — `built.length` (la población cruda, antes de cortar) — sin correr el
 * análisis dos veces: `keptReal = min(raw, capReal)`.
 *
 * Este script corre UNA sola vez por repo (nunca dos `analyzeRepo` en el mismo
 * proceso — corrompe el caché de `require` de `web-tree-sitter`, ver
 * `census.mts`), con los `maxFindings` de los detectores `inter-file` que lo
 * declaran PARCHEADOS EN MEMORIA a un presupuesto artificialmente alto. El
 * parche:
 *   - nunca toca un archivo en disco (mutación de objeto en RUNTIME, sobre el
 *     objeto YA registrado en `detect/registry.ts#DETECTORS` — mismo `import`
 *     resuelto, mismo objeto, por el cacheo de módulos de Node);
 *   - nunca pasa por `analyzeRepoCached`/el caché compartido de
 *     `analyze-cache.ts` — si lo hiciera, escribiría un resultado con topes
 *     falsos bajo la MISMA clave de caché que una corrida normal (mismo repo +
 *     mismo `analizerFingerprint` + mismos `limits`), sirviéndoselo después a
 *     cualquier otro frente/integrador. Por eso llama a `analyzeRepo` directo.
 *
 * Uso: npx tsx scripts/x-a3-satura.mts <dir-de-un-repo> <repoName> [salida.json]
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { DETECTORS } from "../src/server/services/detect/registry.js";
import { presupuesto } from "../src/server/services/detect/thresholds.js";

const [, , dir, repoName, out] = process.argv;
if (!dir || !repoName) {
  console.error("Uso: npx tsx scripts/x-a3-satura.mts <dir> <repoName> [salida.json]");
  process.exit(1);
}

/** Los 19 kinds `inter-file` que declaran `presupuesto()` en su propio archivo — medido a mano, grep `presupuesto(` bajo `detect/inter-file/*.ts` (excluidos `.test.ts`), Ola X frente A3. `duplication` y `confident-edges` son inter-file y NO están acá: no declaran cap. */
const CAPS: Record<string, number> = {
  "concrete-over-abstraction": 150,
  "coupling-without-abstraction": 50,
  "dependency-cycle": 30,
  "distributed-duplication": 100,
  "divergent-change": 40,
  "fanout-without-cohesion": 40,
  "feature-envy-inter": 100,
  "god-component": 50,
  "import-depth-demeter": 150,
  "inappropriate-intimacy": 40,
  "layer-skip": 150,
  "middle-man": 60,
  "orphan-file": 150,
  "parallel-hierarchies": 30,
  "scattered-instantiation": 50,
  "shotgun-surgery": 60,
  "speculative-abstraction": 100,
  "unstable-dependency": 40,
  "unused-symbol": 200,
};

const HUGE = 200_000;
let patched = 0;
const patchedKinds: string[] = [];
for (const d of DETECTORS) {
  if (Object.prototype.hasOwnProperty.call(CAPS, d.kind)) {
    if (!d.maxFindings) {
      console.error(`[x-a3] AVISO: ${d.kind} está en CAPS pero hoy no declara maxFindings — valor viejo, revisar.`);
      continue;
    }
    (d as { maxFindings?: unknown }).maxFindings = presupuesto(HUGE, {
      rationale: "x-a3 sonda de saturación (Ola X) — NUNCA usar en producción, sólo en este proceso de medición",
    });
    patched++;
    patchedKinds.push(d.kind);
  }
}
const expected = Object.keys(CAPS).length;
console.error(`[x-a3] parcheados ${patched}/${expected} detectores a cap=${HUGE}: ${patchedKinds.sort().join(", ")}`);
if (patched !== expected) {
  console.error(`[x-a3] ERROR: se esperaban ${expected} detectores parcheados y se parchearon ${patched}. Abortando.`);
  process.exit(1);
}

// `onPreCapFindings` entrega `rankedGroupFindings` ANTES del corte de
// `MAX_STORED_FINDINGS` (5000, `code-analyzer.ts:2799`) — un TERCER tope, global,
// posterior a los 19 que esta sonda parchea. Con los 19 caps a 200000 el total del
// repo puede acercarse a ese techo; contar sobre `preCap` (no sobre
// `analysis.findings`) evita que ese tope ajeno contamine la medición de éste.
let preCap: { kind: string }[] | null = null;
const t0 = performance.now();
const analysis = await analyzeRepo({
  dir,
  repoName,
  limits: { maxFindings: "unlimited" },
  onPreCapFindings: (f) => {
    preCap = f as unknown as { kind: string }[];
  },
});
const wallMs = Math.round(performance.now() - t0);

const countedFindings = preCap ?? analysis.findings;
const clippedByStoredCap = countedFindings.length > analysis.findings.length;
if (clippedByStoredCap) {
  console.error(
    `[x-a3] AVISO: MAX_STORED_FINDINGS recortó el total (${countedFindings.length} -> ${analysis.findings.length}); conté sobre el pre-corte.`,
  );
}

const rawByKind: Record<string, number> = {};
for (const f of countedFindings) {
  rawByKind[f.kind] = (rawByKind[f.kind] ?? 0) + 1;
}

const rows = Object.entries(CAPS)
  .map(([kind, cap]) => {
    const raw = rawByKind[kind] ?? 0;
    const lost = Math.max(0, raw - cap);
    return { kind, cap, raw, keptReal: Math.min(raw, cap), saturated: raw > cap, lost };
  })
  .sort((a, b) => b.lost - a.lost);

const result = {
  repoName,
  dir,
  wallMsUncapped: wallMs,
  totalFindingsUncapped: countedFindings.length,
  clippedByMaxStoredFindings: clippedByStoredCap,
  rows,
};

if (out) {
  writeFileSync(out, JSON.stringify(result, null, 1));
  console.error(`[x-a3] ${out} escrito.`);
}
console.log(JSON.stringify(result));
