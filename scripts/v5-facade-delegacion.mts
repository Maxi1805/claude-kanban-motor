/**
 * OLA V · FRENTE V5 — mide, para UN repo, cada hipótesis Facade viva: su estado y si el
 * check de DELEGACIÓN (`hasDelegatingCalls`, hoy sólo un check del excluder de estado)
 * pasó o no.
 *
 * Existe porque los dos `problema-si-patrón-no` de Facade de la Ola U
 * (`rubocop/lib/rubocop.rb:1`, `guava/.../AbstractCollectionTestSuiteBuilder.java:1`) son
 * el MISMO caso: fan-out alto con CERO llamadas a los colaboradores — un agregador de
 * imports/manifiesto, no una fachada. Antes de promover ese check a `required` hay que
 * medir a cuántas hipótesis vivas les cambia el resultado, y con qué estado.
 *
 * Uso: npx tsx scripts/v5-facade-delegacion.mts <dir> [<dir> ...]
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const DELEGA = "delegación real, no sólo mención/import";

for (const dir of process.argv.slice(2)) {
  const { analysis } = await analyzeRepoCached({ dir, repoName: "v5", limits: { maxFindings: "unlimited" } });
  const filas: { file: string; state: string; delega: boolean | null }[] = [];
  for (const f of analysis.findings) {
    for (const h of f.hypotheses ?? []) {
      if (h.pattern !== "Facade") continue;
      const check = h.checks.find((c) => c.label.includes(DELEGA));
      filas.push({ file: f.locations[0]?.file ?? "?", state: h.state, delega: check ? check.passed : null });
    }
  }
  const conteo = new Map<string, number>();
  for (const r of filas) {
    const k = `${r.state}/delega=${r.delega === null ? "n-d" : r.delega}`;
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
  }
  console.log(`\n== ${dir}: ${filas.length} hipótesis Facade`);
  for (const [k, v] of [...conteo].sort()) console.log(`   ${k}: ${v}`);
  for (const r of filas.filter((x) => x.delega === false)) console.log(`   SIN DELEGACIÓN · ${r.state} · ${r.file}`);
}
