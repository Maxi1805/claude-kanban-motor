/**
 * P6 (Ola 11a) — la ÚNICA prueba de que `refresh()` cambió algo en
 * PRODUCCIÓN, no sólo en un test unitario aislado (encargo, punto 6). Corre
 * `analyzeRepo` REAL (el mismo camino que `code-analyzer.ts` usa siempre:
 * `attachHypotheses` dentro de `analyzeFile` seguido de `refreshHypotheses`
 * dentro de `crossAnalyze` — nunca invocado a mano) sobre cada fixture
 * canónica de las cuatro hipótesis a cargo de este paquete (Builder, Chain
 * of Responsibility, Observer, Proxy), un directorio por vez.
 *
 * Reporta, por patrón: (a) el histograma de `state` de siempre
 * (`ausente`/`parcial`/`ya-aplicado`/`aplicado-eludido` — NUNCA cambia por
 * `refresh()`, es la garantía del contrato) y (b) cuántas hipótesis tienen,
 * entre sus `discriminators` finales, alguno de los discriminadores NUEVOS
 * de esta ola en `passed: true`. (b) es la señal que importa: los ocho
 * discriminadores nuevos (dos por hipótesis) están escritos para devolver
 * SIEMPRE `holds: false` cuando `build()` los evalúa en solitario (grafo
 * `null` / `ctx.neighborhood` vacío — el caso de las anclas
 * intra-function/intra-file de las cuatro, todo el tiempo en `build()`). Si
 * alguno aparece en `true` acá, es matemáticamente imposible que haya sido
 * `build()` quien lo confirmó — tiene que haber sido `refresh()`, con el
 * grafo/vecindario reales que `crossAnalyze` construye. Ningún mock: es el
 * mismo `analyzeRepo` que usa el servidor.
 *
 * Uso: npx tsx scripts/measure-p6-refresh-consumption.mts
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeFinding, CodeFindingHypothesisState } from "../src/shared/types.js";

const FIXTURES_ROOT = path.resolve("tests/fixtures/patterns");

/** Fragmento ESTABLE (no interpolado) del `describe` de cada discriminador
 *  nuevo — suficiente para identificarlo sin acoplar este script a un
 *  export propio de cada módulo de hipótesis. */
const SIGNATURES: Record<string, readonly string[]> = {
  Builder: ["no es una convención extendida del repo", "confirma alguna de las formas estructurales de Builder"],
  "Chain of Responsibility": ["cadena heterogénea real siendo ensamblada", "ctx.neighborhood.findingsInFile) muestra OTRO hallazgo"],
  Observer: ["confirma un portador ad hoc de despacho en el archivo", "aparece en OTROS archivos del repo"],
  "Proxy (inicialización perezosa)": ["terna de envoltura del grafo", "aparece en OTRO lugar del repo"],
};

const TARGETS: readonly { readonly dir: string; readonly pattern: string }[] = [
  { dir: "builder", pattern: "Builder" },
  { dir: "chain_of_responsibility", pattern: "Chain of Responsibility" },
  { dir: "observer", pattern: "Observer" },
  { dir: "proxy", pattern: "Proxy (inicialización perezosa)" },
];

const STATES: readonly CodeFindingHypothesisState[] = ["ausente", "parcial", "ya-aplicado", "aplicado-eludido"];

async function main(): Promise<void> {
  // Ola 11a, hallazgo del propio script: por-directorio (un patrón, sus 6
  // archivos canónicos) Builder y Chain of Responsibility dan CERO
  // hipótesis (silencio ESTRUCTURAL por diseño de fixture — ver el docstring
  // de builder.ts/chain-of-responsibility.ts, las 6 fixtures canónicas de
  // cada uno no cruzan el piso de su propia ancla) y Observer/Proxy dan
  // TODO `ya-aplicado` (`refresh()` se salta por contrato — no compite por
  // confianza, ver el guard `existing.state !== "ausente" && !== "parcial"`
  // en las cuatro hipótesis) — ningún discriminador nuevo tiene chance de
  // confirmarse ahí. Por eso este script corre sobre `tests/fixtures/
  // patterns` COMPLETO (fixtures-multi, el mismo árbol que mide P3): ahí SÍ
  // aparecen anclas `ausente`/`parcial` de estos cuatro patrones fuera de su
  // propia carpeta canónica (p.ej. `long-parameter-list`/`many-returns` en
  // fixtures de OTROS patrones), que es donde `refresh()` tiene algo que
  // mejorar.
  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: FIXTURES_ROOT,
    repoName: "p6-fixtures-multi",
    limits: { maxFindings: "unlimited" },
  });
  const wallMs = Math.round(performance.now() - t0);
  const findings = analysis.findings as readonly CodeFinding[];
  console.log(`analyzeRepo(fixtures-multi): ${wallMs}ms, ${findings.length} findings`);

  for (const target of TARGETS) {
    const signatures = SIGNATURES[target.pattern]!;
    const states = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<CodeFindingHypothesisState, number>;
    let total = 0;
    const confirmedByRefreshExamples: string[] = [];

    for (const finding of findings) {
      for (const h of finding.hypotheses ?? []) {
        if (h.pattern !== target.pattern) continue;
        total++;
        states[h.state]++;
        const hit = h.discriminators.find((d) => d.passed && signatures.some((sig) => d.label.includes(sig)));
        if (hit) {
          confirmedByRefreshExamples.push(`${finding.locations[0]!.file}:${finding.locations[0]!.startLine} — "${hit.label.slice(0, 70)}…"`);
        }
      }
    }

    console.log(`\n=== ${target.pattern} (ancla original en tests/fixtures/patterns/${target.dir}/, medido sobre fixtures-multi completo) ===`);
    console.log(`total hipótesis: ${total}`);
    console.log(`histograma de estado: ${STATES.map((s) => `${s}=${states[s]}`).join(", ")}`);
    console.log(
      `hipótesis con algún discriminador NUEVO de esta ola en passed:true (⇒ sólo pudo confirmarlo refresh(), nunca build()): ${confirmedByRefreshExamples.length}`,
    );
    for (const ex of confirmedByRefreshExamples.slice(0, 5)) console.log(`  - ${ex}`);
  }
}

void main();
