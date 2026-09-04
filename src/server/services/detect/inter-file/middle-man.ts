/**
 * `middle-man` — intermediario innecesario entre archivos (CONTRATO-F5.md
 * §4, catálogo de los 16 detectores `inter-file` de esta ola).
 *
 * RELACIÓN (sin jerga de AST): un método o función `M` tal que (a) al menos
 * un símbolo `A`, en cualquier archivo, lo llama, (b) el CUERPO de `M` no
 * contiene ninguna rama/decisión propia (`FunctionMetrics.branches === 0`),
 * y (c) la ÚNICA llamada saliente de `M` va a un único símbolo `C` que vive
 * en OTRO archivo. `M` recibe la llamada de `A` y su trabajo entero consiste
 * en pasarla a `C`: nada decide, nada transforma, nada agrega. El patrón
 * clásico de Fowler ("Middle Man"): si una unidad delega casi todo su
 * trabajo a otra, sus llamadores deberían hablar directamente con quien de
 * verdad hace el trabajo.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: la tríada (fan-in >= 1, fan-out == 1
 * hacia otro archivo, cero ramas en el cuerpo) es enteramente conteo de
 * aristas del grafo (`references`) más una métrica ya calculada por el
 * walker de `code-analyzer.ts` (`FunctionMetrics.branches`) — cero
 * vocabulario de dominio, cero nombre de nodo de una gramática concreta.
 *
 * DE DÓNDE SALE CADA NÚMERO, SIN RECOMPUTAR NINGÚN ALGORITMO YA EXISTENTE:
 *   - fan-in/fan-out de `M`: una pasada propia por `graph.edges` (igual que
 *     `unused-symbol.ts`/`orphan-file.ts` — no es una de las 6 métricas de
 *     `graph/metrics/registry.ts`, así que no hay nada que reusar ahí para
 *     ESTA parte).
 *   - `branches`: `RepoUnit.functions[].metrics.branches`, ya calculado por
 *     `code-analyzer.ts` para cada función del repo — nunca se re-parsea.
 *   - PageRank del archivo destino (evidencia, no umbral): se invoca
 *     `graph/metrics/pagerank.ts#pagerank.compute` sobre la proyección
 *     `file` vía `projectGraph` — la métrica YA IMPLEMENTADA de
 *     `GRAPH_METRICS`, exactamente como la invoca `detect/reach.ts`; este
 *     archivo no reimplementa PageRank, sólo la llama para decir cuánto le
 *     importa al repo el archivo al que `M` reenvía.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - Sólo candidatos con `FunctionMetrics` disponible en `RepoUnit.functions`
 *    (emparejado por `symbolNodeId(file, symbolPath)`, mismo id canónico que
 *    usa el grafo). Un símbolo `function-like` del grafo sin `FunctionUnit`
 *    correspondiente se DESCARTA en vez de asumir "cero ramas": sin la
 *    métrica no hay forma honesta de afirmar "no agrega nada".
 *  - Homónimos hermanos (`id` con sufijo `@n`, misma limitación que
 *    `unused-symbol.ts`) se excluyen de la candidatura por el lado del
 *    grafo. Del lado de `RepoUnit.functions` dos hermanos con el mismo
 *    `symbolPath` colapsan al mismo id en el índice interno de este
 *    detector (el último gana) — limitación declarada, no escondida:
 *    sobrecargas de método con distinta aridad pueden compartir métricas
 *    entre sí en un caso raro.
 *  - `M` y `C` deben vivir en archivos DISTINTOS. Un reenvío puramente
 *    intra-archivo (a otra función del mismo archivo) queda fuera de
 *    alcance: no cruza la frontera que hace de esto un problema
 *    ENTRE archivos, y ya lo puede capturar mejor un detector `intra-file`.
 *  - Sólo cuenta el fan-in de `M` como "al menos un llamador real dentro del
 *    repo" (mismo criterio de `unused-symbol.ts`): un `M` con fan-in 0 no es
 *    intermediario de nadie, es simplemente un símbolo sin uso (otro
 *    detector).
 *  - PROVENANCE: tanto el fan-in de `A→M` como el fan-out de `M→C` son
 *    evidencia POSITIVA del hallazgo (las dos aristas TIENEN que existir
 *    para que el patrón exista) — CONTRATO-F5.md §4.4: cuando una arista
 *    `inferred` es evidencia positiva, lo conservador es EXCLUIRLA. Este
 *    detector sólo cuenta aristas `declared`/`resolved`, igual que
 *    `dependency-cycle.ts`.
 *
 * VERIFICADO A MANO CONTRA EL CORPUS (8 repos; ver el resultado de la tarea
 * para el detalle) — 2 de 6 hallazgos leídos a mano eran ciertos. Los 4
 * falsos, con causa raíz (generalizan más allá de este detector):
 *   1. `click/src/click/decorators.py#pass_context` -> "Context": FALSO. El
 *      único `references` confiable de esa función no es una llamada — es
 *      la anotación de tipo `f: t.Callable[te.Concatenate[Context, P], R]`.
 *      `CodeGraphEdge` no distingue "llamada" de "mención de tipo" (no lleva
 *      ese `role`, a diferencia del `SymbolRef` interno de `graph/resolve.ts`
 *      que sí lo tiene y lo descarta antes de llegar acá) — límite
 *      estructural del tipo de arista, no de este detector.
 *   2. `cobra/cobra.go#trimRightSpace` e `isFlagArg` -> "string": FALSOS. Los
 *      cuerpos no llaman a nada llamado "string" — es el TIPO del
 *      parámetro/retorno (`string`, builtin de Go), resuelto por la cascada
 *      contra un método NO RELACIONADO `ShellCompDirective.string()` de otro
 *      archivo por coincidencia de nombre. Bug de resolución
 *      (`graph/resolve.ts`), reportado, no tocado (fuera de alcance).
 *   3. `vueuse/packages/shared/createEventHook` -> "tryOnScopeDispose": FALSO.
 *      `branches === 0` sólo descarta DECISIONES explícitas; esta función
 *      construye un `Set`, define 4 closures anidados y compone `Promise.all`
 *      — lógica real sin una sola rama. Límite genuino de "cero ramas" como
 *      proxy de "no agrega nada": `FunctionMetrics` no cuenta hoy sentencias/
 *      closures, y contarlas pediría releer el AST (fuera de alcance acá).
 * Los 2 ciertos: `click/src/click/termui.py#unstyle` (`return strip_ansi
 * (text)`, literal) y `#launch` (`return open_url(url, wait=wait,
 * locate=locate)` tras un import local). Muestra chica (n=6): se reporta con
 * su detalle completo, no como una cifra sólida.
 *
 * *** CON QUÉ SE CONFUNDE — Adapter y Proxy bien aplicados, A PROPÓSITO ***:
 * un Adapter delgado (traduce una interfaz sin agregar lógica de negocio) y
 * un Proxy delgado (antepone acceso/creación diferida sin ninguna rama en el
 * caso feliz) producen la MISMA firma estructural exacta: fan-in >= 1,
 * fan-out == 1 hacia otro archivo, cero ramas. Este detector NO PUEDE
 * distinguir estáticamente "delega porque no debería existir" de "delega
 * porque fue diseñado para traducir/interceptar" — no hay señal en el grafo
 * ni en `FunctionMetrics` que diga "esto es a propósito". Por eso calcula
 * una señal débil, puramente estructural: la PROPORCIÓN de métodos del mismo
 * contenedor (misma clase, o mismo archivo si no hay clase) que tienen la
 * MISMA forma de puro reenvío. Un contenedor donde la mayoría de los
 * métodos reenvían así es compatible con una clase DISEÑADA para adaptar o
 * interceptar (un Adapter/Proxy dedicado, con ese único propósito); un
 * método aislado que reenvía dentro de un contenedor que por lo demás tiene
 * lógica real es más compatible con una indirección que se acumuló sin
 * querer. La primera baja la severidad y lo dice explícitamente en
 * `detail`; la segunda NO sube la severidad al máximo por esta sola razón —
 * la severidad tiene techo bajo (75) precisamente porque incluso el caso
 * "aislado" puede ser un Adapter/Proxy de un solo método bien aplicado. Todo
 * hallazgo de este detector es una HIPÓTESIS con confianza reducida por
 * diseño, nunca una afirmación de que el código está mal.
 *
 * LÍMITES POR LENGUAJE / OJO CON JAVA: las aristas `references` en Java
 * dependen mayoritariamente de la etapa heurística `path-proximity`
 * (`provenance: "inferred"`, Ola 3/4) — MEDIDO en guava: 81% de las aristas
 * `references` ACEPTADAS. Como este detector EXCLUYE `inferred` (ver
 * "SIMPLIFICACIONES DECLARADAS"), el riesgo en Java corre al revés que en un
 * lenguaje con más aristas `declared`/`resolved`: no es que reporte de más,
 * es que probablemente reporta MUY POR DEBAJO de los middle-men reales de
 * ese lenguaje (bajo recall, alta precisión sobre lo que sí emite). Cada
 * hallazgo sobre un archivo `.java` lo dice explícitamente en `detail`. No
 * se exige `minProvenance` a nivel de tipo porque `InterFileDetector` (F5,
 * `detect/types.ts`) todavía no expone ese campo en producción — el filtro
 * se aplica a mano, adentro de `isConfidentCallEdge`, con el mismo efecto.
 */
