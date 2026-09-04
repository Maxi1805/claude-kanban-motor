/**
 * `divergent-change` — cambio divergente entre archivos (PLAN.md §4.1, fila
 * "Cambio divergente" | "entre archivos" | "`ref` + agrupamiento; git
 * refuerza").
 *
 * RELACIÓN (sin jerga de AST): un archivo con muchas razones NO
 * RELACIONADAS para cambiar. La huella estructural que un grafo de
 * dependencias puede ver, sin git ni semántica: el archivo está acoplado
 * — hacia afuera (de qué depende) Y hacia adentro (quién depende de él) —
 * a un conjunto de OTROS archivos que, ENTRE SÍ, prácticamente no se
 * conocen: son grupos desconectados que sólo comparten a este archivo como
 * punto de contacto. El coeficiente de agrupamiento local (Watts & Strogatz,
 * "Collective dynamics of 'small-world' networks", Nature 393, 1998,
 * ecuación 2 — la misma fórmula que ya implementa y cita
 * `graph/metrics/agrupamiento.ts#clustering`) sobre la vecindad de ese
 * archivo, en la proyección `file`, es la medida de "entre sí no se
 * conocen": bajo ⇒ grupos desconectados; alto ⇒ los vecinos colaboran entre
 * ellos (ver "CON QUÉ SE CONFUNDE").
 *
 * "GIT REFUERZA" (PLAN.md), Y POR QUÉ ESTE DETECTOR NO LO USA: la señal
 * ideal para Cambio Divergente combina la FORMA del grafo con HISTORIA
 * (¿estos grupos de vecinos disparan commits distintos, en momentos
 * distintos?). `RepoUnit` (`detect/types.ts`) no trae git — ni facts de
 * commit, ni de autor, ni de fecha — así que este detector mide sólo la
 * mitad estructural, declarada como proxy, no como confirmación: un
 * coeficiente bajo es CONSISTENTE con cambio divergente, no prueba que las
 * dos áreas cambien en momentos distintos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OLA P (P8) — LA RAÍZ DE COMPOSICIÓN, QUE ESTE ARCHIVO DECLARABA COMO
 * INEVITABLE, SÍ TIENE UNA MARCA ESTRUCTURAL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * "CON QUÉ SE CONFUNDE" (abajo) dice, textual: *"Sin lista de nombres de
 * archivo (prohibida), este detector no puede distinguir ese caso: se declara
 * acá, no se esconde."* Sí puede, y sin nombres: **una raíz de composición
 * cablea a todos sus vecinos DESDE UN SOLO LUGAR del archivo.**
 * `jekyll/lib/jekyll.rb` los declara con `autoload` en el cuerpo del módulo;
 * `hugo/tpl/internal/templatefuncsRegistry.go` registra los namespaces en una
 * sola función; `rubocop/lib/rubocop/rspec/shared_contexts.rb` agrega
 * fixtures en un bloque. Un archivo con razones de cambio REALMENTE distintas
 * las tiene repartidas entre VARIAS de sus propias piezas: cada grupo de
 * vecinos desconectados es tocado por otra parte del archivo. Eso es
 * exactamente lo que "tiene varias razones para cambiar" significa, y el
 * grafo ya lo sabe — el extremo `from` de cada arista saliente es el símbolo
 * (o el nodo de archivo) desde el que se escribió. Ver
 * `MIN_DISTINCT_ORIGINS_SPEC`.
 *
 * El otro cambio es el mismo de `god-component.ts`: la lista de kinds de
 * `pagerank.edgeKinds` tiene 7 de los 12 `EdgeKind` de hoy (le falta `calls`,
 * que es la partición callee de la MISMA cascada que produce `references`) —
 * ver `DEPENDENCY_EDGE_KINDS` en ese archivo, importada acá para que las dos
 * mitades de la misma fórmula no vuelvan a divergir.
 *
 * RESULTADO MEDIDO (13 repos, contra la planilla de veredictos): volumen
 * 43 → 27; falsos juzgados vivos 7 → 4; verdaderos juzgados vivos 2 → 2
 * (ninguno muere). Con el piso de orígenes en 2 en vez de 3 quedan 34
 * hallazgos y 6 falsos vivos — se eligió 3, ver `MIN_DISTINCT_ORIGINS_SPEC`.
 * csharp y vue caen de 1 a 0 (base de UNO cada uno; el de vue,
 * `useMediaControls/demo.vue`, está juzgado FALSO).
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: las dos señales (fan-in/fan-out, y el
 * coeficiente de agrupamiento entre vecinos) son conteos y una fórmula sobre
 * la FORMA del grafo de dependencias a grano archivo — cero vocabulario,
 * cero nombres de archivo, clase o carpeta. La única lectura no-estructural
 * es indirecta: qué archivos aparecen como vecinos, nunca sus nombres.
 *
 * EMPARENTADO CON `fanout-without-cohesion.ts` (mismo catálogo, misma
 * métrica base) — LA DIFERENCIA, a propósito: `fanout-without-cohesion`
 * dispara con fan-out alto solo (el archivo ORQUESTA activamente piezas
 * desconectadas — la firma de un Mediator roto). Este detector exige,
 * ADEMÁS, un piso de fan-in (`minFanIn`): no basta con que el archivo
 * DEPENDA de grupos desconectados, tiene que además ser un punto que OTROS
 * archivos ya usan de vuelta — la lectura de Fowler de "varias razones para
 * cambiar" es más fiel a un archivo que está TEJIDO en varias áreas no
 * relacionadas desde los dos sentidos, no sólo a uno que llama hacia
 * afuera. Es la MISMA base matemática que un catálogo con 41 patrones
 * nombrados vuelve a usar bajo distintos ángulos (ver también "Hub / god
 * component", misma fila de PLAN.md §4.1) — DECLARADO, no escondido: si el
 * integrador decide fusionar los tres kinds en una sola tarjeta de UI más
 * adelante, este archivo y `fanout-without-cohesion.ts` ya documentan por
 * qué convergen y en qué difieren.
 *
 * CÓMO ACCEDE A LAS MÉTRICAS SIN REIMPLEMENTAR EL ALGORITMO — Y LA
 * DESVIACIÓN MEDIDA frente a CONTRATO-F5.md §4.2/§4.3: ese contrato describe
 * un `RepoUnit.metrics` poblado por `graph/metrics/run.ts#computeGraphMetrics`
 * con `needsEdges`/`needsMetrics` en `InterFileDetector`. Verificado por grep
 * antes de escribir este archivo: nada de eso existe todavía (`RepoUnit` no
 * tiene `metrics`, `InterFileDetector` no tiene `needsEdges`/`needsMetrics`).
 * Lo que SÍ existe y corre en PRODUCCIÓN hoy es `detect/reach.ts` (Contrato 1,
 * cableado en `crossAnalyze`): llama directo a `projectGraph` +
 * `pagerank.compute`/`scc.compute`, sin pasar por `RepoUnit.metrics`. Este
 * archivo sigue ese mismo precedente ya en producción — y el detector
 * hermano `fanout-without-cohesion.ts` documenta la idéntica desviación,
 * verificada por separado: importa `clustering`/`pagerank` (los objetos
 * `GraphMetric` REGISTRADOS en `graph/metrics/registry.ts`) y llama a su
 * `.compute()` una vez por corrida — nunca reimplementa Watts-Strogatz ni la
 * power-iteration de PageRank. Costo no compartido entre detectores (cada
 * uno paga su propia proyección/compute sobre el mismo grafo): limitación de
 * infraestructura declarada, no de este archivo — migrar a `RepoUnit.metrics`
 * el día que aterrice no cambia esta lógica de detección, sólo de dónde
 * vienen los números.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - Granularidad ARCHIVO (proyección `file`, la que `pagerank`/`clustering`
 *    exponen hoy). Un archivo con varias clases es una sola unidad.
 *  - `fanIn`/`fanOut` salen de `pagerank.ts#PageRankValue` (ya los
 *    empaqueta junto al puntaje — "sin un segundo cómputo", mismo criterio
 *    que `reach.ts` y `fanout-without-cohesion.ts` ya declaran).
 *  - PROVENANCE: a diferencia de `fanout-without-cohesion.ts` (que cuenta
 *    CUALQUIER provenance), este detector EXCLUYE aristas `inferred` antes
 *    de proyectar — mismo criterio que `dependency-cycle.ts`: una arista
 *    `inferred` acá es evidencia POSITIVA del hallazgo (contribuye fan-in,
 *    fan-out, y a la forma del vecindario que decide el coeficiente), y la
 *    regla de CONTRATO-F4.md/F5.md para evidencia positiva es excluirla —
 *    lo conservador es no afirmar. Medido el costo de esta elección más
 *    abajo ("OJO CON JAVA").
 *  - No hay una versión "un hallazgo por GRUPO de vecinos desconectados":
 *    se reporta un hallazgo por ARCHIVO candidato, no una lista de qué
 *    grupos son. El `evidence` de fan-in/fan-out es lo que el usuario tiene
 *    para juzgar magnitud; identificar los grupos en sí (p.ej. vía Louvain,
 *    `graph/metrics/comunidades.ts`) es una mejora declarada, no hecha acá,
 *    para no sumar una cuarta métrica sin una hipótesis medida detrás.
 *
 * CON QUÉ SE CONFUNDE (patrón legítimo, no un smell) — verificado a mano
 * contra el corpus externo (ver el resultado de esta tarea para el detalle):
 *   - PUNTO DE ENTRADA / RAÍZ DE COMPOSICIÓN. Un archivo que cablea piezas
 *     no relacionadas A PROPÓSITO (un `require_all`/`autoload` de nivel de
 *     paquete, un router de demo que registra páginas sin relación entre
 *     sí) tiene EXACTAMENTE esta firma — fan-out alto hacia grupos que no
 *     se conocen — sin ser un smell: nunca cambia por ninguna de esas
 *     razones, sólo las declara una vez. `minFanIn` (abajo) descarta el
 *     caso MÁS fácil (fan-in ~0: nada lo usa de vuelta — confirmado en el
 *     corpus: `preact/demo/index.jsx`, fan-in 0, cae fuera del piso), pero
 *     NO todos: `jekyll/lib/jekyll.rb` es una raíz de composición
 *     (`require_all` + `autoload` de todos los módulos internos) con fan-in
 *     43 porque muchos archivos usan utilidades de nivel de módulo
 *     definidas en el mismo archivo — pasa igual el piso de `minFanIn` y es
 *     un FALSO POSITIVO verificado a mano (ver el resultado de la tarea).
 *     Sin lista de nombres de archivo (prohibida), este detector no puede
 *     distinguir ese caso: se declara acá, no se esconde.
 *   - ARCHIVO DE CONFIGURACIÓN / SUPERFICIE DE ATRIBUTOS. Una clase de
 *     atributo o de opciones que expone perillas para VARIOS ejes
 *     independientes (cada eje, un tipo/enum no relacionado con los demás)
 *     tiene la misma firma: fan-out a tipos que no se conocen entre sí,
 *     coeficiente bajo. Verificado a mano:
 *     `Src/Newtonsoft.Json/JsonPropertyAttribute.cs` (fan-out 6 a
 *     `NullValueHandling`/`DefaultValueHandling`/`ReferenceLoopHandling`/
 *     `ObjectCreationHandling`/`TypeNameHandling`/`Required`, coeficiente 0,
 *     fan-in 0) — cae fuera del piso de `minFanIn` con el umbral elegido
 *     acá, pero un archivo de configuración con MÁS de un consumidor
 *     seguiría pasando por la misma razón que `jekyll.rb`.
 *
 * VERIFICACIÓN A MANO (5 candidatos, ver el resultado de la tarea para el
 * detalle completo): `jekyll/lib/jekyll/site.rb` (fan-out 21 a Reader,
 * Profiler, Regenerator, LiquidRenderer, PluginManager, converters,
 * generators, layouts, tema, caché — CIERTO, son ejes de cambio
 * independientes) y
 * `Src/Newtonsoft.Json/JsonSerializer.cs` (fan-out 25 a
 * TypeNameHandling/ReferenceLoopHandling/MissingMemberHandling/
 * ObjectCreationHandling/NullValueHandling/DefaultValueHandling/
 * ConstructorHandling/MetadataPropertyHandling/IContractResolver/
 * ITraceWriter/IEqualityComparer/ISerializationBinder — CIERTO, mismo
 * patrón) confirmados CIERTOS; `jekyll/lib/jekyll.rb` confirmado FALSO
 * (raíz de composición, ver arriba); `preact/demo/index.jsx` y
 * `Src/Newtonsoft.Json/Linq/JObject.cs` (fan-in 0 cada uno) EXCLUIDOS por
 * `minFanIn` antes de convertirse en hallazgo — su exclusión, verificada,
 * es la razón de ser del umbral. 2 de 2 candidatos que SÍ pasan las tres
 * condiciones y fueron leídos completos resultaron ciertos; 1 de los 5
 * inspeccionados (`jekyll.rb`) es un falso positivo que ningún umbral
 * estructural sin lista de nombres puede excluir — declarado arriba, no
 * escondido.
 *
 * OJO CON JAVA — MEDIDO, no supuesto: en guava, del total de aristas
 * candidatas (58 496 `declared` + 1 601 `resolved` + 57 325 `inferred`),
 * la etapa heurística `path-proximity` (`inferred`) es prácticamente la
 * mitad. Con el criterio conservador de este detector (excluir `inferred`
 * por completo, ver "SIMPLIFICACIONES DECLARADAS"), guava da **0**
 * candidatos con `fanOut >= 6 && clustering <= 0.1`; contando TODAS las
 * provenance (incluida `inferred`) da 11. La brecha no es un bug de este
 * archivo: es la misma brecha de resolución de Java ya declarada por
 * `dependency-cycle.ts`/`orphan-file.ts` (dataset etiquetado sólo en Ruby,
 * `path-proximity` sin piso de precisión medido). Se elige el lado
 * conservador (0 hallazgos en Java antes que 11 con confianza indebida) por
 * la misma regla que `dependency-cycle.ts` ya aplica: una arista `inferred`
 * es evidencia POSITIVA de este hallazgo, así que lo conservador es
 * excluirla. Consecuencia declarada: este detector, HOY, es prácticamente
 * mudo en Java — no "no aplicable" (el lenguaje sí tiene `references`), sino
 * "sin candidatos que pasen el criterio de confianza alta". Ver el
 * resultado de la tarea para la corrida completa de los 8 repos.
 *
 * LÍMITES DECLARADOS POR LENGUAJE: ninguno por gramática — el detector no
 * lee `language` ni `sets` en absoluto, sólo `CodeGraphNode.file` y las
 * aristas del grafo, así que es agnóstico de lenguaje por construcción. La
 * brecha de Java de arriba es de RESOLUCIÓN del grafo, no de este detector.
 */
