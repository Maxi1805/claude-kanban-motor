/**
 * LA MEDICIÓN DEL COSTO DE LA UNIFICACIÓN — Ola N, frente U1.
 *
 * El usuario decidió unificar ANTES de saber el costo, con la condición
 * explícita de poder volver atrás si empeora. Este script es lo que produce el
 * número que le dice si empeoró.
 *
 * Corre `analyzeRepo` SIN el caché de análisis (se llama directo, no vía
 * `analyzeRepoCached`), y reporta tiempo de pared, pico de RSS real del
 * proceso (`process.resourceUsage().maxRSS`, en KB, no una muestra) y el total
 * de hallazgos CRUDOS (`findingsTotal`: antes de agrupar y antes de cualquier
 * corte — la única cuenta que no se puede mover por agrupación).
 *
 * Tres modos, que son exactamente las tres filas de la tabla del brief:
 *   una-pasada       `CK_ANALISIS_DOS_PASADAS=0` — el comportamiento de hoy.
 *   dos-pasadas      el mecanismo puesto, sin ningún detector que opte.
 *   dos-pasadas+sonda  igual, más UN detector `intra-function` trivial que
 *                    declara `needsGraph` y no emite nada: aísla el costo del
 *                    MECANISMO (el reparseo de la pasada 2) del costo que
 *                    tendría un detector real.
 *
 * Uso: npx tsx scripts/u1-medir-unificacion.mts <dir> <una-pasada|dos-pasadas|dos-pasadas-sonda>
 */
import { analyzeRepo, collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { registerExtraDetector } from "../src/server/services/detect/run.js";
import { pisoDeclarado } from "../src/server/services/detect/thresholds.js";
import type { IntraFunctionDetector } from "../src/server/services/detect/types.js";

const [, , dir, modo] = process.argv;
const MODOS = ["una-pasada", "dos-pasadas", "dos-pasadas-sonda", "solo-reparseo"];
if (!dir || !modo || !MODOS.includes(modo)) {
  console.error(`Uso: npx tsx scripts/u1-medir-unificacion.mts <dir> <${MODOS.join("|")}>`);
  process.exit(1);
}

if (modo === "una-pasada") process.env.CK_ANALISIS_DOS_PASADAS = "0";
else delete process.env.CK_ANALISIS_DOS_PASADAS;

let unidadesVisitadas = 0;

/**
 * LA SONDA. Trivial a propósito: pide el grafo, cuenta la unidad y no emite
 * NADA. Lo que mide su fila de la tabla es el precio del mecanismo (reparsear
 * los archivos, construir el índice del grafo, volver a llamar al runner), no
 * el precio de una regla.
 */
const SONDA: IntraFunctionDetector = {
  id: "u1-sonda-de-medicion",
  scope: "intra-function",
  kind: "long-function",
  title: "sonda de medición U1",
  needs: [],
  needsGraph: true,
  thresholds: { min: pisoDeclarado(1, { rationale: "sonda de medición" }) },
  run() {
    unidadesVisitadas++;
    return [];
  },
};

if (modo === "dos-pasadas-sonda") registerExtraDetector(SONDA);

/**
 * MODO AISLADO. El costo de la pasada 2 medido SOLO, sin el resto del
 * pipeline: exactamente el trabajo que agrega (leer + parsear + `walkFile` +
 * `buildFileUnit`, un árbol vivo por vez, liberado en el acto). Existe porque
 * sobre un repo grande, y con doce frentes más usando la máquina, la
 * diferencia entre "con sonda" y "sin sonda" queda por debajo del ruido de
 * corrida a corrida — y un número que el ruido tapa no es una medición.
 */
if (modo === "solo-reparseo") {
  const archivos = await collectFiles(dir);
  const t = performance.now();
  let vivos = 0;
  let funciones = 0;
  for (const f of archivos) {
    const live = await resolveLiveFileUnit(dir, f.path);
    if (!live) continue;
    vivos++;
    funciones += live.unit.functions.length;
    live.release();
  }
  console.log(
    JSON.stringify(
      {
        dir,
        modo,
        reparseoMs: Math.round(performance.now() - t),
        picoRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
        archivosVistos: archivos.length,
        archivosReparseados: vivos,
        funcionesReconstruidas: funciones,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const t0 = performance.now();
const analisis = await analyzeRepo({ dir, repoName: "u1-medicion", limits: { maxFindings: "unlimited" } });
const wallMs = Math.round(performance.now() - t0);
const picoRssMb = Math.round(process.resourceUsage().maxRSS / 1024);

console.log(
  JSON.stringify(
    {
      dir,
      modo,
      wallMs,
      picoRssMb,
      archivosAnalizados: analisis.analysedFiles,
      hallazgosTotales: analisis.findingsTotal,
      gruposTotales: analisis.groupsTotal,
      unidadesVisitadasPorLaSonda: unidadesVisitadas,
      porKind: analisis.totalByKind,
      // DIAGNÓSTICO de la no-determinación medida en guava (ver informes/U1.md):
      // `analyzeFile` aísla la corrida del registro en un try/catch por archivo
      // ("un detector que explota pierde SUS hallazgos de este archivo"), así
      // que un fallo intermitente se ve acá y en ningún otro lado.
      filasEnError: (analisis.coverage ?? [])
        .filter((c) => c.status === "error")
        .map((c) => `${c.detectorId}/${c.language ?? "*"}: ${c.error ?? ""}`),
      filasConPresupuestoAgotado: (analisis.coverage ?? [])
        .filter((c) => c.status === "presupuesto-agotado")
        .map((c) => `${c.detectorId}/${c.language ?? "*"} (${c.findings})`),
    },
    null,
    2,
  ),
);
