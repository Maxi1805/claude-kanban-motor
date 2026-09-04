/**
 * `distributed-duplication` — el mismo fragmento repetido en unidades del
 * repo que NO se conocen entre sí (CONTRATO-F5.md Contrato 4, uno de los 16
 * detectores inter-archivo de esta ola).
 *
 * RELACIÓN (qué mide, sin jerga de AST): reusa el mismo índice de huellas
 * estructurales que ya arma `duplication.ts` (`repo.clones`, agrupado por
 * `fingerprint` — hash de FORMA de subárbol, no de texto, así que una copia
 * renombrada sigue matcheando, linaje Baxter et al., ICPC'09) y le agrega
 * UNA sola cosa que `duplication.ts` no mira: si los archivos que contienen
 * las copias están, o no, conectados por algún camino de aristas de código
 * — directo O indirecto — en el grafo entre archivos. Un grupo de copias
 * cuyos archivos caen en la MISMA componente conexa (existe *algún* camino,
 * sin importar el sentido) es un extract barato: quien escribió la segunda
 * copia navegaba, transitivamente, el mismo vecindario de código que la
 * primera. Un grupo cuyos archivos caen en componentes DISTINTAS — cero
 * camino, ni directo ni indirecto, entre ellos — es reinvención
 * independiente: nadie que haya escrito una copia tenía forma de saber,
 * siguiendo referencias de código, que la otra existía.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: el criterio entero es de FORMA — el
 * fingerprint de `duplication.ts` (ya estructural, no textual) y la
 * conectividad del grafo (aristas, no nombres). Cero vocabulario de dominio,
 * cero lista de palabras por lenguaje.
 *
 * CÓMO SE ACCEDE A LA CONECTIVIDAD — SIN RECOMPUTAR (y la desviación que
 * eso obliga a declarar): CONTRATO-F5.md §4.2/§4.3 promete `RepoUnit.metrics`
 * (un `GraphMetrics` cacheado, llenado una vez por corrida por
 * `graph/metrics/run.ts#computeGraphMetrics`) y dos campos nuevos en
 * `InterFileDetector` (`needsEdges`, `needsMetrics`) para que un detector
 * declare qué necesita sin tener que tocar nada compartido. **Verificado por
 * grep, al momento de escribir este archivo: CERO resultados para
 * `needsEdges`, `needsMetrics`, `trustedEdge`, `provenanceMix`,
 * `RepoUnit.metrics`, `computeGraphMetrics` en todo `src/`.** Esa pieza
 * (P3 en el reparto del contrato) todavía no aterrizó. Este detector NO
 * puede crear esa infraestructura (regla de alcance: sólo este archivo, su
 * test, sus fixtures, y una línea en `registry.ts`), así que sigue el mismo
 * criterio que ya declaró la excepción de `dependency-cycle.ts`/
 * `orphan-file.ts` para el mismo motivo ("no tenían acceso"): llama
 * DIRECTAMENTE a `connectedComponentsMetric.compute` — la métrica
 * `connected-components` YA IMPLEMENTADA y YA REGISTRADA en
 * `graph/metrics/registry.ts` (Union-Find con compresión de camino, no una
 * reimplementación propia) — con su propio `MetricBudget` vía
 * `createComputeBudget()` (Ola AI: NO `createBudget()`, que es un reloj de
 * pared — ver su docstring en `budget.ts`). El día
 * que `RepoUnit.metrics` exista, este archivo cambia UNA función interna
 * (`computeFileComponents`) para leer el mapa ya cacheado en vez de proyectar
 * y computar de nuevo; el resto de la lógica no se toca. Ningún algoritmo se
 * reimplementa acá: se llama al que ya existe.
 *
 * ASIMETRÍA DE `provenance` (Contrato 4 §4.4, aplicada a mano porque
 * `trustedEdge`/`provenanceMix` no existen todavía): una arista `inferred`
 * (heurística `path-proximity`) acá sólo puede FUSIONAR dos archivos en la
 * misma componente — es decir, sólo puede SACAR un grupo de la candidatura,
 * nunca meterlo. Igual que `orphan-file.ts`/`unused-symbol.ts` (y al revés
 * que `dependency-cycle.ts`, donde `inferred` es evidencia POSITIVA): la
 * lectura conservadora acá es CONTAR cualquier `provenance` al calcular
 * conectividad — `connectedComponentsMetric` ya lo hace así (no filtra por
 * `provenance`, ver su propio docstring) y este detector no le agrega un
 * filtro propio.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - Un hallazgo por GRUPO de fingerprint (todas sus copias), no uno por par
 *    de archivos — mismo criterio que `dependency-cycle.ts` reporta el ciclo
 *    completo. Si el grupo abarca 3 componentes distintas, se reporta una
 *    vez con las 3.
 *  - Copias anidadas dentro de un grupo ya reportado (uno más grande, con
 *    más nodos) no generan un segundo hallazgo — mismo criterio de cobertura
 *    que `duplication.ts` (clase duplicada, no cada método duplicado suyo).
 *  - Si el grafo del repo no tiene NI UNA arista de código real (todo lo que
 *    no sea `contains`), no se emite nada: sin aristas no hay forma de
 *    distinguir "estos archivos no se conocen" de "el extractor de este
 *    lenguaje todavía no emite aristas aquí" — sería inventar certeza. Esto
 *    es, a mano, el mismo criterio que el status `sin-aristas` de
 *    CONTRATO-F5.md §4.3 declara para el runner (tampoco aterrizado — mismo
 *    grep). Documentado, no escondido: un repo/lenguaje sin aristas de
 *    código reales hace que este detector devuelva `[]`, nunca hallazgos.
 *  - Si `connectedComponentsMetric.compute` no llega a `status: "computed"`
 *    (presupuesto de CPU agotado, grafo vacío tratado como proyección
 *    inválida, etc.), tampoco se emite nada — mismo espíritu que el status
 *    `sin-metricas` de CONTRATO-F5.md §4.3, aplicado a mano.
 *  - Un archivo cuyo `.path` no aparece como nodo del grafo (dato
 *    incompleto) hace descartar el GRUPO entero, no adivinar su componente.
 *
 * CON QUÉ SE CONFUNDE — EL PATRÓN LEGÍTIMO QUE PRODUCE LA MISMA FIRMA:
 * convergencia por una CONVENCIÓN EXTERNA compartida, no por reinvención.
 * Dos ejemplos concretos, con la misma consecuencia práctica: (1) código
 * generado o copiado de una PLANTILLA/generador (un stub de protobuf, un
 * bloque de licencia, un snippet estándar de arranque de CLI copiado de la
 * documentación oficial de una librería) — las dos copias derivan de la
 * MISMA fuente EXTERNA, no una de la otra; (2) boilerplate exigido por un
 * CONTRATO de framework (dos plugins independientes que implementan, cada
 * uno por su cuenta, el mismo método de ciclo de vida con el mismo cuerpo
 * trivial porque el host lo exige así). En ambos casos, la firma
 * estructural — mismo fingerprint, archivos sin ninguna arista entre sí —
 * es IDÉNTICA a la de una reinvención genuina, pero el refactor correcto es
 * distinto: el "original" compartido no vive en este repo (vive en el
 * generador, la plantilla, o la especificación externa), así que crear un
 * módulo interno común para unificarlas sólo introduce un acoplamiento
 * artificial entre dos partes que, por diseño, deben poder evolucionar sin
 * enterarse una de la otra. `detail` y `advice` lo dicen explícitamente en
 * vez de recomendar "unificar" a ciegas.
 *
 * LÍMITES POR LENGUAJE / OJO CON JAVA — MEDIDO en tareas previas de esta
 * ola: la etapa heurística `path-proximity` (`provenance: "inferred"`)
 * aporta el 81% de las aristas `references` ACEPTADAS en guava, y el
 * dataset etiquetado a mano que valida la cascada de resolución es sólo de
 * Ruby — esa etapa no está validada en Java. Como la asimetría de arriba ya
 * hace que este detector cuente CUALQUIER `provenance` como conexión (la
 * lectura conservadora, igual que `orphan-file`), el riesgo en Java NO es
 * fusionar de más (eso sólo puede OCULTAR un hallazgo real, nunca inventar
 * uno). El riesgo real es la dirección contraria: si la extracción de
 * aristas en Java todavía no resuelve una relación que SÍ existe entre dos
 * archivos (limitación de cobertura de la cascada, no de este detector),
 * este detector los ve como "componentes distintas" y reporta una
 * reinvención independiente que en realidad podría ser un extract barato —
 * un falso positivo por sub-cobertura de la resolución, no por lógica
 * propia. Por eso, cuando CUALQUIER archivo del grupo es `.java`, la
 * severidad se reduce y `detail` lo dice explícitamente — mismo mecanismo
 * que `orphan-file.ts` ya aplica (35 → 20) por el mismo motivo. Quien
 * consuma estos hallazgos con necesidad de CONFIANZA ALTA en Java debería
 * exigir además que la mayoría de las aristas de conectividad involucradas
 * sean `declared`/`resolved` — eso es exactamente lo que
 * `trustedEdge`/`minProvenance` (CONTRATO-F5.md §4.4) están pensados para
 * dar, pero no existen todavía (mismo grep); mientras tanto, la reducción de
 * severidad por lenguaje es la única mitigación disponible en este archivo.
 *
 * ÁRBOL ESPEJO (paquete ESPEJO-DUPLICACION) — MEDIDO, no supuesto: sobre un
 * recorte real de guava (dos árboles casi byte-idénticos, `guava/src/...`
 * vs. `android/guava/src/...`), este detector reportó, ANTES de este
 * cambio, hasta 92-100 grupos y el 100% de ellos mezclando ambos árboles —
 * la MISMA inflación que `duplication.ts` (que comparte el mismo índice de
 * huellas, `repo.clones`), agravada acá porque dos archivos sin ninguna
 * arista de código entre sí (el criterio central de este detector) es
 * EXACTAMENTE lo que dos copias de árbol espejo en módulos Maven/Gradle
 * separados producen siempre — cada clon repetido por el árbol espejo se
 * ve, además, como "reinvención independiente" (máxima severidad de este
 * detector), doble sobre-conteo. Mismo colapso que `duplication.ts`,
 * mismo módulo (`collapseMirroredClones`/`detectMirrorTrees`,
 * `../mirror-tree.js`), aplicado a `repo.clones` ANTES de agrupar por
 * fingerprint — ver `mirror-tree.ts` para la señal exacta.
 *
 * OLA N, FRENTE A4b — TRES FORMAS QUE NO SON DUPLICACIÓN DE CONOCIMIENTO,
 * compartidas con `duplication.ts` (agrupa el MISMO `repo.clones`) vía
 * `../primitivas/a4b-clone-shape.js`: densidad estructural baja (medido en
 * este mismo detector — `ListenableFuture.java`/guava, falso, 1.46
 * nodos/línea), familia de CONTRATO (clases hermanas que implementan/
 * extienden/satisfacen el MISMO símbolo — este detector YA exige grafo, así
 * que el filtro corre siempre, no condicionalmente) y par SIMÉTRICO. Ver el
 * docstring de ese módulo para la medición completa de cada forma.
 *
 * OLA O, FRENTE N2 — CUATRO FORMAS MÁS, en `../primitivas/n2-forma-de-clon.js`
 * (mismo módulo compartido con `duplication.ts`, mismo motivo: los dos agrupan
 * el MISMO `repo.clones`). La primera es la que más pesa ACÁ: el ÁRBOL ESPEJO
 * CHICO. Los 7 falsos juzgados de este kind son, uno por uno, "el mismo
 * archivo o el mismo andamiaje copiado bajo otra raíz" — super-source,
 * aplicaciones de ejemplo autocontenidas, fixtures de integración
 * independientes por diseño — y esa es EXACTAMENTE la señal central de este
 * detector (dos archivos sin ninguna arista entre sí), así que sin el colapso
 * de árbol espejo este detector los ve siempre como reinvención
 * independiente. `refinarArbolesEspejo` cierra el agujero que
 * `../mirror-tree.js` declara abierto: su piso ABSOLUTO de fingerprints no
 * escala con el tamaño del archivo. Las otras tres (piso de tamaño sobre
 * líneas de CÓDIGO, arnés descubierto por nombre, familia simétrica de 3+)
 * están documentadas con su medición en ese mismo módulo.
 *
 * OLA Q, FRENTE F2 — EL CUARTO CRITERIO DE "NO ES PRODUCTO": SUBÁRBOL
 * AUTOCONTENIDO (`../primitivas/n10-no-es-producto.js`, criterio 3). Acá NO es
 * un filtro más: es la familia de falsos DOMINANTE de este kind. Los 5 falsos
 * juzgados vigentes son, los cinco, muestras o bancos de pruebas
 * autocontenidos, y el motivo es estructural — la señal central de este
 * detector ("estos archivos no comparten ninguna arista") es EXACTAMENTE la
 * firma que produce un árbol de muestras independientes por diseño, así que
 * sin este criterio el detector no puede no equivocarse ahí.
 *
 * Efecto medido sobre los 13 repos, pipeline real: volumen 36 → 26 (−28 %),
 * 11 → 9 tarjetas. Por lenguaje: ruby 2 → 0, typescript 14 → 6; csharp, java y
 * javascript idénticos. **LA CELDA `ruby` QUEDA MUDA** — tenía UN hallazgo, el
 * par de cops de `jekyll`, y está juzgado `falso` (su gemelo de `duplication`
 * lo está; el de este kind no llegó a muestrearse). Queda declarado acá y en el
 * informe del frente porque `detect/language-coverage.test.ts` lo va a contar.
 * Lo que NO cubre, y está medido: los tres falsos de `guava`
 * (super-source, dos bancos de pruebas) NO caen, porque sus carpetas sí tienen
 * aristas cruzando la frontera.
 */
