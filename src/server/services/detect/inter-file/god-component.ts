/**
 * `god-component` — HUB / GOD COMPONENT: un archivo con fan-in Y fan-out
 * SIMULTÁNEAMENTE altos sobre el grafo de dependencias entre archivos.
 *
 * RELACIÓN (sin jerga de AST): un archivo del que dependen muchos otros
 * archivos del repo (fan-in alto: es difícil de cambiar sin romper a
 * terceros) Y QUE AL MISMO TIEMPO depende de muchos otros archivos (fan-out
 * alto: es frágil frente a cambios en cualquiera de sus dependencias). Las
 * dos condiciones tienen que darse A LA VEZ — un archivo con sólo fan-in alto
 * es una biblioteca/API estable (deseable); uno con sólo fan-out alto es un
 * orquestador (ver "CON QUÉ SE CONFUNDE"); el que tiene ambos es un punto
 * único por el que casi todo cambio termina pasando, y que además puede
 * romperse por casi cualquier cambio ajeno.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OLA P (P8) — POR QUÉ ESTE ARCHIVO CAMBIÓ, CON LOS NÚMEROS QUE LO FORZARON
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Este kind es el ÚNICO del catálogo que perdió VERDADEROS medidos sin haber
 * sido nunca frente de una ola: de 7 hallazgos juzgados `verdadero` a mano
 * quedaban 3. Se movió de rebote cuando la Ola O sacó del resolvedor las
 * aristas de rol `decl-name` (30,9 % de las `references` de rubocop, 31,4 %
 * de las de eslint). Diagnóstico medido de los 4 perdidos, uno por uno:
 *
 *  1. `eslint/lib/rule-tester/rule-tester.js` — el hallazgo decía fan-in 41.
 *     Los consumidores REALES dentro del conjunto analizado son DOS
 *     (`lib/api.js` y `lib/rule-tester/index.js`; `tests/` no se analiza).
 *     Fan-in de hoy: 1. **Los otros 40 eran `decl-name` fabricadas.** No se
 *     recupera y no debe recuperarse: la evidencia no existía.
 *  2. `eslint/lib/eslint/eslint.js` (8/16 → 6/14) y
 *  3. `rubocop/lib/rubocop/cli.rb` (19/12 → 7/11): fan-in real, por debajo
 *     del piso 8 por 2 y por 1. **Los recupera este cambio** (ver abajo).
 *  4. `sqlalchemy/lib/sqlalchemy/sql/lambdas.py` (20/20 → 7/15): fan-in 7,
 *     uno por debajo del piso incluso con el criterio nuevo. Sigue perdido,
 *     declarado.
 *
 * LA RAÍZ, y es de definición, no de umbral: el piso 8/8 es el p95 del
 * CORPUS. Medido de nuevo sobre el grafo de hoy (13 repos, 3.866 archivos):
 * el p95 de fan-in del corpus sigue siendo 8 y el de fan-out también — el
 * piso NO quedó viejo. Lo que quedó mal es aplicar un piso de corpus a CADA
 * repo: el p95 propio de eslint es fan-in 4 / fan-out 3 y el de rubocop 7/6,
 * mientras el de sqlalchemy es 62/32 y el de hugo 21/15. Con un piso único,
 * en eslint el detector es mudo por construcción (nada llega a 8) y en
 * sqlalchemy emite 70 hallazgos sobre 326 archivos — el 21 % del repo es
 * "god component", que es una forma de no decir nada. **Y eso es exactamente
 * lo que la fuente citada abajo hace y este archivo prometía**: Arcan calcula
 * sus umbrales de forma relativa a CADA sistema analizado. Estaba escrito en
 * este mismo docstring desde el día uno y nunca se implementó.
 *
 * LOS CUATRO CAMBIOS, todos medidos sobre los 13 repos del corpus:
 *
 *  A. **Aristas: "todas menos `contains`" ahora es verdad.** El detector
 *     proyectaba con `pagerank.edgeKinds`, una lista de 7 kinds escrita
 *     cuando el grafo tenía 8; hoy hay 12, y `calls` — que es la MISMA
 *     cascada que `references`, sólo la partición callee (`edge-kinds.ts`) —
 *     no estaba. Ver `DEPENDENCY_EDGE_KINDS`.
 *  B. **Pisos relativos al repo:** `min(piso declarado, p95 del propio
 *     repo)`, y además el candidato tiene que ser un OUTLIER de su repo en
 *     al menos uno de los dos ejes. El `min` (no `max`) es deliberado: bajar
 *     el piso donde el repo no lo alcanza recupera recall; subirlo donde el
 *     repo es denso lo compraría matando `hugo/…/page_frontmatter.go`, un
 *     verdadero juzgado que hoy está vivo (medido: la variante `max` lo mata
 *     y baja los verdaderos vivos de 5 a 2).
 *  C. **Desequilibrio (`MAX_DEGREE_IMBALANCE`):** la fuente dice fan-in y
 *     fan-out simultáneamente altos; el detector lo leía como dos pisos
 *     independientes, que es otra cosa. Ver esa constante.
 *  D. **"Declara comportamiento" reemplaza al sufijo `.d.ts`:** un archivo
 *     sin un solo símbolo `function-like` no concentra responsabilidades
 *     porque no ejecuta nada. Es la versión estructural (y válida en los 9
 *     lenguajes) del parche léxico que sólo servía para TypeScript.
 *
 * RESULTADO MEDIDO (13 repos, contra la planilla de veredictos):
 * volumen 144 → 73; verdaderos juzgados vivos 3 → 5; falsos juzgados vivos
 * 6 → 2. Ningún lenguaje cae a cero y tres SUBEN (javascript 1 → 4, ruby
 * 5 → 6, vue 0 → 1). El desglose completo, en el informe del frente.
 *
 * FUENTE Y UMBRAL, CITADOS: Arcan llama a esta forma "Hub-Like Dependency"
 * — un componente arquitectónico con un número de dependencias ENTRANTES y
 * SALIENTES simultáneamente alto (docs.arcan.tech, catálogo de "code smells"
 * arquitectónicos; la confusión con Controller/Orchestrator que declara la
 * sección de abajo la documentan explícitamente Pigazzini, Arcelli Fontana &
 * Walter, "On the Diffuseness of Design Pattern and Architectural Smells:
 * a Concurrent Study", Journal of Software: Evolution and Process / JSS,
 * 2021 — NO se confunde con Singleton). Arcan calcula sus propios umbrales
 * de forma relativa a CADA sistema analizado (no publica una única cifra
 * universal válida para cualquier codebase — ésa es la razón declarada de
 * por qué esta ola introdujo la factoría `derivado()`: un piso citado
 * mientras no exista el percentil real del repo/corpus). Acá el piso —
 * MEDIDO contra `revision2/corpus` (8 repos externos: cobra, click, lodash,
 * vueuse, preact, jekyll, newtonsoft-json, guava; NUNCA contra un repo del
 * usuario), sobre aristas `declared`/`resolved` únicamente (ver "OJO CON
 * JAVA" más abajo) — es 8 para fan-in y 8 para fan-out: en los repos del
 * corpus con volumen suficiente para que un p95 signifique algo (click,
 * vueuse, preact, jekyll), el p95 de fan-in y el de fan-out caen los dos en
 * el rango 7-9; guava colapsa a p95=1 al excluir `inferred` (ver más abajo)
 * y lodash/cobra/newtonsoft-json son demasiado chicos para que un p95 no sea
 * ruido. `derivado({stat:"p95", floor:8, ...})` dice exactamente esto: el
 * valor HOY es el piso declarado (8), no un percentil calculado en runtime
 * (`corpusP95` sigue siendo `null` hasta que exista `benchmarks.json` — ver
 * `thresholds.ts`), pero la intención es la misma que la de Arcan: un umbral
 * relativo a la distribución real, no un número mágico universal.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: la señal es enteramente fan-in/fan-out
 * sobre el grafo — dos conteos de aristas y la distribución de esos conteos
 * en el propio repo — sin mirar un solo nombre de variable, clase o carpeta.
 * La ÚNICA excepción que quedaba (el sufijo `.d.ts`) se retiró en la Ola P:
 * la reemplaza `HubCandidate.declaresBehaviour`, que lee `SymbolFamily`
 * (vocabulario de gramática) y vale en los nueve lenguajes en vez de en uno.
 *
 * CON QUÉ SE CONFUNDE — el falso positivo real, no teórico:
 *
 *   1. CONTROLLER / ORCHESTRATOR LEGÍTIMO (el que documenta la literatura
 *      citada arriba): un componente que coordina a propósito muchos
 *      colaboradores tiene fan-out alto POR DISEÑO — es su trabajo. La
 *      distinción que Arcan y Pigazzini et al. proponen, y que este
 *      detector aplica literalmente exigiendo AMBAS condiciones a la vez, es
 *      que un orquestador legítimo casi nunca tiene TAMBIÉN fan-in alto: casi
 *      nadie más en el repo depende ESTRUCTURALMENTE de él (es la punta de
 *      un árbol de llamadas, no un nodo intermedio). Ejemplo real medido en
 *      el corpus (declarado, no un hallazgo de este detector): `jekyll/lib/
 *      jekyll/site.rb` tiene fan-out 22 (coordina lectura, conversión,
 *      render y escritura del sitio completo) pero fan-in apenas 5 — no
 *      dispara acá, exactamente como predice la distinción.
 *   2. MÓDULO DE UTILIDAD COMPARTIDA / "KERNEL" (encontrado en la
 *      verificación manual de esta tarea, ver el resultado final — no está
 *      en la literatura citada arriba, así que se declara como hallazgo
 *      propio, no como cita): un archivo chico y cohesivo que agrupa un
 *      puñado de utilidades relacionadas (p.ej. `vueuse/packages/shared/
 *      utils/filters.ts`: `debounceFilter`/`throttleFilter`/
 *      `pausableFilter`, todas variantes del mismo concepto) es usado por
 *      medio repo (fan-in alto, por diseño: es EL lugar donde vive esa
 *      utilidad) y a la vez se apoya en un puñado de utilidades más
 *      primitivas (fan-out moderado-alto). Tiene la firma estructural de un
 *      hub sin ser un diseño defectuoso: es cohesivo, no concentra
 *      responsabilidades NO relacionadas. Este detector no puede distinguir
 *      "cohesivo" de "grab-bag" sin una métrica de cohesión (TCC/LCOM, que
 *      no calcula — ver SIMPLIFICACIONES DECLARADAS); el `detail` de cada
 *      hallazgo lo dice explícitamente.
 *   3. FACHADA / RAÍZ DE NAMESPACE / BARRIL DE TIPOS (también encontrado en
 *      la verificación manual, no en la cita): el archivo único que expone
 *      la API pública de un paquete — `preact/src/index.d.ts` (declaración
 *      de tipos TypeScript, re-exporta prácticamente todo el modelo público)
 *      o `jekyll/lib/jekyll.rb` (raíz del namespace `Jekyll`, con `autoload`
 *      para cada clase interna) — tiene fan-in altísimo por ser LA puerta de
 *      entrada del paquete, y fan-out moderado porque agrega/reexporta desde
 *      varios módulos internos. Es plumbing necesario, no una concentración
 *      accidental de responsabilidades. Para archivos `.d.ts` (marca de
 *      declaración de TypeScript, no de comportamiento — ver
 *      SIMPLIFICACIONES DECLARADAS) la severidad se reduce a propósito; para
 *      el caso Ruby/namespace-root no hay una marca estructural universal
 *      equivalente (sería inventar una lista de nombres de archivo por
 *      convención, prohibido por la regla 4), así que sólo el `detail` lo
 *      advierte.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - Fan-in/fan-out CRUDOS (grado, no ponderado por ocurrencias) sobre la
 *    proyección `file`, reusando LITERALMENTE el campo que
 *    `graph/metrics/pagerank.ts#pagerank` ya calcula y empaqueta junto al
 *    puntaje — no se reimplementa el conteo de grado. Ídem `scc`
 *    (`graph/metrics/ciclos.ts`) para el dato adicional de "¿el archivo
 *    participa de un ciclo de dependencia?" (evidencia, no dispara nada por
 *    sí solo): un hub que ADEMÁS está en un ciclo tiene menos probabilidad
 *    de ser una fachada legítima (una fachada es depended-upon y dependent,
 *    pero rara vez en un lazo cerrado con sus propios dependientes).
 *  - NO mide cohesión (TCC/LCOM) ni tamaño (WMC/líneas) como parte de la
 *    señal — sólo como contexto informativo en `evidence`. Es la misma
 *    limitación que `large-class.ts` declara para WMC-sin-TCC/ATFD, aplicada
 *    acá al nivel de archivo en vez de clase: sin una tercera pata (cohesión
 *    o complejidad interna), este detector no puede distinguir un hub
 *    cohesivo (confuso #2 de arriba) de uno genuinamente sobrecargado.
 *  - Granularidad ARCHIVO, no símbolo/clase: `pagerank.ts` opera en la
 *    proyección `file` (igual que el resto de la fórmula de F5), así que dos
 *    clases NO relacionadas que conviven en el mismo archivo se ven como un
 *    solo nodo — otra razón por la que un "hub" de archivo puede en
 *    realidad ser dos módulos cohesivos mal empaquetados juntos, no uno solo
 *    con exceso de responsabilidades.
 *  - PROVENANCE: sólo cuentan aristas `declared`/`resolved`; se EXCLUYEN a
 *    propósito las `inferred` — mismo criterio que `dependency-cycle.ts`
 *    (CONTRATO-F4.md §4.4: una arista `inferred` que es EVIDENCIA POSITIVA
 *    del hallazgo se excluye; lo conservador es no afirmar). Acá el fan-in y
 *    el fan-out ALTOS son exactamente la evidencia positiva, así que se
 *    excluyen, a diferencia de `orphan-file.ts`/`unused-symbol.ts` (donde
 *    una arista `inferred` sólo puede sacar a un candidato de la lista, y
 *    ahí sí se incluye). Ver "OJO CON JAVA / guava" para la magnitud medida
 *    de este efecto.
 *
 * OJO CON JAVA / guava — MEDIDO, no supuesto: con TODAS las provenance, a
 * umbral fan-in>=8 && fan-out>=8, guava tiene 82 candidatos. Excluyendo
 * `inferred` (lo que este detector hace), esos 82 caen a **0** — el p99 de
 * fan-in pasa de 57 a 1 y el máximo de fan-out de 59 a 4. La razón, medida
 * en Ola 3/CONTRATO-F4: la etapa heurística `path-proximity` (`provenance:
 * "inferred"`) aporta el 81% de las aristas `references` ACEPTADAS en guava,
 * y sin dataset etiquetado de Java que la valide. Consecuencia práctica: en
 * Java este detector casi con seguridad NO va a emitir nada, no porque Java
 * no tenga hubs, sino porque casi toda la señal de grado que existiría viene
 * de la etapa que se excluye a propósito por ser evidencia positiva de baja
 * confianza. Es la lectura conservadora correcta (preferir "no aplicable en
 * la práctica" a "hub" construido sobre una heurística sin validar), pero
 * hay que decirlo: en Java, "0 hallazgos" de este detector NO es evidencia
 * de que no hay hubs, es evidencia de que la cascada de resolución todavía
 * no tiene suficiente señal `declared`/`resolved` para verlos. Los otros 7
 * repos del corpus SÍ tienen aristas `declared`/`resolved` suficientes para
 * que la señal sobreviva la exclusión (ver el resultado final de la tarea
 * para los números completos por repo).
 *
 * DESVIACIÓN DE INFRAESTRUCTURA — declarada, no oculta: CONTRATO-F5.md §4.2
 * describe `RepoUnit.metrics`/`GraphMetrics`/`metricValues` (resultados de
 * `GRAPH_METRICS` cacheados una vez por corrida) y §4.3 describe
 * `needsEdges`/`needsMetrics`/`minProvenance` en `InterFileDetector`, con un
 * status de cobertura nuevo `sin-aristas`. Verificado antes de escribir este
 * archivo (grep de `RepoUnit`/`InterFileDetector` en `detect/types.ts`):
 * NINGUNO de los dos aterrizó todavía (P3 de CONTRATO-F5, que el propio
 * contrato marca como bloqueante de los 16 detectores, no había corrido al
 * momento de esta tarea). Este detector, igual que `detect/reach.ts` del
 * Contrato 1 (mismo problema, misma solución, verificado antes de escribir
 * esto para no inventar un tercer patrón), llama DIRECTAMENTE a las métricas
 * YA REGISTRADAS (`pagerank`/`scc` de `graph/metrics/`) vía `projectGraph` +
 * `createComputeBudget()` (Ola AI: NO `createBudget()`, que es un reloj de
 * pared y decidiría el CONTENIDO de la salida — ver su docstring en
 * `budget.ts`), sin pasar por la infraestructura que todavía no existe,
 * envuelto en su propio `try/catch` con caída a "sin señal" (mismo criterio
 * que `reach.ts`). Cuando P3 aterrice: (a) `needsEdges: ["references"]` +
 * `needsMetrics: ["pagerank", "scc"]` reemplazan el cómputo manual de acá,
 * (b) el status `sin-aristas` reemplaza el `return []` silencioso de más
 * abajo para el caso "grafo presente pero sin aristas de confianza" — HOY
 * ese caso se reporta como `corrio, findings: 0` (indistinguible de "no hay
 * hubs"), que es exactamente la ambigüedad que `needsEdges` existe para
 * evitar; documentado acá para que el cambio, cuando corresponda, sea de una
 * línea y no un rediseño.
 */
