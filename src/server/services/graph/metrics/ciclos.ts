/**
 * CICLOS DE DEPENDENCIA — Componentes Fuertemente Conexas (Tarjan) sobre la
 * proyección `file` — CONTRATO-F4.md §3.1, fila "Tarjan SCC" de la tabla
 * (id `scc`, proyección `file`, aristas `imports, extends, references`,
 * costo `lineal`).
 *
 * DEFINICIÓN, con fuente: un CICLO DE DEPENDENCIA es una SCC (componente
 * fuertemente conexa) de tamaño >= 2 — dos o más archivos que se alcanzan
 * mutuamente siguiendo sólo aristas DIRIGIDAS de dependencia. Arcan define
 * "Cyclic Dependency" exactamente así: docs.arcan.tech/2.9.0 (ESSeRE Lab),
 * la misma fuente que ya cita `revision2/1d-metricas.md`/`PLAN.md` §"Umbrales
 * con cita" para este smell ("Arcan (SCC≥2, ...)"). Una SCC de tamaño 1 —
 * incluido un nodo con auto-referencia (self-loop) — NO es un ciclo: es la
 * forma trivial que Tarjan asigna a todo nodo sin retro-arista real hacia
 * OTRO nodo distinto, y por eso el propio algoritmo la deja fuera sin
 * necesidad de un caso especial (ver `tarjanSCC` más abajo).
 *
 * Cada archivo que participa de un ciclo lleva pegada la MISMA descripción
 * del ciclo completo (`cycleId`/`members`/`size` idénticos para todos sus
 * miembros) — la tarea pide reportar también "la longitud del ciclo": acá
 * es `size`, la cantidad de archivos de la SCC (no la cantidad de aristas
 * mínima para recorrerlo, que para una SCC simple coincide pero en general
 * puede diferir; se reporta el tamaño de la componente, que es lo que Arcan
 * mide y lo que decide si el ciclo es "chico" o "grande").
 *
 * `crossesFolderBoundary`: si los archivos del ciclo NO comparten la misma
 * carpeta inmediata. Es la distinción que pide la tarea entre un ciclo real
 * (arquitectónico, cruza módulos) y una implementación legítima de
 * callbacks/Observer dentro de un mismo paquete (dos clases hermanas del
 * mismo directorio que se llaman entre sí a propósito) — el mismo par
 * "problema real ↔ patrón bien aplicado que se le confunde" que
 * `PLAN.md` §2.2 documenta para este smell ("ciclo ↔ implementación de
 * callbacks").
 *
 * ALGORITMO: Tarjan ITERATIVO con pila explícita (nodo + posición de
 * próximo hijo), igual patrón que `walkFile` (`code-analyzer.ts`) — no
 * recursivo: un monorepo real puede tener una SCC de miles de archivos y una
 * recursión de esa profundidad excede la pila de V8 mucho antes que
 * cualquier presupuesto de tiempo. `ProjectedGraph.nodeIds` ya da un índice
 * denso 0..n-1, así que `index`/`lowlink`/`onStack` son arrays típados
 * planos, sin `Map`.
 *
 * PRESUPUESTO: se consulta `ctx.budget.expired()` cada
 * `BUDGET_CHECK_INTERVAL` visitas de nodo (nunca por nodo individual — igual
 * criterio que `pagerank.ts` documenta para su propia tajada, CONTRATO-F4.md
 * §3.2). Si se agota, se devuelve `presupuesto-agotado` con `values:
 * undefined` — NUNCA una lista parcial de componentes: un archivo sin
 * entrada se leería como "no está en ningún ciclo", que puede ser falso.
 *
 * COSTO MEDIDO Y VALORES EXTREMOS: ver el reporte de esta tarea (fuera de
 * este archivo — no hay ninguna cifra de un repo del usuario acá, sólo del
 * corpus externo en `revision2/corpus/`).
 */
import { citado, resolveThreshold } from "../../detect/thresholds.js";
import type { EdgeKind } from "../types.js";
import type { GraphMetric, MetricResult } from "./types.js";

/** CONTRATO-F4.md §3.1, fila `scc`: "imports, extends, references". */
const EDGE_KINDS_FOR_SCC: readonly EdgeKind[] = ["imports", "extends", "references"];

const MIN_CYCLE_SIZE_SPEC = citado(2, {
  work: "Arcan",
  rule: "Cyclic Dependency: SCC de tamaño >= 2 sobre el grafo de dependencias",
  url: "https://docs.arcan.tech/2.9.0",
});

const NO_LANGUAGE_INPUT = { language: "n/a", sampleSize: () => 0, corpusP95: () => null };

/** Resuelto una sola vez por proceso — `citado` no depende de lenguaje ni corpus. */
const MIN_CYCLE_SIZE = resolveThreshold(MIN_CYCLE_SIZE_SPEC, NO_LANGUAGE_INPUT).value;

/** Cada cuántas visitas de nodo se pregunta `ctx.budget.expired()` — una
 *  llamada a `performance.now()` es barata pero no gratis; mismo orden de
 *  magnitud que `CLOCK_CHECK_INTERVAL` de `code-analyzer.ts`. */
const BUDGET_CHECK_INTERVAL = 4096;

