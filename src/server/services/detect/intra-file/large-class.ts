/**
 * `large-class` — Clase grande / God Class (F1: uno de los tres
 * `CodeFindingKind` declarados en `types.ts`/la UI que nadie emitía nunca,
 * CONTRATOS.md/PLAN.md §4.1 "God Class / God Módulo | archivo | gramática").
 *
 * Relación: número de MIEMBROS (métodos) de una unidad tipo-clase por
 * encima de un umbral — la pata WMC (Weighted Methods per Class) de la
 * estrategia de detección de Lanza & Marinescu para God Class. Declarado
 * como simplificación honesta: la estrategia canónica combina WMC alto CON
 * baja cohesión (TCC) y alta ATFD (Access To Foreign Data); esta ola sólo
 * mide la primera pata (conteo de miembros), que ya es, por sí sola, una
 * señal citable y suficientemente accionable — las otras dos requieren
 * resolver campos/atributos y accesos cruzados, fuera del alcance de F1.
 *
 * Agrupa por `FunctionMetrics.className` (ya calculado por el walker, no
 * algo que este detector re-derive) — nunca por un centinela: una función
 * sin clase contenedora (`className: null`) queda fuera de la agrupación,
 * no cae en un bucket compartido "sin clase" (misma regla general que F1
 * aplica en `pattern-behavioral.ts`).
 */
import { derivado } from "../thresholds.js";
import type { FileUnit, FunctionUnit, IntraFileDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "memberCount";

export const detector: IntraFileDetector<ThresholdKey, "large-class"> = {
  id: "large-class",
  kind: "large-class",
  scope: "intra-file",
  title: "Clase grande",
  needs: ["unidad-tipo-clase"],
  thresholds: {
    memberCount: derivado({
      floor: 47,
      stat: "p95",
      of: "wmc",
      floorSource: {
        work: "Lanza & Marinescu, Object-Oriented Metrics in Practice",
        rule: "God Class — WMC (Weighted Methods per Class)",
      },
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const byClass = new Map<string, FunctionUnit[]>();
    for (const fn of file.functions) {
      const className = fn.metrics.className;
      if (className === null) continue; // sin unidad contenedora: no participa de esta agrupación
      const list = byClass.get(className) ?? [];
      list.push(fn);
      byClass.set(className, list);
    }

    const threshold = ctx.threshold("memberCount");
    const findings: RawFinding[] = [];

    for (const [className, members] of byClass) {
      if (members.length < threshold.value) continue;

      const startLine = Math.min(...members.map((m) => m.startLine));
      const endLine = Math.max(...members.map((m) => m.endLine));

      findings.push({
        title: `"${className}" concentra ${members.length} métodos`,
        detail:
          "Muchos métodos en una sola unidad son evidencia de responsabilidades mezcladas: " +
          "cada cambio nuevo tiene más probabilidad de tocar código que no tiene relación con lo que se quiere modificar.",
        trigger: [{ label: "métodos", value: members.length, threshold }],
        locations: [
          {
            file: file.path,
            startLine,
            endLine,
            symbol: className,
            role: "clase con exceso de miembros",
          },
        ],
        severity: Math.min(100, 40 + members.length),
        advice: {
          primary: {
            name: "Extract Class",
            kind: "refactorizacion",
            why: "Un subconjunto de métodos que trabaja sobre un subconjunto propio de datos es, en los hechos, otra clase esperando a separarse.",
            source: "https://refactoring.guru/es/smells/large-class",
          },
        },
      });
    }

    return findings;
  },
};