import { createComputeBudget } from "../../graph/metrics/budget.js";
import { pagerank } from "../../graph/metrics/pagerank.js";
import { projectGraph } from "../../graph/metrics/projection.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../../graph/types.js";
import { pisoDeclarado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { Evidence, InterFileDetector, RawFinding, RepoFunctionUnit, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "minFanIn" | "noLogicBranches" | "dedicatedContainerRatio";

/** Presencia, no magnitud: hace falta AL MENOS un llamador para que exista indirección que remover. */
const MIN_FAN_IN_SPEC = pisoDeclarado(1, {
  rationale:
    "sin al menos un llamador (A) dentro del repo, M no intermedia nada — es simplemente un símbolo sin uso, otro problema.",
});

/** Presencia/ausencia: cualquier rama ya es lógica propia; no hay una magnitud intermedia razonable. */
const NO_LOGIC_BRANCHES_SPEC = pisoDeclarado(0, {
  rationale:
    "el smell exige que el método no agregue NINGUNA decisión propia; branches=0 es la lectura más estricta " +
    "posible de 'no agrega nada' con las métricas ya calculadas por code-analyzer.ts, sin volver a leer el AST " +
    "(RepoUnit ya liberó los árboles — ver RepoFunctionUnit).",
});

/** Ver "CON QUÉ SE CONFUNDE": a partir de qué proporción de un mismo contenedor un reenvío puro deja de leerse
 *  como accidental y empieza a leerse como un Adapter/Proxy dedicado a propósito. No calibrado contra el corpus
 *  (es un juicio de forma, no de volumen) — elegido a mano: una MAYORÍA clara (>=75%) de un contenedor con al
 *  menos 2 métodos reenviando de la misma forma. */
const DEDICATED_CONTAINER_RATIO_SPEC = pisoDeclarado(0.75, {
  rationale:
    "una mayoría clara (3 de cada 4) de los métodos de un mismo contenedor con la misma forma de puro reenvío " +
    "es más compatible con una clase diseñada para adaptar/interceptar que con coincidencia; por debajo de eso " +
    "no hay base para asumir diseño a propósito y se trata como reenvío aislado.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. */
const MAX_FINDINGS_SPEC = presupuesto(60, {
  rationale: "un panel legible no lista de forma útil más de unas pocas decenas de intermediarios a la vez; es tope de volumen, no de detección.",
});

/** `references` con evidencia POSITIVA del hallazgo (fan-in Y fan-out) — se excluye `inferred` a propósito, ver docstring. */
function isConfidentCallEdge(edge: CodeGraphEdge): boolean {
  // OLA AW (AW4) — DIAGNOSTICO: este predicado decia `edge.kind === "references"`
  // y por eso el detector estaba MUDO (0 hallazgos en 21 repos, 0 veredictos
  // jamas). CONTRATO-F8G.md §3.1 partio la cascada de `references` en dos
  // listas DISJUNTAS por `isCallee`: los sitios de LLAMADA salen hoy como
  // `calls`, no como `references` (`graph/references.ts:766`,
  // `const isCallee = argsNode != null`). La forma que este detector busca
  // —A llama a M, M llama a C y a nada mas— esta hecha ENTERAMENTE de sitios
  // de llamada, asi que tanto el fan-in como el fan-out le quedaron invisibles.
  // El docstring de `partitionCandidatesByCallee` en `graph/build.ts` dice que
  // `callee` salia "SIEMPRE vacio" cuando se escribio este detector; ya no.
  return (edge.kind === "references" || edge.kind === "calls") && edge.provenance !== "inferred";
}

/** Hermano homónimo (`@2`, `@3`, …) — nunca es un candidato limpio, mismo criterio que `unused-symbol.ts`. */
function isDuplicateSibling(id: string): boolean {
  return /@\d+$/.test(id);
}

function symbolName(node: CodeGraphNode): string {
  return node.symbolPath[node.symbolPath.length - 1] ?? "?";
}

/** Clave de "contenedor": la clase que engloba el método, o el archivo entero si no hay clase. */
function containerKeyOf(file: string, className: string | null): string {
  return className === null ? `${file} (nivel de archivo)` : `${file} ${className}`;
}

interface CallIndex {
  readonly fanIn: ReadonlyMap<string, ReadonlySet<string>>;
  readonly fanOut: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Una sola pasada por `graph.edges`, O(E): fan-in/fan-out de aristas `references` confiables, self-aristas descartadas. */
function buildCallIndex(graph: CodeGraph): CallIndex {
  const fanIn = new Map<string, Set<string>>();
  const fanOut = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!isConfidentCallEdge(edge)) continue;
    if (edge.from === edge.to) continue; // auto-llamada: no aporta a "delega a otro"
    let outs = fanOut.get(edge.from);
    if (!outs) {
      outs = new Set();
      fanOut.set(edge.from, outs);
    }
    outs.add(edge.to);
    let ins = fanIn.get(edge.to);
    if (!ins) {
      ins = new Set();
      fanIn.set(edge.to, ins);
    }
    ins.add(edge.from);
  }
  return { fanIn, fanOut };
}

/** `RepoUnit.functions` indexado por el MISMO id canónico que usa el grafo (`symbolNodeId`) — ver "SIMPLIFICACIONES DECLARADAS". */
function buildFunctionIndex(functions: readonly RepoFunctionUnit[]): ReadonlyMap<string, RepoFunctionUnit> {
  const map = new Map<string, RepoFunctionUnit>();
  for (const fn of functions) map.set(symbolNodeId(fn.file, fn.symbolPath), fn);
  return map;
}

/** PageRank del proyecto sobre la proyección `file`; métrica YA IMPLEMENTADA, ver docstring del módulo. `null` si
 *  no converge o el grafo falla — nunca se afirma un valor a medias. */
function computeFilePageRank(graph: CodeGraph): ReadonlyMap<string, number> | null {
  try {
    const projected = projectGraph(graph, "file", pagerank.edgeKinds);
    const result = pagerank.compute(projected, { budget: createComputeBudget() });
    if (result.status !== "computed" || !result.values) return null;
    const byFile = new Map<string, number>();
    for (const [id, value] of result.values) byFile.set(id, value.pagerank);
    return byFile;
  } catch {
    return null;
  }
}

/** Severidad: crece con cuántos llamadores (A) hoy pagan el salto extra; techo bajo (75, nunca 100) porque incluso
 *  el caso "aislado" puede ser un Adapter/Proxy de un solo método bien aplicado (ver "CON QUÉ SE CONFUNDE").
 *  Un contenedor "dedicado" (Adapter/Proxy probable) resta 25 puntos. */
function severityOf(fanIn: number, dedicatedContainer: boolean): number {
  const base = 30 + Math.min(40, fanIn * 8);
  const adjusted = dedicatedContainer ? Math.max(15, base - 25) : base;
  return Math.min(75, adjusted);
}

interface Candidate {
  readonly node: CodeGraphNode;
  readonly fn: RepoFunctionUnit;
  readonly target: CodeGraphNode;
  readonly callerCount: number;
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para poder testear sin `RunContext`,
 * mismo patrón que `findDependencyCycles`/`buildOrphanFileFindings`.
 *
 * OLA Z (Z5) — TECHO AGUAS ARRIBA, MEDIDO, NO ARREGLADO ACÁ: instrumentado
 * por compuerta sobre los 13 repos del corpus (`node.kind==="symbol" &&
 * family==="function-like"` → 76.479 candidatos → 70.567 sin homónimo →
 * **0 con `FunctionMetrics`**). `funcByNodeId` sale de `repo.functions`
 * (`buildFunctionIndex` más abajo), y `code-analyzer.ts#crossAnalyze` arma
 * el `RepoUnit` de la pasada `inter-file` con `functions: []` HARDCODEADO —
 * el propio comentario de ese archivo dice por qué: "ningún detector
 * inter-file de hoy lee `repo.functions`", cierto cuando se escribió (sólo
 * `duplication` + los 3 `needsGraph` de esa ola), FALSO desde que este
 * detector se agregó como CUARTO consumidor de `repo.functions` y nadie
 * volvió a esa línea. Es idéntico al defecto que `hypotheses/iterator.ts`
 * ya documenta con la MISMA cita textual — un frente anterior ya lo
 * encontró para OTRA hipótesis y lo rodeó sin tocar la fuente. Reconstruido
 * el `repo.functions` real fuera de producción (emparejando cada nodo
 * function-like del grafo con su `FunctionInfo` por `(file, startLine)`,
 * 100 % de coincidencia en los 13 repos) para MEDIR el volumen contrafáctico
 * sin tocar `code-analyzer.ts` (compartido por ≥4 archivos de
 * `hypotheses/`, fuera de este alcance): **472 candidatos en los 13
 * repos**. Un muestreo a mano de 20 (semilla fija) encontró **0 verdaderos
 * claros** — dominado por el MISMO defecto de resolución que este módulo ya
 * documenta más abajo ("CON QUÉ SE CONFUNDE"/"VERIFICADO A MANO"): sólo los
 * 3 nombres de destino más comunes (`Any`, `value`, `type` — anotaciones de
 * tipo y accesos de propiedad mal resueltos como llamada) explican 118 de
 * los 472 (25 %). Ver el informe de la tarea para el detalle completo y la
 * recomendación: arreglar `repo.functions` es condición NECESARIA pero no
 * SUFICIENTE — antes hace falta un arreglo de alcance mayor en
 * `graph/resolve.ts` (fuera de este archivo).
 */
export function buildMiddleManFindings(
  repo: RepoUnit,
  minFanIn: Threshold,
  noLogicBranches: Threshold,
  dedicatedContainerRatio: Threshold,
): RawFinding[] {
  const graph = repo.graph;
  if (!graph) return [];

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const { fanIn, fanOut } = buildCallIndex(graph);
  const funcByNodeId = buildFunctionIndex(repo.functions);

  const candidates: Candidate[] = [];

  for (const node of graph.nodes) {
    if (node.kind !== "symbol" || node.family !== "function-like") continue;
    if (isDuplicateSibling(node.id)) continue;

    const fn = funcByNodeId.get(node.id);
    if (!fn) continue; // sin FunctionMetrics no hay forma honesta de afirmar "sin lógica propia"
    if (fn.metrics.branches > noLogicBranches.value) continue;

    const outs = fanOut.get(node.id);
    if (!outs || outs.size !== 1) continue;
    const [targetId] = outs;
    const target = nodeById.get(targetId!);
    if (!target) continue;
    if (target.file === node.file) continue; // no cruza archivo: fuera de alcance inter-file, ver docstring

    const callerCount = fanIn.get(node.id)?.size ?? 0;
    if (callerCount < minFanIn.value) continue;

    candidates.push({ node, fn, target, callerCount });
  }

  if (candidates.length === 0) return [];

  // Ratio por contenedor — ver "CON QUÉ SE CONFUNDE" en el docstring del módulo.
  const containerTotal = new Map<string, number>();
  for (const fn of repo.functions) {
    const key = containerKeyOf(fn.file, fn.metrics.className);
    containerTotal.set(key, (containerTotal.get(key) ?? 0) + 1);
  }
  const containerDelegates = new Map<string, number>();
  for (const c of candidates) {
    const key = containerKeyOf(c.fn.file, c.fn.metrics.className);
    containerDelegates.set(key, (containerDelegates.get(key) ?? 0) + 1);
  }

  const pageRankByFile = computeFilePageRank(graph);
  const findings: RawFinding[] = [];

  for (const { node, fn, target, callerCount } of candidates) {
    const name = symbolName(node);
    const targetName = symbolName(target);
    const key = containerKeyOf(fn.file, fn.metrics.className);
    const total = containerTotal.get(key) ?? 1;
    const delegates = containerDelegates.get(key) ?? 1;
    const ratio = total > 0 ? delegates / total : 1;
    const dedicated = total >= 2 && ratio >= dedicatedContainerRatio.value;

    const startLine = fn.startLine;
    const endLine = fn.endLine;
    const targetStart = target.startLine ?? 1;
    const targetEnd = target.endLine ?? targetStart;
    const targetPageRank = pageRankByFile?.get(fileNodeId(target.file)) ?? null;

    const evidence: Evidence[] = [
      { label: "líneas del método", value: Math.max(1, endLine - startLine + 1) },
    ];
    if (total >= 2) {
      evidence.push({
        label: `métodos de este contenedor que también sólo reenvían (de ${total})`,
        value: delegates,
      });
    }
    if (targetPageRank !== null) {
      evidence.push({
        label: "PageRank del archivo destino (cuánto del repo depende de él)",
        value: Number(targetPageRank.toFixed(4)),
      });
    }

    const detailParts: string[] = [
      `"${name}" recibe la llamada y su único trabajo es reenviarla a "${targetName}" (${target.file}): no hay ` +
        `ninguna rama, transformación ni verificación en su cuerpo — el trabajo real ocurre enteramente del otro ` +
        `lado. Cada uno de los ${callerCount} llamador(es) que hoy pasa por acá paga una capa que no decide ni ` +
        `transforma nada, y quien lea el código tiene que seguir un salto extra para llegar a donde de verdad pasa algo.`,
    ];

    if (dedicated) {
      detailParts.push(
        `El ${Math.round(ratio * 100)}% de los métodos de este contenedor (${delegates} de ${total}) tiene la ` +
          `misma forma de puro reenvío. Eso es compatible con un Adapter o un Proxy DELIBERADO (traducir una ` +
          `interfaz externa, o anteponer control de acceso/creación diferida) — si es así, esto no es el smell, ` +
          `es el patrón bien aplicado. Confianza reducida por esa razón: verificar si el contenedor existe a ` +
          `propósito para adaptar o interceptar antes de tocar nada.`,
      );
    } else {
      detailParts.push(
        `Este método reenvía de forma aislada dentro de un contenedor que por lo demás tiene lógica propia — más ` +
          `compatible con una indirección que se fue acumulando sin querer que con un Adapter/Proxy diseñado a ` +
          `propósito. Aun así, un Adapter o un Proxy delgado bien aplicado produce EXACTAMENTE esta misma firma ` +
          `estructural; esta señal por sí sola no distingue los dos casos — es una hipótesis, no una afirmación.`,
      );
    }

    if (fn.language === "java") {
      detailParts.push(
        "Esta llamada se resolvió con evidencia declared/resolved (nunca con la heurística path-proximity, " +
          "excluida a propósito). En Java la mayoría de las aristas de referencia del repo vienen de esa " +
          "heurística, así que este detector probablemente subreporta en este lenguaje: un middle man real puede " +
          "no aparecer acá si su única evidencia disponible es inferred.",
      );
    }

    findings.push({
      title: `"${name}" no hace más que reenviar a "${targetName}"`,
      detail: detailParts.join(" "),
      trigger: [
        { label: "ramas en el cuerpo (0 = sin lógica propia)", value: fn.metrics.branches, threshold: noLogicBranches },
        { label: "llamadores (A) enrutados a través de este método", value: callerCount, threshold: minFanIn },
      ],
      evidence,
      locations: [
        {
          file: fn.file,
          startLine,
          endLine,
          symbol: name,
          role: "método que sólo reenvía, sin agregar nada",
          anchor: { file: fn.file, symbolPath: fn.symbolPath },
        },
        {
          file: target.file,
          startLine: targetStart,
          endLine: targetEnd,
          symbol: targetName,
          role: "destino real del reenvío",
          anchor: { file: target.file, symbolPath: target.symbolPath },
        },
      ],
      severity: severityOf(callerCount, dedicated),
      advice: {
        primary: {
          name: "Remove Middle Man",
          kind: "refactorizacion",
          why:
            "Si el método no agrega nada, sus llamadores pueden hablar directamente con quien de verdad hace el " +
            "trabajo; eso borra un salto de indirección sin cambiar ningún comportamiento observable.",
          source: "https://refactoring.guru/es/smells/middle-man",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "middle-man"> = {
  id: "middle-man",
  kind: "middle-man",
  scope: "inter-file",
  needsGraph: true,
  title: "Intermediario innecesario (Middle Man)",
  needs: [],
  // OLA A3: `isConfidentCallEdge` es exactamente `edge.kind === "references"`
  // — la ÚNICA arista que este detector lee, ver el docstring del módulo.
  // OLA AW (AW4): alternativa, no conjuncion — `isConfidentCallEdge` usa
  // `references` OR `calls` (los dos testimonian el MISMO rol, "A llama a M").
  needsAnyEdge: ["references", "calls"],
  thresholds: {
    minFanIn: MIN_FAN_IN_SPEC,
    noLogicBranches: NO_LOGIC_BRANCHES_SPEC,
    dedicatedContainerRatio: DEDICATED_CONTAINER_RATIO_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    return buildMiddleManFindings(
      repo,
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
  },
};
