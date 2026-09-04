/**
 * OLA V · INTEGRADOR — perfil de CPU de UNA corrida de `analyzeRepo`, sin caché.
 *
 * POR QUÉ. El frente V1 dejó medido que su pasada nueva de grafo cuesta +37 % sobre los 13
 * repos (hugo +80 %, sqlalchemy +71 %, guava +32 %) y ATRIBUYÓ el 92 % de ese costo a
 * `detect/inter-file/confident-edges.ts#confidentEdges` (`graph.edges.filter(...)` llamado
 * una o dos veces por hipótesis candidata). Memoicé esa función por identidad del arreglo de
 * aristas y **el costo no bajó** (hugo 89,4 s → 86,0 s, dentro del ruido). O sea: la
 * atribución de V1 es FALSA o incompleta, y hay que medir en vez de creerle al informe.
 *
 * Esto corre `analyzeRepo` una vez con `--cpu-prof` y vuelca el perfil. Uso:
 *   node --cpu-prof --cpu-prof-dir=/tmp/v-int/perfil --import tsx \
 *     scripts/v-int-perfil.mts <dir-repo> <slug>
 */
import { analyzeRepo } from "../src/server/services/code-analyzer.js";

const [, , dir, slug] = process.argv;
if (!dir || !slug) {
  console.error("Uso: node --cpu-prof --import tsx scripts/v-int-perfil.mts <dir> <slug>");
  process.exit(1);
}
const t0 = performance.now();
const analysis = await analyzeRepo({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
console.error(`[perfil] ${slug}: ${analysis.findings.length} hallazgos en ${Math.round(performance.now() - t0)} ms`);