export interface DependencyCycle {
  /** Id estable dentro de esta corrida: el `nodeId` lexicográficamente menor entre los miembros. */
  readonly cycleId: string;
  /** "Longitud del ciclo": cantidad de archivos que participan de la SCC. */
  readonly size: number;
  /** `nodeIds` (proyección `file`, formato `file:<path>`) de todos los miembros, ordenados. */
  readonly members: readonly string[];
  /** `true` si los miembros NO comparten la misma carpeta inmediata. */
  readonly crossesFolderBoundary: boolean;
}

/**
 * Carpeta inmediata de un id `file:<path>` ya proyectado — no hace falta
 * volver al `CodeGraph` original ni a `CodeGraphNode.file`: el propio id
 * proyectado alcanza, porque la proyección `file` (`projection.ts`) usa
 * siempre el formato `file:<path>`.
 */
function immediateFolderOf(fileId: string): string {
  const p = fileId.startsWith("file:") ? fileId.slice("file:".length) : fileId;
  const slash = p.lastIndexOf("/");
  return slash === -1 ? "" : p.slice(0, slash);
}

/**
 * Tarjan clásico, iterativo (ver docstring del archivo). Devuelve `null` si
 * el presupuesto se agotó antes de terminar — nunca una lista parcial de
 * componentes (misma disciplina "nunca un mapa parcial" de
 * CONTRATO-F4.md §3.2, aplicada acá al resultado intermedio antes de que
 * `compute` lo convierta en `MetricResult`).
 */
function tarjanSCC(
  n: number,
  out: readonly (readonly number[])[],
  budget: { expired(): boolean },
): number[][] | null {
  const index = new Int32Array(n).fill(-1);
  const lowlink = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const S: number[] = [];
  const components: number[][] = [];
  let nextIndex = 0;
  let sinceCheck = 0;

  // Pila explícita: un frame por nodo en curso de exploración, con el
  // próximo índice de hijo a visitar (equivalente al "instruction pointer"
  // que la recursión guardaría implícitamente en su propio call stack).
  const nodeStack: number[] = [];
  const childStack: number[] = [];

  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    index[root] = lowlink[root] = nextIndex++;
    S.push(root);
    onStack[root] = 1;
    nodeStack.push(root);
    childStack.push(0);

    while (nodeStack.length > 0) {
      const v = nodeStack[nodeStack.length - 1]!;
      const childPos = childStack[childStack.length - 1]!;
      const neighbors = out[v]!;

      if (childPos < neighbors.length) {
        childStack[childStack.length - 1] = childPos + 1;
        const w = neighbors[childPos]!;
        if (index[w] === -1) {
          index[w] = lowlink[w] = nextIndex++;
          S.push(w);
          onStack[w] = 1;
          nodeStack.push(w);
          childStack.push(0);
        } else if (onStack[w]) {
          if (index[w]! < lowlink[v]!) lowlink[v] = index[w]!;
        }
        if (++sinceCheck >= BUDGET_CHECK_INTERVAL) {
          sinceCheck = 0;
          if (budget.expired()) return null;
        }
        continue;
      }

      // Terminó de explorar todos los hijos de `v`: se desapila y se
      // propaga su `lowlink` al padre, igual que haría el `return` de la
      // versión recursiva justo antes de volver.
      nodeStack.pop();
      childStack.pop();
      const parent = nodeStack[nodeStack.length - 1];
      if (parent !== undefined && lowlink[v]! < lowlink[parent]!) lowlink[parent] = lowlink[v]!;

      if (lowlink[v] === index[v]) {
        const comp: number[] = [];
        let w: number;
        do {
          w = S.pop()!;
          onStack[w] = 0;
          comp.push(w);
        } while (w !== v);
        components.push(comp);
      }
    }
  }
  return components;
}

export const scc: GraphMetric<DependencyCycle> = {
  id: "scc",
  title: "Ciclos de dependencia (SCC, Tarjan)",
  projection: "file",
  edgeKinds: EDGE_KINDS_FOR_SCC,
  cost: "lineal",

  compute(g, ctx): MetricResult<DependencyCycle> {
    const start = performance.now();
    if (g.projection !== "file") {
      return {
        status: "no-aplicable",
        elapsedMs: performance.now() - start,
        reason: `scc opera sobre la proyección "file"; se recibió "${g.projection}".`,
      };
    }

    const n = g.nodeIds.length;
    if (n === 0) {
      return { status: "computed", values: new Map(), elapsedMs: performance.now() - start };
    }

    const components = tarjanSCC(n, g.out, ctx.budget);
    if (components === null) {
      return {
        status: "presupuesto-agotado",
        elapsedMs: performance.now() - start,
        reason: `Tarjan sobre ${n} nodos no terminó dentro del presupuesto de ${ctx.budget.maxMs} ms.`,
      };
    }

    const values = new Map<string, DependencyCycle>();
    for (const comp of components) {
      if (comp.length < MIN_CYCLE_SIZE) continue;
      const members = comp.map((i) => g.nodeIds[i]!).sort();
      const folders = new Set(members.map(immediateFolderOf));
      const cycle: DependencyCycle = {
        cycleId: members[0]!,
        size: members.length,
        members,
        crossesFolderBoundary: folders.size > 1,
      };
      for (const m of members) values.set(m, cycle);
    }

    return { status: "computed", values, elapsedMs: performance.now() - start };
  },
};