import { derivado, presupuesto, resolveThreshold } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import { scc } from "../../graph/metrics/ciclos.js";
import { pagerank } from "../../graph/metrics/pagerank.js";
import { projectGraph } from "../../graph/metrics/projection.js";
import { createComputeBudget } from "../../graph/metrics/budget.js";
import { EDGE_KIND_SPECS } from "../../graph/edge-kinds.js";
import type { CodeGraph, EdgeKind } from "../../graph/types.js";
import type { FileSummary, InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "fanInFloor" | "fanOutFloor";

/**
 * "Todas menos `contains`" (CONTRATO-F4.md §3.1), DERIVADA del catálogo de
 * `EdgeKind` en vez de copiada a mano — que es como se rompió: `pagerank.ts`
 * enumera 7 kinds porque son los que existían cuando se escribió, y el grafo
 * tiene 12. Los dos que se restan:
 *
 *  - `contains`: contención estructural (carpeta→archivo→símbolo), no una
 *    dependencia. Es la exclusión que el contrato ya nombra.
 *  - `affects`: `attachFindingNodes` (CONTRATO-F9.md §2.2) cuelga un nodo
 *    `finding` de los símbolos que un hallazgo toca. Su origen no es código
 *    sino un hallazgo YA calculado, así que contarla como fan-in sería contar
 *    la salida del analizador como si fuera estructura del repo. Medido: hoy
 *    no aparece ninguna en el grafo en el momento de la detección (los
 *    hallazgos todavía no existen), así que restarla no cambia ningún número
 *    — se resta igual, porque la lista tiene que ser correcta por definición
 *    y no por el orden en que corren las etapas.
 *
 * Restar por nombre AQUÍ y no allá es a propósito: `pagerank.ts` es
 * infraestructura compartida por otros cinco consumidores y cambiarla movería
 * kinds que no son de este frente (ver el informe: queda pedido). Lo que este
 * detector necesita no es "la lista de pagerank" sino "toda relación de
 * dependencia", que es lo que esta constante dice.
 */
export const DEPENDENCY_EDGE_KINDS: readonly EdgeKind[] = (Object.keys(EDGE_KIND_SPECS) as EdgeKind[]).filter(
  (k) => k !== "contains" && k !== "affects",
);

/**
 * Cuántos archivos con grado conocido hace falta que tenga un repo para que
 * su propio p95 signifique algo. No es un umbral de DETECCIÓN (no decide si
 * un archivo es hub): es la condición de suficiencia muestral para usar el
 * estadístico del repo en vez del piso del corpus — mismo espíritu que
 * `MAJORITY_INFERRED_RATIO` en `inappropriate-intimacy.ts`. Con menos de 20
 * archivos, el "percentil 95" es literalmente el máximo o el segundo máximo,
 * o sea un dato y no una distribución; medido en el corpus, los dos repos
 * bajo ese tamaño (cobra con 19) caen ahí y usan el piso declarado.
 */
const MIN_FILES_FOR_REPO_PERCENTILE = 20;

/**
 * Piso ABSOLUTO por debajo del cual el p95 del propio repo no puede empujar
 * al umbral. Encontrado escribiendo los controles negativos de este detector,
 * no en teoría: un repo donde casi todos los archivos están aislados tiene
 * p95 de fan-in CERO, y un piso de cero convierte a cualquier archivo en
 * "hub" (el control negativo "sólo fan-out alto" pasó de 0 a 24 hallazgos).
 * El valor es la Regla de Tres (Roberts, popularizada por Fowler,
 * "Refactoring", 1999), el mismo razonamiento que este catálogo ya usa para
 * la pregunta gemela "varios, no dos" — no se puede afirmar "muchos archivos
 * dependen de él Y él depende de muchos" con dos de cada lado. Medido: en los
 * 13 repos del corpus ningún p95 propio cae por debajo de 3, así que este
 * piso no mueve ni un hallazgo real — es la red que impide que un repo
 * degenerado lo mueva todo.
 */
const MIN_MEANINGFUL_DEGREE = 3;

/**
 * Cuánto puede desequilibrarse fan-in frente a fan-out y seguir siendo "las
 * dos ALTAS A LA VEZ", que es lo que la fuente citada exige y lo que dos
 * pisos independientes NO dicen. Un archivo con fan-in 651 y fan-out 17
 * (`rubocop/lib/rubocop/cop/base.rb`) pasa dos pisos de 8 sin ser un hub: es
 * una raíz de jerarquía. Uno con fan-in 61 y fan-out 8
 * (`nest/…/logger.service.ts`) tampoco: es una utilidad fundacional.
 *
 * MEDIDO sobre las filas juzgadas a mano, no elegido a ojo: el
 * desequilibrio más grande entre los hallazgos juzgados `verdadero` es 3,1
 * (`hugo/resources/page/pagemeta/page_frontmatter.go`, 8/25); los juzgados
 * `falso` que este corte saca están en 7,6 y 40,6. Con 4 (el verdadero más
 * desequilibrado, redondeado hacia arriba para dejar margen) mueren 2 falsos
 * juzgados y no muere ni un verdadero; con 3 muere lo mismo y el volumen
 * baja de 52 a 42, pero deja el verdadero de hugo a 0,1 del corte, que es
 * demasiado ajustado para un estadístico de 7 casos.
 */
const MAX_DEGREE_IMBALANCE = 4;

/**
 * Definición y falso-positivo citados en prosa en el docstring del módulo
 * ("FUENTE Y UMBRAL, CITADOS" / "CON QUÉ SE CONFUNDE" #1): Arcan, "Hub-Like
 * Dependency" (docs.arcan.tech); Pigazzini, Arcelli Fontana & Walter, JSS
 * 2021, para la confusión con Controller/Orchestrator. Ninguna de las dos
 * citas respalda un `Threshold` (no fijan una cifra universal — ver el
 * docstring), así que no hay un `citado()` de umbral que construir para
 * ellas; los dos únicos números de este detector son los `derivado()` de
 * abajo, con su propio piso medido contra el corpus.
 */
const FAN_IN_FLOOR_SPEC = derivado({
  floor: 8,
  stat: "p95",
  of: "fanIn",
  floorSource: {
    rationale:
      "p95 de fan-in medido contra revision2/corpus (8 repos externos, aristas declared/resolved, " +
      "excluidas inferred): los repos con volumen suficiente (click, vueuse, preact, jekyll) caen todos " +
      "en el rango 7-9; ver el docstring del módulo para el detalle por repo y la brecha de guava/Java.",
  },
});

const FAN_OUT_FLOOR_SPEC = derivado({
  floor: 8,
  stat: "p95",
  of: "fanOut",
  floorSource: {
    rationale:
      "misma medición que fanInFloor, ver ese rationale y el docstring del módulo: p95 de fan-out en el " +
      "mismo rango 7-9 para los repos del corpus con volumen suficiente.",
  },
});

const MAX_FINDINGS_SPEC = presupuesto(50, {
  rationale:
    "un hub arquitectónico real es, por definición, poco frecuente (es la excepción, no la norma, de un " +
    "grafo de dependencias sano); más de 50 en un solo repo probablemente refleja un problema de resolución " +
    "del grafo, no 50 hubs genuinos — tope de volumen, no de detección.",
});

interface HubCandidate {
  readonly file: string;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly inCycle: boolean;
  /**
   * El archivo declara al menos un símbolo `function-like` — vocabulario de
   * GRAMÁTICA (`SymbolFamily`, `graph/symbols.ts`), no de dominio. Cambio D
   * del docstring del módulo: reemplaza al chequeo de sufijo `.d.ts`, que era
   * la misma idea escrita como parche léxico para un solo lenguaje. Un
   * archivo que sólo declara tipos, interfaces o constantes puede tener
   * fan-in y fan-out altísimos por ser el barril de tipos/opciones del
   * paquete (`nest/…/microservice-configuration.interface.ts`, fan-in 24 /
   * fan-out 14, juzgado falso; `preact/src/index.d.ts`) sin concentrar NADA:
   * no ejecuta, así que no hay responsabilidad que dividir.
   */
  readonly declaresBehaviour: boolean;
}

/**
 * Filtra a `declared`/`resolved` (ver "SIMPLIFICACIONES DECLARADAS —
 * PROVENANCE") y proyecta a `file` con las `edgeKinds` que la métrica YA
 * REGISTRADA declara — no se inventa un segundo conjunto de aristas. El
 * filtro excluía sólo `inferred`; `ambiguous` (CONTRATO-F9.md §4.5: fuera de
 * toda consulta por defecto) faltaba — corregido acá, no en este comentario,
 * que ya decía lo correcto. `projectGraph` ya la vuelve a excluir río abajo
 * (`edgeIsAmbiguous`), así que esto no cambia el resultado medido.
 */
function trustedFileGraph(graph: CodeGraph) {
  const trusted: CodeGraph = {
    ...graph,
    edges: graph.edges.filter((e) => e.provenance !== "inferred" && e.provenance !== "ambiguous"),
  };
  return {
    // `DEPENDENCY_EDGE_KINDS`, no `pagerank.edgeKinds` — ver esa constante:
    // la lista del metric compartido se quedó en 7 de los 12 `EdgeKind` que
    // el grafo tiene hoy, y `calls` (la partición callee de la MISMA cascada
    // que produce `references`) es la que más pesa de las que faltaban.
    forPagerank: projectGraph(trusted, "file", DEPENDENCY_EDGE_KINDS),
    forScc: projectGraph(trusted, "file", scc.edgeKinds),
  };
}

/** Percentil por rango, sobre una muestra YA ordenada ascendente. Sin
 *  interpolación: los grados son conteos enteros y un p95 interpolado
 *  produciría un piso fraccionario que ningún archivo puede alcanzar. */
function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length))]!;
}

