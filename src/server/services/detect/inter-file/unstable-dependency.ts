/**
 * `unstable-dependency` — un módulo relativamente ESTABLE depende de un
 * módulo relativamente VOLÁTIL (F5/CONTRATO-F5.md Contrato 4, catálogo
 * "dependencia inestable").
 *
 * RELACIÓN (sin jerga de AST): sobre el grafo YA proyectado a módulo
 * (`graph/metrics/projection.ts`, "el nodo `folder:` más profundo que
 * contiene al archivo" — CONTRATO-F4.md §3.1), una arista dirigida de
 * dependencia estructural (`imports`/`extends`/`implements`, EXACTAMENTE los
 * mismos tres kinds que ya usa la métrica hermana `instability.ts` — ver
 * "NO RECOMPUTAR" más abajo) de un módulo A a un módulo B tal que
 * `Inestabilidad(B) - Inestabilidad(A) > delta`. `Inestabilidad` es la
 * métrica de Martin `I = Ce/(Ca+Ce)` (R. C. Martin, "OO Design Quality
 * Metrics: An Analysis of Dependencies", C++ Report, 1994; mismo capítulo de
 * *Agile Software Development* que ya cita `instability.ts`): `I` bajo =
 * ESTABLE (muchos dependen de él, él de pocos); `I` alto = VOLÁTIL (depende
 * de muchos, nadie de él). Un A con `I` bajo que depende de un B con `I`
 * alto viola el "Stable Dependencies Principle" de Martin: A fue construido
 * (implícitamente, por tener muchos dependientes) para ser una base estable,
 * pero cada cambio futuro de B — que cambia con frecuencia, casi por
 * definición de `I` alto — puede obligar a A (y a todo lo que depende de A)
 * a cambiar con él.
 *
 * FUENTE DEL UMBRAL — Arcan y la contradicción que encontré en su propia
 * página, resuelta a favor de la definición y de Martin:
 * Arcan (docs.arcan.tech/2.9.0/architectural_smells/, ESSeRE Lab — la misma
 * herramienta que ya cita `dependency-cycle.ts` para "Cyclic Dependency")
 * define exactamente este smell como "Unstable Dependency (UD)": *"Describes
 * an architectural component that depends on other components that are less
 * stable than itself. [...] The smell violates the Stable Dependency
 * Principle defined by R. C. Martin."* — texto citado tal cual de esa
 * página. La MISMA página, en su "Detection strategy", escribe la regla como
 * `Instability(x) > Instability(y) + delta` para todo `y` del que `x`
 * depende, con `x` = "el contenedor que estamos chequeando por UD". Leída
 * literalmente, esa fórmula dice lo CONTRARIO de la prosa de la misma página
 * (x, el afectado, tendría que ser MÁS inestable que todo lo que depende de
 * él — es decir, depender de cosas MÁS estables, que es la dirección BUENA
 * según el propio "Stable Dependency Principle" de Martin, no una violación).
 * No hay forma de que ambas lecturas de la misma página sean ciertas a la
 * vez. Ante esa inconsistencia interna de la fuente, este detector sigue la
 * PROSA de Arcan (inequívoca: "depende de otros componentes menos estables
 * que él mismo") y el "Stable Dependency Principle" de Martin (bien
 * establecido y consistente en toda la literatura, incluida la cita que ya
 * usa `instability.ts`), NO la asignación literal de variables de esa única
 * oración — que leo como una errata de una documentación no revisada por
 * pares, no como una segunda definición válida. Arcan documenta el umbral
 * como un "delta" dinámico SIN publicar un valor numérico por defecto
 * ("Threshold: Dynamic delta value" — no hay una cifra que citar de ahí), así
 * que `minInstabilityGap` de abajo es `pisoDeclarado`, no `citado`: la FORMA
 * de la regla (una brecha de instabilidad con margen) tiene fuente; el
 * NÚMERO del margen no la tiene y se declara a mano — no se le atribuye a
 * Arcan/Martin un número que ninguno de los dos publicó.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: el criterio entero es aritmética sobre
 * grados de un grafo ya construido (`Ce`/`Ca` por módulo) más una resta;
 * cero vocabulario de dominio, cero nombres de archivo/carpeta interpretados.
 *
 * NO RECOMPUTAR — y la desviación medida frente a CONTRATO-F5.md §4.2:
 * el contrato describe `RepoUnit.metrics`/`GraphMetrics`/`metricValues` como
 * la vía para que un detector `inter-file` consuma una métrica YA
 * CALCULADA sin volver a tocar `graph/metrics/*`. Verificado por grep antes
 * de escribir esto: ese cableado (`RepoUnit.metrics`, `needsEdges`/
 * `needsMetrics`/`minProvenance` en `InterFileDetector`, `trustedEdge`/
 * `provenanceMix` en `RunContext`) **no existe todavía** en
 * `detect/types.ts` — el mismo estado que documentan hoy `dependency-cycle.ts`
 * y `orphan-file.ts` (que por eso reimplementan su propio Tarjan/BFS, con
 * motivo escrito). Este detector, en cambio, SÍ tiene una vía de no
 * recomputar el ÁLGEBRA de la métrica: importa y llama directamente
 * `graph/metrics/projection.ts#projectGraph` y
 * `graph/metrics/instability.ts#instability.compute` — las mismas funciones
 * YA REGISTRADAS en `GRAPH_METRICS` — en vez de reimplementar el cálculo de
 * `Ce`/`Ca`/`I`. Lo único que este archivo hace que la métrica no hace por sí
 * sola es (a) filtrar el grafo de entrada a aristas de confianza (ver abajo)
 * antes de proyectar, y (b) recorrer las aristas del módulo ya proyectado
 * comparando pares. Cuando el cableado de CONTRATO-F5 §4.2 aterrice, el
 * reemplazo es mecánico: las tres líneas `projectGraph`+`createBudget`+
 * `instability.compute` al principio de `buildUnstableDependencyFindings`
 * (abajo) se cambian por `metricValues<number>(repo.metrics, "instability")`
 * — el resto de la función (recorrer pares, armar hallazgos) no cambia.
 *
 * ARISTAS QUE NECESITA, Y CÓMO SE DECLARAN HOY: el mismo cableado ausente de
 * arriba también significa que `InterFileDetector` todavía no tiene el campo
 * `needsEdges`/`CoverageStatus: "sin-aristas"` de CONTRATO-F5 §4.3 — no hay
 * forma FORMAL, hoy, de que este detector devuelva "no aplicable" en vez de
 * "corrió y no encontró nada" cuando el grafo no tiene ninguna arista
 * `imports`/`extends`/`implements`. Se declara así, sin fingir un mecanismo
 * que no existe: `run()` devuelve `[]` en ese caso, y el runner de HOY lo
 * reporta como `corrio`/0 hallazgos, no como `no-aplicable` — mismo límite
 * estructural que ya heredan `dependency-cycle.ts`/`orphan-file.ts`.
 *
 * MEDIDO SOBRE LOS 8 REPOS DEL CORPUS (ver el resultado de la tarea): HOY,
 * `graph/build.ts` NO invoca ninguno de los 6 extractores de
 * `graph/edges/registry.ts` (herencia/imports/instanciacion/interfaz-
 * declarada/interfaz-estructural/mixin) — verificado por grep, cero
 * referencias fuera de sus propios tests. Consecuencia: `graph.edges` real
 * de HOY sólo contiene `contains` y `references`; `imports`/`extends`/
 * `implements` son 0/0/0 en los 8 repos medidos (click, cobra, guava,
 * jekyll, lodash, newtonsoft-json; preact/vueuse no se pudieron re-medir por
 * una excepción transitoria de otro agente escribiendo `detect/impact.ts` en
 * paralelo — la causa raíz, verificada por lectura de código, es la misma
 * para los 9 lenguajes y no depende del repo). Por lo tanto `instability`
 * nunca tiene un solo módulo con `Ca+Ce > 0` en el grafo real de hoy, y este
 * detector, corrido contra los 8 repos, encuentra **0 hallazgos en los 8**.
 * Esto NO es un indicio de que el detector esté roto (regla 5 del brief: hay
 * que decir tanto "dispara en todos" como "no dispara en ninguno") — la causa
 * raíz es una ausencia total de la señal de entrada, no una condición
 * demasiado estricta de este archivo, y está fuera de mi alcance (arreglar
 * `graph/build.ts`/`graph/edges/*` es de otro agente — regla 6).
 *
 * OJO CON JAVA — por qué este detector, al revés que otros del catálogo, NO
 * hereda el problema de `path-proximity`: la brecha de Java (la etapa
 * heurística `provenance: "inferred"` domina el 81% de las aristas
 * `references` aceptadas en guava, sin dataset etiquetado que la valide) es
 * un problema DE `references`. Este detector, igual que `instability.ts`
 * (mismo razonamiento, declarado ahí), NUNCA mira `references` — sólo
 * `imports`/`extends`/`implements`. Por construcción, es inmune a esa brecha
 * específica. Lo que SÍ hereda, para cuando esas 3 aristas tengan volumen,
 * es la asimetría de CONTRATO-F5.md §4.4: una arista `inferred` acá sería
 * EVIDENCIA POSITIVA de una violación arquitectónica (la dependencia entre
 * A y B es justamente lo que se está acusando), así que — mismo criterio que
 * `dependency-cycle.ts` — se EXCLUYEN a propósito las aristas `inferred` al
 * proyectar (`isConfidentStructuralEdge` abajo); lo conservador acá es no
 * afirmar la dependencia si sólo la sostiene una heurística sin piso de
 * precisión medido.
 *
 * SIMPLIFICACIONES DECLARADAS (heredadas de `instability.ts`, no repetidas
 * ahí por decisión propia): Martin combina `I` con `A` (Abstractness) para
 * decidir si depender de algo "inestable" es en realidad razonable porque lo
 * inestable es una interfaz/abstracción de variación deliberada. `A`/`D`
 * (distancia a la secuencia principal) NO están implementadas — mismo motivo
 * que documenta `instability.ts`: no hay forma estructural, sin lista de
 * vocabulario por lenguaje, de distinguir "abstracto a propósito" de
 * "concreto que cambia mucho" en los 9 lenguajes soportados. Esta es
 * exactamente la simplificación detrás de la confusión de abajo.
 *
 * CON QUÉ SE CONFUNDE (el patrón legítimo que produce la MISMA firma
 * estructural — la pregunta que el brief que originó el proyecto pide no
 * omitir): una CAPA DE INFRAESTRUCTURA/FRONTERA (adaptador, cargador de
 * plugins, registro de drivers, "anti-corruption layer") que a propósito
 * depende de algo que cambia mucho. Un módulo "core" estable (muchos
 * dependen de él, él de pocas cosas — `I` bajo) que depende de un módulo
 * "adaptador" cuya única razón de existir es envolver una API externa
 * volátil o alojar N implementaciones intercambiables tiene, con toda
 * intención de diseño, muchas salidas y pocas entradas (`I` alto): absorbe
 * la volatilidad para que el resto del sistema no tenga que hacerlo. Ahí, la
 * "dependencia inestable" es precisamente el punto del diseño (Dependency
 * Inversion / Anti-Corruption Layer), no un defecto — indistinguible de un
 * smell real usando sólo `I`, por la simplificación de arriba (sin `A`, no
 * hay forma de saber si el módulo volátil es "concreto que cambia" o
 * "abstracción/frontera que varía a propósito"). El `detail` de cada
 * hallazgo lo dice explícitamente: es hipótesis con confianza, no condena.
 */
