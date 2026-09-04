/**
 * F5 — LA MEDICIÓN: recall y precisión de la cascada de resolución, por
 * ETAPA y por LENGUAJE, sobre los 8 repos del corpus — CONTRATO-F8G.md §7.
 *
 * Este módulo es PURO y no corre nada: convierte el `ResolutionStats` que
 * `resolveReferences` (`graph/resolve.ts`) ya produce en un "embudo" legible
 * por etapa (`CascadeFunnel`), y da las dos fracciones que ese embudo permite
 * calcular SIN un dataset etiquetado: cuánto rechaza cada etapa de lo que le
 * llegó vivo (`stageRejectRate`) y qué porción de TODO lo resuelto es
 * atribuible a cada etapa (`stageAcceptShare`) — exactamente el par de
 * números que el reporte de la ola anterior citó para cobra ("las 727
 * resueltas TODAS por global-uniqueness").
 *
 * *** LÍMITE DECLARADO, no escondido: esto es RECALL/PRECISIÓN COMO PROXY,
 * no como medición contra verdad de terreno. *** Sin un conjunto etiquetado
 * a mano no hay forma de saber si lo que una etapa RECHAZA de verdad no
 * debía resolverse (pérdida correcta) o si es una referencia real perdida
 * (pérdida de recall) — sólo jekyll (Ruby, `tests/golden/graph/
 * cascade-labeled-dataset.jekyll.json`) y guava (Java, `...guava.json`)
 * tienen ese dataset, consumido por `resolve-gate.test.ts` y
 * `gate/resolve-gate-java.test.ts` respectivamente. Para los otros 6 repos
 * del corpus (click/Python, cobra/Go, lodash/JS, newtonsoft-json/C#,
 * preact/JS, vueuse/TS+Vue) este módulo sólo puede reportar el EMBUDO —
 * cuántos candidatos entraron a cada etapa y qué hizo cada una con ellos —
 * nunca si esa decisión fue correcta. Cualquier consumidor que quiera
 * "precisión" para esos 6 repos sin etiquetar antes está sobre-generalizando
 * exactamente el error que `gate/precision-recall.test.ts` ya advierte para
 * el caso Ruby-solo.
 *
 * Quién corre esto sobre un repo real: `scripts/measure-cascade.mts`, FUERA
 * de `src/` — mismo motivo que `graph/build.ts` documenta en su propio
 * encabezado ("quien quiera correr `buildGraph` sobre un repo real tiene que
 * parsear... ver el script de medición de esta tarea, fuera de `src/`") y
 * mismo patrón que `scripts/census.mts`/`scripts/language-coverage.mts`: UN
 * repo por invocación de proceso, para no cargar dos gramáticas tree-sitter
 * pesadas (o dos repos grandes) en el mismo heap a la vez (regla de memoria:
 * guava corre solo).
 */
import type { ResolutionStageId, ResolutionStats } from "../stages.js";

/** Una fila del embudo: qué hizo UNA etapa con los candidatos que le llegaron vivos. */
export interface StageFunnelRow {
  readonly stage: ResolutionStageId;
  readonly order: number;
  readonly considered: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly narrowed: number;
  readonly passed: number;
}

/** El embudo completo de UNA corrida de la cascada sobre UN repo/lenguaje. */
export interface CascadeFunnel {
  readonly repo: string;
  readonly language: string;
  readonly files: number;
  readonly candidates: number;
  readonly resolved: number;
  /** Sobrevivió con >1 destino posible — nunca decidido. */
  readonly droppedAmbiguous: number;
  /** Sobrevivió con 0 destinos. */
  readonly unresolved: number;
  readonly byStage: readonly StageFunnelRow[];
}

export function toCascadeFunnel(repo: string, language: string, files: number, stats: ResolutionStats): CascadeFunnel {
  return {
    repo,
    language,
    files,
    candidates: stats.candidates,
    resolved: stats.resolved,
    droppedAmbiguous: stats.droppedAmbiguous,
    unresolved: stats.unresolved,
    byStage: stats.byStage.map((s) => ({
      stage: s.stage,
      order: s.order,
      considered: s.considered,
      accepted: s.accepted,
      rejected: s.rejected,
      narrowed: s.narrowed,
      passed: s.passed,
    })),
  };
}

/**
 * Fracción de lo que LLEGÓ VIVO a esta etapa (`considered`) que la etapa
 * rechazó. `0` cuando nada llegó — no `NaN`, para que un consumidor que
 * itera 9 etapas por 8 lenguajes no tenga que filtrar `NaN` aparte.
 */
export function stageRejectRate(row: StageFunnelRow): number {
  return row.considered > 0 ? row.rejected / row.considered : 0;
}

/** Qué porción de TODO lo resuelto por la cascada (`resolved`) aceptó esta etapa — la "cuota de aceptación" de la etapa. */
export function stageAcceptShare(row: StageFunnelRow, totalResolved: number): number {
  return totalResolved > 0 ? row.accepted / totalResolved : 0;
}

/** Recall bruto: fracción de candidatos que entraron a la cascada que terminaron `resolved` — NO es recall contra verdad de terreno (ver docstring del módulo), es sólo "cuánto de lo que se INTENTÓ resolver, la cascada efectivamente aceptó". */
export function crudeAcceptanceRate(f: CascadeFunnel): number {
  return f.candidates > 0 ? f.resolved / f.candidates : 0;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** Una línea por etapa, EN EL ORDEN de ejecución real (`row.order`), ceros incluidos — una etapa en cero es información (ver la nota de cobra: 8 de 9 etapas en cero es la brecha central de este frente). */
export function formatFunnel(f: CascadeFunnel): string {
  const rows = [...f.byStage].sort((a, b) => a.order - b.order);
  const lines = [
    `── ${f.repo} (${f.language}) — ${f.files} archivos, ${f.candidates} candidatos ──`,
    ...rows.map(
      (r) =>
        `  ${String(r.order).padStart(2)}. ${r.stage.padEnd(24)} considerados=${String(r.considered).padStart(6)} ` +
        `aceptados=${String(r.accepted).padStart(6)} rechazados=${String(r.rejected).padStart(6)} ` +
        `(rechazo=${pct(stageRejectRate(r)).padStart(6)}) angostados=${r.narrowed} pasados=${r.passed}`,
    ),
    `  resolved=${f.resolved} (${pct(crudeAcceptanceRate(f))}) droppedAmbiguous=${f.droppedAmbiguous} unresolved=${f.unresolved}`,
  ];
  return lines.join("\n");
}

/** Tabla compacta, una fila por (repo, etapa) — pensada para pegar en un reporte, no para consola interactiva. */
export function formatFunnelTable(funnels: readonly CascadeFunnel[]): string {
  const header = "repo".padEnd(18) + "lenguaje".padEnd(12) + "etapa".padEnd(24) + "considerados".padStart(13) + "aceptados".padStart(11) + "rechazo%".padStart(10);
  const lines = [header];
  for (const f of funnels) {
    for (const r of [...f.byStage].sort((a, b) => a.order - b.order)) {
      lines.push(
        f.repo.padEnd(18) +
          f.language.padEnd(12) +
          r.stage.padEnd(24) +
          String(r.considered).padStart(13) +
          String(r.accepted).padStart(11) +
          pct(stageRejectRate(r)).padStart(10),
      );
    }
  }
  return lines.join("\n");
}