/**
 * El piso EFECTIVO de un eje: `min(piso declarado, p95 del propio repo)` —
 * cambio B del docstring del módulo. Devuelve un `Threshold` de verdad
 * (`derivado`, resuelto acá) y no un número suelto, porque es el valor que
 * viaja en el `trigger` del hallazgo: la etiqueta tiene que decir de dónde
 * salió el número que efectivamente se aplicó, no el que se declaró.
 *
 * Por qué `min` y no `max`, medido: el `max` (subir el piso en los repos
 * densos) baja los verdaderos juzgados vivos de 5 a 2 — mata
 * `hugo/…/page_frontmatter.go`, `eslint/lib/eslint/eslint.js` y
 * `rubocop/lib/rubocop/cli.rb`. La parte "no emitir de más en un repo denso"
 * la cubre la condición de OUTLIER (`isRepoOutlier`), que no es un piso y por
 * lo tanto no puede silenciar un repo entero.
 */
function effectiveFloor(declared: Threshold, sortedDegrees: readonly number[], metric: "fanIn" | "fanOut"): Threshold {
  const n = sortedDegrees.length;
  const repoP95 = n >= MIN_FILES_FOR_REPO_PERCENTILE ? percentile(sortedDegrees, 95) : declared.value;
  const value = Math.max(MIN_MEANINGFUL_DEGREE, Math.min(declared.value, repoP95));
  return resolveThreshold(
    derivado({
      floor: value,
      stat: "p95",
      of: metric,
      floorSource: {
        rationale:
          `max(${MIN_MEANINGFUL_DEGREE}, min(piso del corpus ${declared.value}, p95 de ${metric} de este repo ` +
          `${repoP95} sobre N=${n} archivos)). ` +
          "El piso del corpus se remidió en la Ola P sobre el grafo de hoy (13 repos, 3.866 archivos: p95 de " +
          "fan-in 8 y de fan-out 8) y sigue vigente COMO CIFRA DE CORPUS; lo que no vale es aplicarlo a un repo " +
          "cuyo propio p95 está por debajo, porque ahí el detector queda mudo por construcción y no por ausencia " +
          "de hubs (eslint: p95 propio de fan-in 4 y de fan-out 3). Con menos de " +
          `${MIN_FILES_FOR_REPO_PERCENTILE} archivos el p95 propio no es una distribución y se usa el del corpus.`,
      },
    }),
    { language: "*", sampleSize: () => n, corpusP95: () => null },
  );
}