import { pisoDeclarado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import { createComputeBudget } from "../../graph/metrics/budget.js";
import { instability } from "../../graph/metrics/instability.js";
import { projectGraph } from "../../graph/metrics/projection.js";
import type { CodeGraph, CodeGraphEdge } from "../../graph/types.js";
import type { FileSummary, InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "minInstabilityGap";

/** Ver "FUENTE DEL UMBRAL" en el docstring del módulo: la FORMA (brecha con
 *  margen) la publica Arcan; el NÚMERO no, así que es `pisoDeclarado`, no
 *  `citado`. 0.30 es un tercio del rango completo [0,1] de `I`: exige que el
 *  módulo del que se depende sea claramente, no marginalmente, más volátil
 *  que el módulo dependiente — evita marcar pares donde ambos módulos son
 *  parecidos en estabilidad (ruido cerca de la diagonal `I(A) == I(B)`). */
const MIN_GAP_SPEC = pisoDeclarado(0.3, {
  rationale:
    "Arcan publica la FORMA de la regla (Instability(dependencia) por encima de Instability(dependiente) más un " +
    "margen 'delta') pero no un valor por defecto para ese margen ('Dynamic delta value', sin cifra). 0.30 exige " +
    "una brecha de al menos un tercio del rango completo [0,1] de la métrica de Martin, para no marcar pares de " +
    "módulos con instabilidad parecida cerca de la diagonal I(A) == I(B), donde la dirección de la violación es " +
    "ruido de redondeo más que una señal real.",
});

/** Tope de VOLUMEN propio, no de detección — mismo patrón que
 *  `dependency-cycle.ts`/`orphan-file.ts`. Un panel no lista de forma útil
 *  más de unas pocas decenas de pares módulo-a-módulo a la vez. */
const MAX_FINDINGS_SPEC = presupuesto(40, {
  rationale:
    "un panel legible no muestra de forma útil más de unas pocas decenas de pares de módulos a la vez; es un " +
    "tope de volumen, no un umbral de detección.",
});

/** Kinds y proyección REUTILIZADOS de la métrica ya registrada — nunca una
 *  lista propia: si `instability.ts` cambia sus kinds, este archivo los seguía. */
const RELEVANT_EDGE_KINDS = new Set(instability.edgeKinds);

/**
 * Aristas de CONFIANZA para evidencia POSITIVA — ver "OJO CON JAVA" en el
 * docstring del módulo. Excluye `inferred` a propósito, mismo criterio que
 * `dependency-cycle.ts#isConfidentDependencyEdge`. Excluye también
 * `ambiguous` (CONTRATO-F9.md §4.5: fuera de toda consulta por defecto) —
 * `projectGraph` ya vuelve a filtrarla río abajo, así que esto no cambia el
 * resultado medido, pero cierra la brecha entre lo que este predicado
 * promete ("de confianza") y lo que de verdad excluía.
 */
function isConfidentStructuralEdge(e: CodeGraphEdge): boolean {
  return RELEVANT_EDGE_KINDS.has(e.kind) && e.provenance !== "inferred" && e.provenance !== "ambiguous";
}

function dirnameOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function folderOfModuleId(moduleId: string): string {
  return moduleId.startsWith("folder:") ? moduleId.slice("folder:".length) : moduleId;
}

function folderLabel(moduleId: string): string {
  const folder = folderOfModuleId(moduleId);
  return folder === "" ? "(raíz del repositorio)" : folder;
}

/**
 * Archivo representativo de un módulo (carpeta): el primero en orden
 * alfabético (determinístico) entre los que tienen a `moduleId` como su
 * carpeta contenedora INMEDIATA — que es exactamente la clave de proyección
 * `"module"` (CONTRATO-F4.md §3.1; verificado contra `projection.ts`:
 * `projectionKeyFn("module")` elige, para cada archivo, el nodo `folder:`
 * MÁS PROFUNDO que lo contiene, que es siempre su carpeta padre inmediata —
 * nunca hay dos candidatos con la misma profundidad para un mismo archivo).
 * Un módulo puede agrupar varios archivos; sólo se usa UNO como ancla de
 * ubicación, documentado así, no oculto.
 */
function representativeFile(files: readonly FileSummary[], moduleId: string): FileSummary | null {
  const folder = folderOfModuleId(moduleId);
  const matches = files.filter((f) => dirnameOf(f.path) === folder);
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => a.path.localeCompare(b.path))[0]!;
}

function severityOf(gap: number): number {
  return Math.max(20, Math.min(100, Math.round(25 + gap * 70)));
}

/**
 * Tolerancia para la comparación `gap > minGap.value`: `iTo`/`iFrom` salen de
 * una división real (`Ce/(Ca+Ce)`), así que dos valores matemáticamente
 * iguales al umbral pueden diferir en el último bit de precisión de punto
 * flotante (verificado a mano: `0.4 - 0.1 === 0.30000000000000004` en IEEE754,
 * no `0.3`). Sin esta tolerancia, un par EXACTAMENTE en el umbral podía
 * disparar o no según el camino de redondeo de `Ce`/`Ca`, no según la señal —
 * este detector encontró el caso al construir su propio test del borde del
 * umbral. No afecta la semántica: sigue exigiendo una brecha estrictamente
 * mayor al umbral declarado, sólo ignora ruido por debajo de esta magnitud.
 */
const GAP_EPSILON = 1e-9;

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * poder testearlo sin pasar por `RunContext`, mismo patrón que
 * `findDependencyCycles`/`buildOrphanFileFindings`.
 */
export function buildUnstableDependencyFindings(repo: RepoUnit, graph: CodeGraph, minGap: Threshold): RawFinding[] {
  const confidentGraph: CodeGraph = {
    nodes: graph.nodes,
    edges: graph.edges.filter(isConfidentStructuralEdge),
    resolution: graph.resolution,
  };
  const projected = projectGraph(confidentGraph, instability.projection, instability.edgeKinds);
  const result = instability.compute(projected, { budget: createComputeBudget() });
  if (result.status !== "computed" || !result.values) return [];
  const iByModule = result.values;

  const findings: RawFinding[] = [];

  for (let i = 0; i < projected.nodeIds.length; i++) {
    const from = projected.nodeIds[i]!;
    const iFrom = iByModule.get(from);
    if (iFrom === undefined) continue;

    const outs = projected.out[i]!;
    for (const j of outs) {
      const to = projected.nodeIds[j]!;
      const iTo = iByModule.get(to);
      if (iTo === undefined) continue;

      const gap = iTo - iFrom;
      if (gap <= minGap.value + GAP_EPSILON) continue; // ver `GAP_EPSILON` arriba

      const fileFrom = representativeFile(repo.files, from);
      const fileTo = representativeFile(repo.files, to);
      if (!fileFrom || !fileTo) continue; // defensivo: módulo sin archivo representable (no debería pasar)

      findings.push({
        variant: to, // agrupa por el módulo VOLÁTIL — ver `groupKey` en `detector`
        title: `"${folderLabel(from)}" (estable) depende de "${folderLabel(to)}" (volátil)`,
        detail:
          `El módulo "${folderLabel(from)}" tiene pocas dependencias propias y muchos módulos dependen de él ` +
          `(inestabilidad ${iFrom.toFixed(2)}), pero depende de "${folderLabel(to)}", que depende de muchas cosas ` +
          `y de él dependen pocas (inestabilidad ${iTo.toFixed(2)}): cada cambio futuro en "${folderLabel(to)}" ` +
          `puede arrastrar cambios hacia "${folderLabel(from)}" y todo lo que a su vez depende de él. Antes de ` +
          `actuar, confirmá que "${folderLabel(to)}" no sea una capa de frontera/adaptador deliberadamente ` +
          `volátil (envuelve una API externa o aloja implementaciones intercambiables): ahí, depender de algo ` +
          `inestable es el diseño, no el problema — ver el docstring de este detector.`,
        trigger: [
          {
            label: "brecha de inestabilidad (destino − origen)",
            value: Number(gap.toFixed(2)),
            threshold: minGap,
          },
        ],
        evidence: [
          { label: "inestabilidad del módulo dependiente", value: Number(iFrom.toFixed(2)) },
          { label: "inestabilidad del módulo del que depende", value: Number(iTo.toFixed(2)) },
        ],
        locations: [
          {
            file: fileFrom.path,
            startLine: 1,
            endLine: Math.max(1, fileFrom.lines),
            role: "módulo estable que depende de uno volátil",
          },
          {
            file: fileTo.path,
            startLine: 1,
            endLine: Math.max(1, fileTo.lines),
            role: "módulo volátil del que depende",
          },
        ],
        severity: severityOf(gap),
        advice: {
          primary: {
            name: "Dependency Inversion Principle",
            kind: "refactorizacion",
            why:
              "Invertir la dependencia (que ambos lados dependan de una abstracción estable, en vez de que el " +
              "módulo estable dependa directamente del volátil) aísla a los dependientes de los cambios futuros " +
              "del módulo inestable.",
            source: "https://en.wikipedia.org/wiki/Dependency_inversion_principle",
          },
        },
      });
    }
  }

  return findings.sort((x, y) => y.trigger[0].value - x.trigger[0].value || x.title.localeCompare(y.title));
}

export const detector: InterFileDetector<ThresholdKey, "unstable-dependency"> = {
  id: "unstable-dependency",
  kind: "unstable-dependency",
  scope: "inter-file",
  needsGraph: true,
  title: "Dependencia inestable",
  needs: [],
  // CORREGIDO EN LA OLA 11b (frente B0) — esto vivía mal declarado como
  // `needsEdges` (conjunción) desde la Ola A3, y apagaba el detector entero
  // («sin-aristas») cada vez que al repo le faltaba UN SOLO kind de la
  // lista: sobre `src/` (`imports` 640, `implements` 7, `extends` 0 — las
  // clases de este repo casi no heredan de otra cosa que no sea `Error`, un
  // global sin nodo) el AND lo apagaba pese a haber señal real, costando 1
  // hallazgo verdadero. `RELEVANT_EDGE_KINDS` (`instability.edgeKinds`) es
  // un vocabulario CERRADO, pero `isConfidentStructuralEdge` los usa como
  // UNIÓN (`RELEVANT_EDGE_KINDS.has(e.kind)`, sin exigir que los tres
  // coexistan) para filtrar el grafo que después se proyecta y se mide: los
  // tres juegan el MISMO ROL ("arista de dependencia estructural" para
  // `Ce`/`Ca`), así que con que UNO SOLO tenga volumen ya hay módulos con
  // grado > 0 y candidatos reales — es alternativa, no conjunción. Ver
  // `types.ts#InterFileDetector.needsAnyEdge`, "CÓMO NO VOLVER A
  // CONFUNDIRLO".
  needsAnyEdge: ["imports", "extends", "implements"],
  thresholds: {
    minInstabilityGap: MIN_GAP_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  // CONTRATO-F5.md §2.2: dos hallazgos de este detector con el MISMO módulo
  // volátil de destino son el MISMO problema de raíz visto desde N módulos
  // dependientes distintos ("este módulo es un sumidero de estabilidad").
  groupKey: (f) => f.variant,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` — este `return []` nunca debería ejecutarse en
    // producción, pero `CodeGraph | null` sigue siendo el tipo declarado.
    if (!graph) return [];
    return buildUnstableDependencyFindings(repo, graph, ctx.threshold("minInstabilityGap"));
  },
};