import { derivado, pisoDeclarado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import { clustering } from "../../graph/metrics/agrupamiento.js";
import { pagerank, type PageRankValue } from "../../graph/metrics/pagerank.js";
import { projectGraph } from "../../graph/metrics/projection.js";
import { createComputeBudget } from "../../graph/metrics/budget.js";
import { DEPENDENCY_EDGE_KINDS } from "./god-component.js";
import type { CodeGraph } from "../../graph/types.js";
import type { InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "minFanOut" | "minFanIn" | "maxClustering" | "minDistinctOrigins";

/**
 * Piso de fan-out: cuántos archivos DISTINTOS tiene que tocar el candidato
 * para que "forman grupos que no se conocen entre sí" sea una afirmación
 * con sustancia. Con menos de un puñado de vecinos, un coeficiente bajo
 * puede salir de sólo 2-3 pares sin relación — no alcanza para hablar de
 * "grupos" (plural). No hay literatura que fije un piso de fan-out
 * específico para Cambio Divergente (a diferencia de, p.ej., Arcan para
 * ciclos): MEDIDO, no elegido a mano — mismo `fanIn`/`fanOut` de
 * `pagerank.ts` que `god-component.ts` ya usa (misma proyección `file`,
 * mismos `edgeKinds`, misma exclusión de `inferred`), así que `derivado()`
 * con `of: "fanOut"` es el mismo metric name que ese detector, no uno
 * nuevo — R3 (auditoría de umbrales inventados): antes `pisoDeclarado(6, …)`,
 * mismo valor.
 */
const MIN_FAN_OUT_SPEC = derivado({
  floor: 6,
  stat: "p95",
  of: "fanOut",
  floorSource: {
    rationale:
      "con menos de 6 vecinos salientes distintos, un coeficiente de agrupamiento bajo puede salir de sólo un par o " +
      "dos sin relación entre sí, y \"forman grupos\" (plural) deja de ser una afirmación con sustancia; 6 es el " +
      "piso más bajo que, medido contra el corpus externo de esta tarea, ya separa archivos con volumen real de " +
      "candidatos triviales en los repos chicos del corpus (cobra, click: 0 candidatos incluso con este piso).",
  },
});

/**
 * Piso de fan-in: al menos otros dos archivos ya dependen DE VUELTA de este
 * candidato. Sin este piso, un punto de entrada o raíz de composición que
 * nadie usa de vuelta (fan-in 0) pasa exactamente la misma firma que un
 * archivo con razones reales para cambiar — ver "CON QUÉ SE CONFUNDE".
 * Deliberadamente MÁS BAJO que `minFanOut`: no se exige un hub simétrico,
 * sólo se descarta el caso más fácil de un sumidero puro. Verificado contra
 * el corpus: con este piso, `preact/demo/index.jsx` (fan-in 0) y
 * `Src/Newtonsoft.Json/Linq/JObject.cs` (fan-in 0) quedan excluidos; el
 * corpus no ofrece un caso limpio donde una raíz de composición nunca sea
 * referenciada por NADA del repo salvo con fan-in 0 o 1, así que 2 es el
 * punto de corte más bajo defendible — MEDIDO, mismo `of: "fanIn"` que
 * `god-component.ts` (R3: antes `pisoDeclarado(2, …)`, mismo valor).
 */
const MIN_FAN_IN_SPEC = derivado({
  floor: 2,
  stat: "p95",
  of: "fanIn",
  floorSource: {
    rationale:
      "descarta el caso más fácil de confundir con este hallazgo — un sumidero puro (punto de entrada, script, " +
      "demo) que nada del repo referencia de vuelta — sin exigir un hub simétrico; deliberadamente más bajo que " +
      "minFanOut porque la afirmación de \"razones para cambiar\" no requiere que el candidato sea tan usado como " +
      "usador. Verificado contra el corpus externo de esta tarea: excluye preact/demo/index.jsx y " +
      "Newtonsoft.Json/Linq/JObject.cs (fan-in 0 ambos), sin excluir ningún verdadero positivo confirmado a mano.",
  },
});

/**
 * Techo de coeficiente de agrupamiento (Watts & Strogatz — ver el docstring
 * del módulo): por debajo de este valor, los vecinos del candidato
 * prácticamente no se conocen entre sí. Elegido a mano, sin cita externa
 * (no hay un techo publicado para "bajo" en este contexto): 0.1 se ubica
 * claramente por debajo del coeficiente típico de un hub real en los 8
 * repos del corpus externo de esta tarea (promedios por repo entre ~0.15 y
 * ~0.5, ver el resultado final), así que dispara sólo sobre vecindarios
 * marcadamente fragmentados, no sobre "algo por debajo del promedio".
 */
const MAX_CLUSTERING_SPEC = pisoDeclarado(0.1, {
  rationale:
    "0.1 queda claramente por debajo del coeficiente de agrupamiento promedio medido en los 8 repos del corpus " +
    "externo de esta tarea (entre ~0.15 y ~0.5 según el repo), así que dispara sólo sobre vecindarios " +
    "marcadamente fragmentados, no sobre cualquier archivo apenas debajo del promedio de su repo.",
});

/**
 * Cuántos SÍMBOLOS DISTINTOS del archivo candidato tienen que originar sus
 * aristas salientes entre archivos — ver "OLA P (P8)" en el docstring del
 * módulo. El extremo `from` de una arista es el símbolo desde el que se
 * escribió la referencia (o el nodo `file:` cuando la referencia vive en el
 * cuerpo del módulo); contar cuántos distintos hay es contar en cuántas
 * piezas del archivo está repartido su acoplamiento hacia afuera.
 *
 * Una RAÍZ DE COMPOSICIÓN cablea todo desde un solo lugar y da 1: nunca
 * cambia "por una de esas razones", sólo las declara. Un archivo con varias
 * razones de cambio las tiene repartidas.
 *
 * `pisoDeclarado` y no `citado`: la Regla de Tres es el razonamiento de
 * fondo ("varios, no dos"), pero el número acá está MEDIDO sobre el corpus y
 * es eso lo que lo justifica — con piso 2 quedan 34 hallazgos y 6 falsos
 * juzgados vivos, con piso 3 quedan 27 y 4, y los 2 verdaderos juzgados
 * sobreviven en los dos casos. Se elige 3 porque saca dos falsos más sin
 * costar un solo verdadero; atribuirle el número a Fowler sería inventarle
 * una cita a una métrica que él nunca definió.
 */
const MIN_DISTINCT_ORIGINS_SPEC = pisoDeclarado(3, {
  rationale:
    "cuántos símbolos distintos del propio archivo originan su acoplamiento hacia afuera: 1 es una raíz de " +
    "composición (declara todo en un solo lugar y no cambia por ninguna de esas razones), varios es un archivo " +
    "tejido en áreas distintas desde piezas distintas. MEDIDO sobre los 13 repos del corpus contra la planilla de " +
    "veredictos: con 2 sobreviven 6 falsos juzgados y con 3 sobreviven 4, sin perder ninguno de los 2 verdaderos " +
    "juzgados en ninguno de los dos casos.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. */
const MAX_FINDINGS_SPEC = presupuesto(40, {
  rationale:
    "un panel legible no lista de forma útil más de unas pocas decenas de candidatos a cambio divergente a la " +
    "vez; es un tope de volumen, no un umbral de detección.",
});

function fileName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/** Todo kind salvo `contains`, y sólo provenance declared/resolved — ver
 *  "SIMPLIFICACIONES DECLARADAS" en el docstring del módulo: una arista
 *  `inferred` acá es evidencia POSITIVA (contribuye fan-in/fan-out/forma del
 *  vecindario), así que se excluye por la misma regla que `dependency-cycle.ts`.
 *  Excluye también `ambiguous` (CONTRATO-F9.md §4.5: fuera de toda consulta
 *  por defecto) — el filtro decía "declared/resolved" pero el código sólo
 *  excluía `inferred`; `projectGraph` ya vuelve a filtrar `ambiguous` río
 *  abajo (`edgeIsAmbiguous`), así que esto no cambiaba el resultado medido,
 *  pero el nombre de la función prometía más de lo que hacía. */
function isConfidentEdge(e: { readonly kind: string; readonly provenance: string }): boolean {
  return e.kind !== "contains" && e.provenance !== "inferred" && e.provenance !== "ambiguous";
}

function severityOf(fanOut: number, coefficient: number, maxClustering: number): number {
  const fanOutTerm = Math.min(40, fanOut * 2);
  const gap = Math.max(0, maxClustering - coefficient);
  const clusterTerm = maxClustering > 0 ? Math.round((gap / maxClustering) * 30) : 0;
  return Math.max(20, Math.min(100, 30 + fanOutTerm + clusterTerm));
}

/** Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 *  poder testearlo sin pasar por `RunContext`, mismo patrón que
 *  `findDependencyCycles`/`buildOrphanFileFindings`. */
export function buildDivergentChangeFindings(
  repo: RepoUnit,
  thresholds: {
    readonly minFanOut: Threshold;
    readonly minFanIn: Threshold;
    readonly maxClustering: Threshold;
    readonly minDistinctOrigins: Threshold;
  },
): readonly RawFinding[] {
  const graph = repo.graph;
  if (!graph) return [];

  const confidentEdges = graph.edges.filter(isConfidentEdge);
  if (confidentEdges.length === 0) return [];
  const confidentGraph: CodeGraph = { nodes: graph.nodes, edges: confidentEdges, resolution: graph.resolution };

  // Ver `MIN_DISTINCT_ORIGINS_SPEC`: en cuántas piezas del propio archivo
  // está repartido su acoplamiento hacia afuera. Una sola pasada O(E) sobre
  // las mismas aristas de confianza que alimentan las métricas.
  const nodeFileById = new Map(graph.nodes.map((n) => [n.id, n.file] as const));
  const originsByFile = new Map<string, Set<string>>();
  for (const e of confidentEdges) {
    const fromFile = nodeFileById.get(e.from);
    const toFile = nodeFileById.get(e.to);
    if (fromFile === undefined || toFile === undefined || fromFile === toFile) continue;
    let origins = originsByFile.get(fromFile);
    if (!origins) {
      origins = new Set();
      originsByFile.set(fromFile, origins);
    }
    origins.add(e.from);
  }

  let clusterValues: ReadonlyMap<string, number> | undefined;
  let pagerankValues: ReadonlyMap<string, PageRankValue> | undefined;
  try {
    // Misma lista de kinds para las dos métricas (`pagerank.edgeKinds` ===
    // `clustering.edgeKinds`, ambas "todas menos contains" — verificado):
    // una sola proyección sirve a las dos `.compute()`, sin proyectar dos
    // veces el mismo grafo.
    // `DEPENDENCY_EDGE_KINDS` (de `god-component.ts`), no `pagerank.edgeKinds`:
    // esa lista se quedó en 7 de los 12 `EdgeKind` de hoy — ver "OLA P (P8)"
    // en el docstring del módulo. Sigue valiendo el comentario original: una
    // sola proyección alimenta a `clustering` y a `pagerank`, que declaran la
    // misma lista.
    const projected = projectGraph(confidentGraph, "file", DEPENDENCY_EDGE_KINDS);
    const clusterResult = clustering.compute(projected, { budget: createComputeBudget() });
    const pagerankResult = pagerank.compute(projected, { budget: createComputeBudget() });
    if (clusterResult.status !== "computed" || !clusterResult.values) return [];
    if (pagerankResult.status !== "computed" || !pagerankResult.values) return [];
    clusterValues = clusterResult.values;
    pagerankValues = pagerankResult.values;
  } catch {
    // Misma disciplina que `reach.ts`: un fallo en el cómputo de métricas no
    // debe tumbar el resto de la corrida, sólo degradar este detector a "sin
    // candidatos" — nunca lanzar desde `run()`.
    return [];
  }

  const knownFiles = new Set(repo.files.map((f) => f.path));

  interface Candidate {
    file: string;
    fanIn: number;
    fanOut: number;
    coefficient: number;
    origins: number;
  }
  const candidates: Candidate[] = [];
  for (const [id, pr] of pagerankValues) {
    if (!id.startsWith("file:")) continue;
    const file = id.slice("file:".length);
    // Descarta pseudo-nodos "file:<carpeta>" que `projectGraph` produce para
    // cualquier nodo `folder` (nunca extremo de una arista de dependencia,
    // así que quedan aislados) — sólo interesan archivos REALES de `repo.files`.
    if (!knownFiles.has(file)) continue;
    if (pr.fanOut < thresholds.minFanOut.value) continue;
    if (pr.fanIn < thresholds.minFanIn.value) continue;
    const coefficient = clusterValues.get(id);
    if (coefficient === undefined || coefficient > thresholds.maxClustering.value) continue;
    // Raíz de composición: todo el cableado sale de un solo lugar del archivo.
    const origins = originsByFile.get(file)?.size ?? 0;
    if (origins < thresholds.minDistinctOrigins.value) continue;
    candidates.push({ file, fanIn: pr.fanIn, fanOut: pr.fanOut, coefficient, origins });
  }

  candidates.sort((a, b) => b.fanOut - a.fanOut || a.coefficient - b.coefficient || a.file.localeCompare(b.file));

  const findings: RawFinding[] = [];
  for (const c of candidates) {
    findings.push({
      title: `"${fileName(c.file)}" depende de ${c.fanOut} archivos que casi no se conocen entre sí`,
      detail:
        `Este archivo está acoplado a ${c.fanOut} archivos distintos, y esos archivos prácticamente no se ` +
        "referencian entre ellos: forman grupos separados que sólo comparten a éste como punto de contacto. " +
        "Cada grupo desconectado es, potencialmente, una razón de cambio independiente de las demás: tocar " +
        "cualquiera de ellas obliga a considerar (o modificar) este archivo, aunque las dos razones no tengan " +
        `relación entre sí. Ese acoplamiento sale de ${c.origins} piezas DISTINTAS de este mismo archivo, no de ` +
        "un único lugar: por eso no se lo trata como una raíz de composición o un punto de entrada (un archivo " +
        "que declara todo su cableado en un solo sitio no cambia por ninguna de esas razones, sólo las enumera, " +
        "y este detector ya no lo reporta). Queda por confirmar a mano lo que el grafo no puede ver: que no sea " +
        "un archivo de configuración/atributos que sólo declara perillas independientes, ni un módulo cohesivo " +
        "alrededor de un solo concepto cuyos vecinos simplemente no se conocen entre sí.",
      trigger: [
        { label: "archivos distintos de los que depende (fan-out)", value: c.fanOut, threshold: thresholds.minFanOut },
        {
          label: "piezas distintas de este archivo que originan ese acoplamiento",
          value: c.origins,
          threshold: thresholds.minDistinctOrigins,
        },
        {
          label: "coeficiente de agrupamiento entre esos vecinos (Watts & Strogatz)",
          value: c.coefficient,
          threshold: thresholds.maxClustering,
        },
      ],
      evidence: [{ label: "archivos que lo referencian (fan-in)", value: c.fanIn, note: "piso: " + thresholds.minFanIn.label }],
      locations: [
        {
          file: c.file,
          startLine: 1,
          endLine: Math.max(1, repo.files.find((f) => f.path === c.file)?.lines ?? 1),
          role: "archivo con vecinos que no se conocen entre sí",
        },
      ],
      severity: severityOf(c.fanOut, c.coefficient, thresholds.maxClustering.value),
      advice: {
        primary: {
          name: "Extract Class",
          kind: "refactorizacion",
          why:
            "Separar las responsabilidades que corresponden a cada grupo desconectado de vecinos en su propia " +
            "clase/módulo hace que cada una cambie por su propia razón, sin arrastrar a las demás.",
          source: "https://refactoring.guru/es/extract-class",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "divergent-change"> = {
  id: "divergent-change",
  kind: "divergent-change",
  scope: "inter-file",
  needsGraph: true,
  title: "Cambio divergente",
  needs: [],
  // OLA A3: fan-in/fan-out/coeficiente salen de `pagerank`/`clustering`
  // (`pagerank.edgeKinds`, unión genérica de 7 kinds importada del metric
  // compartido, no elegida kind por kind acá). Se declara sólo `references`
  // — ver `types.ts#needsEdges`, "unión genérica".
  needsEdges: ["references"],
  thresholds: {
    minFanOut: MIN_FAN_OUT_SPEC,
    minFanIn: MIN_FAN_IN_SPEC,
    maxClustering: MAX_CLUSTERING_SPEC,
    minDistinctOrigins: MIN_DISTINCT_ORIGINS_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    return buildDivergentChangeFindings(repo, {
      minFanOut: ctx.threshold("minFanOut"),
      minFanIn: ctx.threshold("minFanIn"),
      maxClustering: ctx.threshold("maxClustering"),
      minDistinctOrigins: ctx.threshold("minDistinctOrigins"),
    });
  },
};