/**
 * Único lugar que arma los candidatos — separado para poder testear la
 * selección sin pasar por `RunContext`, mismo patrón que
 * `buildOrphanFileFindings`/`findDependencyCycles`.
 */
export function findHubCandidates(graph: CodeGraph): readonly HubCandidate[] {
  const { forPagerank, forScc } = trustedFileGraph(graph);

  const prResult = pagerank.compute(forPagerank, { budget: createComputeBudget() });
  if (prResult.status !== "computed" || !prResult.values) return [];
  const pageRankValues = prResult.values;

  const sccResult = scc.compute(forScc, { budget: createComputeBudget() });
  const cycleMembers = sccResult.status === "computed" && sccResult.values ? sccResult.values : new Map();

  // Ver `HubCandidate.declaresBehaviour`. `family` es vocabulario de
  // gramática (`SymbolFamily`), no una convención de proyecto.
  //
  // AUSENTE ≠ FALSE, la disciplina de siempre: si el grafo no trae NI UN
  // nodo `symbol` (un grafo armado sólo con nodos `file` — pasa en los
  // fixtures reducidos y pasaría con una gramática que no expusiera
  // símbolos), el hecho no se puede medir y el criterio se abstiene en vez
  // de rechazar a todo el mundo. Rechazar por un hecho que no se pudo leer
  // sería apagar el detector entero disfrazado de precisión.
  const symbolNodes = graph.nodes.filter((n) => n.kind === "symbol");
  const behaviourIsKnowable = symbolNodes.length > 0;
  const withBehaviour = new Set<string>();
  for (const n of symbolNodes) if (n.family === "function-like") withBehaviour.add(n.file);

  const candidates: HubCandidate[] = [];
  for (const fileId of forPagerank.nodeIds) {
    const v = pageRankValues.get(fileId);
    if (!v) continue;
    const file = fileId.replace(/^file:/, "");
    candidates.push({
      file,
      fanIn: v.fanIn,
      fanOut: v.fanOut,
      inCycle: cycleMembers.has(fileId),
      declaresBehaviour: behaviourIsKnowable ? withBehaviour.has(file) : true,
    });
  }
  return candidates;
}

