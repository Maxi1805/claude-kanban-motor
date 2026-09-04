/**
 * Vuelca la hipótesis COMPLETA (no sólo el estado) de los `Finding` que
 * matcheen un filtro — para verificar a mano que el TEXTO que el producto le
 * muestra al usuario es verdadero, no sólo que el `state` cambió.
 *
 * Uso: npx tsx scripts/probes/ver-hipotesis-integrador.mts <dir> <substr-de-ruta> [patron]
 */
import { analyzeRepo } from "../../src/server/services/code-analyzer.js";

const [, , dir, filtro, patron] = process.argv;
if (!dir || !filtro) {
  console.error("uso: ... <dir> <substr-de-ruta> [patron]");
  process.exit(1);
}

const a = await analyzeRepo({ dir, repoName: "ver", limits: { maxFindings: "unlimited" } });
for (const f of a.findings) {
  if (!f.locations.some((l) => l.file.includes(filtro))) continue;
  for (const h of f.hypotheses ?? []) {
    if (patron && !h.pattern.toLowerCase().includes(patron.toLowerCase())) continue;
    console.log("=".repeat(78));
    console.log(`ANCLA  ${f.kind} @ ${f.locations.map((l) => `${l.file}:${l.startLine}`).join(", ")}`);
    console.log(`TÍTULO ${f.title}`);
    const { refreshState: _omit, ...limpio } = h as unknown as Record<string, unknown>;
    console.log(JSON.stringify(limpio, null, 1));
  }
}
