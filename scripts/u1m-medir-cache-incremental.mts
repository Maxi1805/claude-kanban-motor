/**
 * U1m — ¿la pasada 2 esquiva o invalida el caché incremental por archivo?
 *
 * Simula el patrón real de `code-inspector.ts#analyzeIncremental`: un caché
 * `IncrementalFactsCache` en memoria que persiste ENTRE llamadas a
 * `analyzeRepo` (como el `Map` respaldado por sqlite de `code-inspector.ts`,
 * por `repoKey`), más un `GraphBuildCache` que también persiste entre
 * llamadas (por `repoKey`, igual que `this.graphBuildCache` ahí).
 *
 * Corre 3 "polls" sobre el MISMO directorio, con el MISMO caché en memoria
 * de principio a fin:
 *
 *   poll 1 (frío)   — caché vacío, todo miss. Sin sonda registrada.
 *   poll 2 (tibio)  — se modificó UN archivo en disco. Caché reusado del
 *                     poll 1. Sin sonda: mide el camino de HOY (sólo el
 *                     archivo tocado se re-analiza).
 *   poll 3 (tibio)  — MISMO estado en disco que poll 2 (nada cambió más),
 *                     pero ahora la sonda está registrada (`needsGraph`).
 *                     Mide qué le agrega la pasada 2 a un poll que el caché
 *                     por archivo ya dejó barato.
 *
 * La sonda cuenta invocaciones de `run()` (una por función visitada). Si la
 * pasada 2 respetara el caché incremental por archivo, poll 3 visitaría sólo
 * las funciones del archivo tocado. Si lo esquiva, visita TODAS las
 * funciones del repo otra vez — el mismo número que en un análisis frío.
 *
 * Uso: npx tsx scripts/u1m-medir-cache-incremental.mts <dir-escribible>
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { analyzeRepo, collectFiles } from "../src/server/services/code-analyzer.js";
import type { FileFacts, IncrementalFactsCache } from "../src/server/services/code-analyzer.js";
import { registerExtraDetector } from "../src/server/services/detect/run.js";
import { pisoDeclarado } from "../src/server/services/detect/thresholds.js";
import type { GraphBuildCache } from "../src/server/services/graph/build.js";
import type { IntraFunctionDetector } from "../src/server/services/detect/types.js";

const [, , dir] = process.argv;
if (!dir) {
  console.error("Uso: npx tsx scripts/u1m-medir-cache-incremental.mts <dir-escribible>");
  process.exit(1);
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function hashesDe(dir: string): Promise<Map<string, string>> {
  const files = await collectFiles(dir);
  const out = new Map<string, string>();
  for (const f of files) {
    const buf = await fs.readFile(path.join(dir, f.path));
    out.set(f.path, sha256(buf));
  }
  return out;
}

// El caché por archivo, EN MEMORIA, persistente entre polls — igual espíritu
// que `this.facts` (sqlite) en `code-inspector.ts`, sólo que sin el disco de
// por medio, para que el número no incluya I/O de sqlite.
const filas = new Map<string, { hash: string; facts: FileFacts }>();
let hits = 0;
let misses = 0;
const cache: IncrementalFactsCache = {
  get(p, h) {
    const row = filas.get(p);
    if (row && row.hash === h) {
      hits++;
      return row.facts;
    }
    misses++;
    return undefined;
  },
  put(f) {
    filas.set(f.path, { hash: f.contentHash, facts: f });
  },
};

let sondaVisitas = 0;
const SONDA: IntraFunctionDetector = {
  id: "u1m-sonda-cache",
  scope: "intra-function",
  kind: "long-function",
  title: "sonda U1m — cuenta funciones visitadas por la pasada 2",
  needs: [],
  needsGraph: true,
  thresholds: { min: pisoDeclarado(1, { rationale: "sonda de medición U1m" }) },
  run() {
    sondaVisitas++;
    return [];
  },
};

let graphCachePrevio: GraphBuildCache | null = null;

async function poll(etiqueta: string) {
  const hashes = await hashesDe(dir);
  hits = 0;
  misses = 0;
  sondaVisitas = 0;
  const changedPaths = new Set<string>();
  let construido: { graph: unknown; cache: GraphBuildCache } | null = null;

  const t0 = performance.now();
  const res = await analyzeRepo({
    dir,
    repoName: "u1m-cache",
    limits: { maxFindings: "unlimited" },
    incremental: { contentHashes: hashes, cache },
    graphCache: { previous: graphCachePrevio, changedPaths },
    onGraph: (r) => {
      construido = r;
    },
  });
  const ms = Math.round(performance.now() - t0);
  if (construido) graphCachePrevio = (construido as { cache: GraphBuildCache }).cache;

  console.log(
    JSON.stringify(
      {
        poll: etiqueta,
        ms,
        cacheHits: hits,
        cacheMisses: misses,
        archivosCambiadosDetectados: changedPaths.size,
        sondaVisitas,
        findingsTotal: res.findingsTotal,
      },
      null,
      2,
    ),
  );
}

// --- poll 1: frío, sin sonda ---
await poll("1-frio-sin-sonda");

// --- tocar UN archivo cualquiera ---
const archivos = await collectFiles(dir);
const objetivo = archivos[Math.floor(archivos.length / 2)]!.path;
const p = path.join(dir, objetivo);
await fs.appendFile(p, "\n// u1m-toque-de-medicion\n");
console.error(`[u1m] archivo tocado: ${objetivo}`);

// --- poll 2: tibio, sin sonda (el camino de HOY) ---
await poll("2-tibio-sin-sonda");

// --- registrar la sonda; NADA más cambia en disco ---
registerExtraDetector(SONDA);

// --- poll 3: tibio, con sonda (qué agrega la pasada 2 a un poll barato) ---
await poll("3-tibio-con-sonda");