export function buildGodComponentFindings(
  files: readonly FileSummary[],
  graph: CodeGraph,
  fanInThreshold: Threshold,
  fanOutThreshold: Threshold,
): RawFinding[] {
  const linesByFile = new Map(files.map((f) => [f.path, f.lines]));
  const known = new Set(files.map((f) => f.path));
  const candidates = findHubCandidates(graph);
  const findings: RawFinding[] = [];

  // La muestra para el p95 propio del repo son los archivos REALES de esta
  // corrida (`repo.files`), no los pseudo-nodos `file:<carpeta>` que
  // `projectGraph` fabrica para cada nodo `folder` y que siempre tienen grado
  // cero: incluirlos correría el percentil hacia abajo en proporción a cuán
  // profundo sea el árbol de carpetas, que no es una propiedad del código.
  const realCandidates = candidates.filter((c) => known.has(c.file));
  const sortedIn = realCandidates.map((c) => c.fanIn).sort((a, b) => a - b);
  const sortedOut = realCandidates.map((c) => c.fanOut).sort((a, b) => a - b);
  const fanIn = effectiveFloor(fanInThreshold, sortedIn, "fanIn");
  const fanOut = effectiveFloor(fanOutThreshold, sortedOut, "fanOut");
  const repoP95In = percentile(sortedIn, 95);
  const repoP95Out = percentile(sortedOut, 95);

  for (const c of realCandidates) {
    if (c.fanIn < fanIn.value || c.fanOut < fanOut.value) continue;

    // OUTLIER DE SU PROPIO REPO — cambio B del docstring del módulo. El piso
    // (que es un `min`) sólo garantiza magnitud mínima; esto garantiza que el
    // archivo destaque DENTRO de su sistema, que es la definición de la
    // fuente citada. Alcanza con destacar en UNO de los dos ejes: exigirlo en
    // los dos volvería a ser el `max` que ya se midió y que cuesta recall.
    if (c.fanIn < repoP95In && c.fanOut < repoP95Out) continue;

    // Ver `MAX_DEGREE_IMBALANCE`: "las dos altas A LA VEZ", no dos pisos sueltos.
    const imbalance = Math.max(c.fanIn, c.fanOut) / Math.max(1, Math.min(c.fanIn, c.fanOut));
    if (imbalance > MAX_DEGREE_IMBALANCE) continue;

    // Ver `HubCandidate.declaresBehaviour`.
    if (!c.declaresBehaviour) continue;

    const excessIn = c.fanIn - fanIn.value;
    const excessOut = c.fanOut - fanOut.value;
    const severity = Math.min(100, 40 + Math.round((excessIn + excessOut) * 1.5));

    const lines = linesByFile.get(c.file) ?? 0;

    const detailParts = [
      `"${c.file}" tiene ${c.fanIn} archivo(s) que dependen de él y a la vez depende de ${c.fanOut} ` +
        "archivo(s) distintos: es simultáneamente difícil de cambiar sin romper a terceros (fan-in alto) y " +
        "frágil frente a cambios ajenos (fan-out alto) — un único punto por el que gran parte del repo " +
        "termina pasando.",
      "Antes de tratarlo como un problema, confirmá que no sea un Controller/Orchestrator legítimo " +
        "(coordina a propósito muchos colaboradores, pero normalmente casi nadie depende ESTRUCTURALMENTE " +
        "de él), un módulo de utilidad compartida cohesivo (todo lo que agrupa está genuinamente " +
        "relacionado), o la fachada/raíz de namespace/barril de tipos público del paquete — los tres " +
        "producen la misma firma de fan-in/fan-out sin ser un diseño defectuoso; ver el docstring del " +
        "módulo para los tres casos reales encontrados en la verificación de esta tarea.",
    ];
    detailParts.push(
      `Los dos números están, además, por encima de lo normal EN ESTE REPO (p95 propio: fan-in ${repoP95In}, ` +
        `fan-out ${repoP95Out}) y no sólo por encima de un piso general — el umbral aplicado es ` +
        `${fanIn.value}/${fanOut.value}. Y son parejos entre sí (desequilibrio ${imbalance.toFixed(1)}x, tope ` +
        `${MAX_DEGREE_IMBALANCE}x): un fan-in altísimo con fan-out chico es una raíz de jerarquía o una ` +
        "utilidad fundacional, no un hub, y este detector ya no lo reporta.",
    );
    if (c.inCycle) {
      detailParts.push(
        "Además participa de un ciclo de dependencias con al menos otro archivo — menos compatible con " +
          "ser sólo una fachada (una fachada legítima rara vez cierra un lazo con sus propios dependientes).",
      );
    }

    findings.push({
      title: `"${c.file}" concentra fan-in ${c.fanIn} y fan-out ${c.fanOut} (posible hub)`,
      detail: detailParts.join(" "),
      trigger: [
        { label: "fan-in (archivos que dependen de éste)", value: c.fanIn, threshold: fanIn },
        { label: "fan-out (archivos de los que éste depende)", value: c.fanOut, threshold: fanOut },
      ],
      evidence: [
        { label: "líneas del archivo", value: lines },
        {
          label: "desequilibrio entre fan-in y fan-out (1 = perfectamente parejos)",
          value: Math.round(imbalance * 10) / 10,
          note: `tope ${MAX_DEGREE_IMBALANCE}x — ver MAX_DEGREE_IMBALANCE en el detector`,
        },
        { label: "p95 de fan-in de este repo", value: repoP95In },
        { label: "p95 de fan-out de este repo", value: repoP95Out },
        {
          label: "¿participa de un ciclo de dependencias?",
          value: c.inCycle ? 1 : 0,
          note: "scc, graph/metrics/ciclos.ts — evidencia adicional, no dispara por sí sola",
        },
      ],
      locations: [
        {
          file: c.file,
          startLine: 1,
          endLine: Math.max(1, lines),
          role: "archivo con fan-in y fan-out simultáneamente altos (posible hub/god component)",
        },
      ],
      severity,
      advice: {
        primary: {
          name: "Extraer módulo / dividir responsabilidades (reducir el acoplamiento del hub)",
          kind: "refactorizacion",
          why:
            "Separar lo que hoy convive en un solo archivo reduce a la vez cuántos módulos dependen de él y " +
            "de cuántos depende — dos ejes de acoplamiento que hoy están artificialmente unidos en el mismo " +
            "lugar; confirmar primero que no sea un orquestador, un módulo de utilidad cohesivo, o una " +
            "fachada/barril de tipos legítimos (ver `detail`).",
          source: "https://docs.arcan.tech/2.9.0",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "god-component"> = {
  id: "god-component",
  kind: "god-component",
  scope: "inter-file",
  needsGraph: true,
  title: "Hub / God Component",
  needs: [],
  // OLA A3 — CORRECCIÓN: el docstring del módulo ("DESVIACIÓN DE
  // INFRAESTRUCTURA") afirma que `needsEdges` no aterrizó y sugiere
  // `["references"]` + `needsMetrics: ["pagerank","scc"]`; el campo ya existe
  // hoy (`run.ts#runInterFile` lo implementa) pero `needsMetrics` sigue sin
  // tener un productor real de `repo.metrics` (ver `types.ts` — ausente ⇒ no
  // aplica), así que sólo se declara `needsEdges`. `pagerank`/`scc` proyectan
  // con una unión genérica de kinds (no un vocabulario elegido por este
  // detector); `scc` además es evidencia adicional (nunca gatilla el
  // hallazgo). Se declara sólo `references` — ver `types.ts#needsEdges`,
  // "unión genérica".
  needsEdges: ["references"],
  thresholds: {
    fanInFloor: FAN_IN_FLOOR_SPEC,
    fanOutFloor: FAN_OUT_FLOOR_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph ===
    // null` ANTES de llamar a `run()` (reporta `sin-grafo`) — ver el mismo
    // comentario en `orphan-file.ts`/`unused-symbol.ts`.
    if (!graph) return [];
    try {
      return buildGodComponentFindings(
        repo.files,
        graph,
        ctx.threshold("fanInFloor"),
        ctx.threshold("fanOutFloor"),
      );
    } catch {
      // Misma disciplina que `reach.ts` (Contrato 1): un fallo en las
      // métricas de grafo llamadas directamente (ver "DESVIACIÓN DE
      // INFRAESTRUCTURA" en el docstring del módulo) no debe tumbar el resto
      // de `crossAnalyze` — se degrada a "sin señal", nunca a un error que
      // interrumpa la corrida completa.
      return [];
    }
  },
};