import { createComputeBudget } from "../../graph/metrics/budget.js";
import { connectedComponentsMetric } from "../../graph/metrics/componentes.js";
import { projectGraph } from "../../graph/metrics/projection.js";
import { collapseMirroredClones, detectMirrorTrees } from "../mirror-tree.js";
import {
  computeContractTargets,
  hasSharedContractTarget,
  isLowDensityClone,
  isSymmetricNamePair,
  MIN_DENSITY_SPEC,
} from "../primitivas/a4b-clone-shape.js";
import {
  esArnesDeDescubrimiento,
  esFamiliaSimetricaDeNombres,
  MIN_CODE_LINES_SPEC,
  refinarArbolesEspejo,
  tienePocoCodigo,
} from "../primitivas/n2-forma-de-clon.js";
import {
  esSubarbolAutocontenido,
  paresDeArchivoDelGrafo,
  subarbolesAutocontenidos,
} from "../primitivas/n10-no-es-producto.js";
import { presencia, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { CodeGraph } from "../../graph/types.js";
import type { CloneCandidate, InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "minCopies" | "minComponents" | "minDensity" | "minCodeLines";

/** R3 (auditoría de umbrales inventados): binario por definición del
 *  hallazgo, no un piso elegido a mano — mismo caso que `duplication.ts`
 *  (ver ese módulo). Antes `pisoDeclarado(2, …)`. */
const MIN_COPIES_SPEC = presencia({
  rationale: "una sola ocurrencia de un fragmento no es duplicación; a partir de la segunda copia ya lo es, por definición del hallazgo.",
});

/** R3: presencia, no magnitud — hacen falta al menos DOS componentes
 *  distintas para poder decir "no se conocen entre sí". Con una sola
 *  componente ya existe algún camino de aristas de código entre TODAS las
 *  copias del grupo, así que no hay nada que este detector agregue por
 *  encima de `duplication.ts` — ver el docstring del módulo. Antes
 *  `pisoDeclarado(2, …)`. */
const MIN_COMPONENTS_SPEC = presencia({
  rationale:
    "con una sola componente conexa ya existe algún camino de aristas (directo o indirecto) entre todas las " +
    "copias del grupo: no hay 'ausencia de arista' que reportar. Hacen falta al menos dos componentes distintas " +
    "para que el grupo tenga copias genuinamente sin conexión entre sí.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. */
const MAX_FINDINGS_SPEC = presupuesto(100, {
  rationale:
    "un panel legible no lista de forma útil más de un centenar de grupos de duplicación distribuida a la vez; " +
    "es tope de volumen, no de detección.",
});

function fileName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/** `true` cuando `clone` cae DENTRO de un grupo ya aceptado, más grande — mismo criterio que `duplication.ts#isInsideReported`, reescrito acá (privado a ese módulo, no exportado) para no acoplar dos detectores independientes. */
function isNestedInsideAcceptedGroup(clone: CloneCandidate, covered: readonly CloneCandidate[]): boolean {
  return covered.some(
    (other) =>
      other.file === clone.file &&
      other.startLine <= clone.startLine &&
      other.endLine >= clone.endLine &&
      other.nodes > clone.nodes,
  );
}

/** `true` si el grafo tiene al menos una arista de código real (todo lo que no sea `contains`) — ver "SIMPLIFICACIONES DECLARADAS". */
function hasAnyCodeEdge(graph: CodeGraph): boolean {
  const kinds = new Set<string>(connectedComponentsMetric.edgeKinds);
  return graph.edges.some((e) => kinds.has(e.kind));
}

/**
 * Componente conexa (a grano archivo) de cada archivo del grafo, llamando
 * DIRECTAMENTE a la métrica `connected-components` ya implementada y
 * registrada — ver "CÓMO SE ACCEDE A LA CONECTIVIDAD" en el docstring del
 * módulo. `null` si la métrica no llegó a `"computed"`.
 */
function computeFileComponents(graph: CodeGraph): ReadonlyMap<string, string> | null {
  const projected = projectGraph(graph, "file", connectedComponentsMetric.edgeKinds);
  const result = connectedComponentsMetric.compute(projected, { budget: createComputeBudget() });
  if (result.status !== "computed" || !result.values) return null;

  const byFile = new Map<string, string>();
  for (const [id, rep] of result.values) {
    const path = id.startsWith("file:") ? id.slice("file:".length) : id;
    byFile.set(path, rep);
  }
  return byFile;
}

function severityOf(distinctComponents: number, lines: number, identicalText: boolean, involvesJava: boolean): number {
  let score = 45 + (distinctComponents - 1) * 18 + Math.min(20, Math.floor(lines / 8));
  if (identicalText) score += 5;
  if (involvesJava) score -= 20; // ver "OJO CON JAVA": riesgo de falso positivo por sub-cobertura de la cascada
  return Math.max(20, Math.min(100, score));
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * poder testear la lógica sin pasar por `RunContext`, mismo patrón que los
 * demás detectores `inter-file`.
 *
 * `minDensity` — OLA N, FRENTE A4b: ver el docstring de cabecera del módulo
 * y `../primitivas/a4b-clone-shape.js`.
 */
export function buildDistributedDuplicationFindings(
  repo: RepoUnit,
  graph: CodeGraph,
  minCopies: Threshold,
  minComponents: Threshold,
  minDensity: Threshold,
  minCodeLines: Threshold,
): RawFinding[] {
  if (graph.nodes.length === 0 || !hasAnyCodeEdge(graph)) return [];

  const componentOf = computeFileComponents(graph);
  if (!componentOf) return [];

  const languageByFile = new Map(repo.files.map((f) => [f.path, f.language] as const));
  // Frente A4b: quién extiende/implementa/satisface a quién, para el
  // filtro de familia de contrato — este detector ya exige grafo
  // (`needsGraph: true`), así que corre siempre, sin el `null` defensivo
  // que sí necesita `duplication.ts`.
  const contractTargets = computeContractTargets(graph);
  // OLA Q, FRENTE F2 — el CUARTO criterio de "no es producto": subárbol
  // autocontenido (`../primitivas/n10-no-es-producto.js`). Acá pesa más que en
  // `duplication.ts` y por el mismo motivo por el que este detector existe: su
  // señal central —"estos archivos no comparten ninguna arista"— es EXACTAMENTE
  // lo que produce un árbol de muestras autocontenido, así que el criterio
  // ataca su familia de falsos dominante (5 de sus 6 falsos juzgados de la Ola
  // P), no un caso de borde.
  const autocontenidos = subarbolesAutocontenidos(repo.files, paresDeArchivoDelGrafo(graph));

  // Árbol espejo: colapsar el sobre-conteo ANTES de agrupar — mismo
  // mecanismo que `duplication.ts` (medido: misma inflación acá, ver el
  // docstring del módulo).
  // Frente N2: `refinarArbolesEspejo` agrega los gemelos que el piso ABSOLUTO
  // de fingerprints deja escapar — ver el docstring del módulo, punto 1.
  const collapsedClones = collapseMirroredClones(
    repo.clones,
    refinarArbolesEspejo(repo.clones, detectMirrorTrees(repo.clones)),
  );

  const groups = new Map<string, CloneCandidate[]>();
  for (const clone of collapsedClones) {
    const list = groups.get(clone.fingerprint);
    if (list) list.push(clone);
    else groups.set(clone.fingerprint, [clone]);
  }

  interface Candidate {
    group: CloneCandidate[];
    distinctFiles: string[];
    distinctComponents: Set<string>;
  }

  const candidates: Candidate[] = [];
  for (const group of groups.values()) {
    // `minCopies.value`/`minComponents.value` son 1 (`presencia()`, R3): la
    // pregunta es binaria en los dos casos, no una magnitud — `> 1` es
    // exactamente `>= 2`.
    if (group.length <= minCopies.value) continue;

    const distinctFiles = [...new Set(group.map((c) => c.file))];
    if (distinctFiles.length < 2) continue; // todo en el mismo archivo: no es "distribuida", es trabajo de `duplication.ts`

    const reps: string[] = [];
    let missing = false;
    for (const file of distinctFiles) {
      const rep = componentOf.get(file);
      if (rep === undefined) {
        missing = true;
        break;
      }
      reps.push(rep);
    }
    if (missing) continue; // dato de grafo incompleto para este grupo: no se adivina, ver docstring

    const distinctComponents = new Set(reps);
    if (distinctComponents.size <= minComponents.value) continue; // misma componente (conectados directa o indirectamente): no es el hallazgo de este detector

    candidates.push({ group, distinctFiles, distinctComponents });
  }

  // Estructuras más grandes primero, mismo criterio que `duplication.ts`.
  candidates.sort((a, b) => b.group[0]!.nodes - a.group[0]!.nodes);

  const findings: RawFinding[] = [];
  const covered: CloneCandidate[] = [];

  for (const { group, distinctFiles, distinctComponents } of candidates) {
    if (group.every((c) => isNestedInsideAcceptedGroup(c, covered))) continue;
    covered.push(...group);

    const first = group[0]!;
    // Frente A4b: las tres formas de "no es duplicación de conocimiento"
    // — ver `../primitivas/a4b-clone-shape.js`. Cubierto arriba (no
    // resurge un clon anidado más chico de la misma familia) pero sin
    // emitir hallazgo.
    if (isLowDensityClone(first, minDensity)) continue;
    if (hasSharedContractTarget(group, contractTargets)) continue;
    if (isSymmetricNamePair(group)) continue;
    // Frente N2 — mismas tres formas que `duplication.ts`, mismo módulo.
    if (tienePocoCodigo(first, minCodeLines)) continue;
    if (esArnesDeDescubrimiento(group)) continue;
    if (esFamiliaSimetricaDeNombres(group)) continue;
    // Frente F2 — mismo trato y misma pregunta que en `duplication.ts`: se
    // exige que TODAS las copias caigan en subárboles autocontenidos.
    if (esSubarbolAutocontenido(distinctFiles, autocontenidos)) continue;

    const lines = first.endLine - first.startLine + 1;
    const identicalText = group.every((c) => c.normalized === first.normalized);
    const involvesJava = distinctFiles.some((f) => languageByFile.get(f) === "java");

    const roleLocations = group.map((clone, i) => ({
      file: clone.file,
      startLine: clone.startLine,
      endLine: clone.endLine,
      role: i === 0 ? "primera copia" : `copia #${i + 1}`,
    }));
    const [firstLocation, ...restLocations] = roleLocations;
    if (!firstLocation) continue;

    findings.push({
      title:
        `${group.length} copias ${identicalText ? "idénticas" : "de igual estructura"} de ${lines} líneas, ` +
        `repartidas en ${distinctComponents.size} partes del repo sin ninguna conexión entre sí`,
      detail:
        "Estos archivos no comparten ninguna arista de código entre sí — ni directa ni a través de ningún otro " +
        "archivo intermedio: quien escribió cada copia no tenía forma de saber, siguiendo el código, que la otra " +
        "existía. Si el comportamiento correcto cambia, alguien tiene que acordarse de actualizar TODAS las " +
        "copias en TODAS estas partes desconectadas del repo — mucho más fácil de olvidar que un extract barato " +
        "entre archivos que ya se conocen. Antes de unificarlas: confirmá que no sea código convergente por una " +
        "plantilla o generador externo, o boilerplate que un framework exige repetir en cada punto de extensión " +
        "— en ese caso el origen común no vive en este repo, y crear un módulo interno compartido sólo acoplaría " +
        "artificialmente dos partes que están pensadas para evolucionar sin enterarse una de la otra." +
        (involvesJava
          ? " Severidad reducida: al menos uno de estos archivos es Java, donde la etapa heurística de " +
            "resolución (path-proximity) domina las aristas aceptadas y no está validada contra un dataset " +
            "etiquetado — la 'ausencia de conexión' acá puede deberse a que la cascada todavía no resolvió una " +
            "relación real, no a que los archivos de verdad sean independientes."
          : ""),
      trigger: [
        {
          label: "componentes de archivo sin conexión (directa ni indirecta) entre sí que comparten este fragmento",
          value: distinctComponents.size,
          threshold: minComponents,
        },
      ],
      evidence: [
        { label: "copias", value: group.length },
        { label: "archivos distintos", value: distinctFiles.length },
      ],
      locations: [firstLocation, ...restLocations],
      severity: severityOf(distinctComponents.size, lines, identicalText, involvesJava),
      advice: {
        primary: {
          name: "Confirmar independencia real antes de unificar",
          kind: "refactorizacion",
          why:
            "Dos copias sin ninguna arista de código entre sí (ni directa ni indirecta) son reinvención " +
            "independiente, no un extract barato: antes de fusionarlas en una función o módulo compartido, " +
            "confirmá que no sean código convergente por una plantilla/generador externo o un contrato de " +
            "framework — en ese caso el origen común no vive en este repo y unificarlas crea un acoplamiento " +
            "artificial entre partes genuinamente independientes.",
          source: "https://refactoring.guru/es/smells/duplicate-code",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "distributed-duplication"> = {
  id: "distributed-duplication",
  kind: "distributed-duplication",
  scope: "inter-file",
  needsGraph: true,
  title: "Duplicación distribuida",
  needs: [],
  // OLA A3: `hasAnyCodeEdge`/`computeFileComponents` usan
  // `connectedComponentsMetric.edgeKinds` — la unión genérica de 7 kinds que
  // `graph/metrics/componentes.ts` importa desde el metric compartido, no un
  // vocabulario que ESTE detector eligió kind por kind. Se declara sólo
  // `references` — ver `types.ts#needsEdges`, "unión genérica".
  needsEdges: ["references"],
  thresholds: {
    minCopies: MIN_COPIES_SPEC,
    minComponents: MIN_COMPONENTS_SPEC,
    // Frente A4b — ver `../primitivas/a4b-clone-shape.js` para la medición
    // completa (hueco 1.46 → 4.67 nodos/línea).
    minDensity: MIN_DENSITY_SPEC,
    // Frente N2 — el MISMO piso de tamaño de aguas arriba, sobre líneas de código.
    minCodeLines: MIN_CODE_LINES_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` (reporta `sin-grafo`) — este `return []` nunca
    // debería ejecutarse en producción, pero `CodeGraph | null` sigue siendo
    // el tipo declarado.
    if (!graph) return [];
    return buildDistributedDuplicationFindings(
      repo,
      graph,
      ctx.threshold("minCopies"),
      ctx.threshold("minComponents"),
      ctx.threshold("minDensity"),
      ctx.threshold("minCodeLines"),
    );
  },
};
