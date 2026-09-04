/**
 * `duplication` — código duplicado entre lugares del repo (P9: migración de
 * uno de los cinco detectores que hasta hoy vivían dentro de
 * `code-analyzer.ts`, CONTRATOS.md/PLAN.md §4.1 "Duplicación (los 5 de
 * hoy) | función | Sí, ya | nada nuevo").
 *
 * Relación: fingerprinting estructural — hashea cada subárbol por FORMA
 * (tipo de nodo más el hash de cada hijo), descartando identificadores y
 * literales, así que una copia renombrada sigue matcheando (linaje Baxter
 * et al., ICPC'09). Agrupa por fingerprint; un fingerprint con ≥2 miembros
 * es un grupo de copias. Copias anidadas dentro de un grupo ya reportado
 * (uno más grande, con más nodos) no generan un segundo hallazgo — se
 * reporta la clase duplicada, no cada uno de sus métodos duplicados.
 *
 * `inter-file`, `needsGraph: false`: cruza archivos por su propio índice de
 * huellas (`fingerprint`), no por el grafo de F3 — el grafo (cuando exista)
 * podría AFINAR esta señal (distancia entre copias, ver PLAN.md §4.3), pero
 * no hace falta para detectar la duplicación misma.
 *
 * DESVIACIÓN DECLARADA (misma familia que el resto del lote P9, pero acá
 * con menos fricción): los `CloneCandidate`s ya los arma, con el mismo
 * MIN_CLONE_NODES/MIN_CLONE_LINES de siempre, el walker de
 * `code-analyzer.ts` — ese filtro de tamaño de subárbol es upstream de este
 * detector y no se toca acá. La forma de `CloneCandidate` en
 * `detect/types.ts` es estructuralmente idéntica, a propósito, a la de
 * `code-analyzer.ts` (ver el docstring de `RepoUnit` en `types.ts`), así que
 * `buildDuplicationFindings` recibe cualquiera de las dos sin adaptador.
 *
 * ÁRBOL ESPEJO (paquete ESPEJO-DUPLICACION): un repo con dos subárboles
 * fuente casi byte-idénticos (guava: `guava/src/...` vs.
 * `android/guava/src/...`) hace que cada clon REAL entre los dos árboles
 * cuente el doble — no es un falso positivo (el código sí está duplicado
 * dos veces, literalmente), pero es sobre-conteo del mismo hallazgo lógico.
 * Medido antes de este cambio (ver el resultado de la tarea): sobre un
 * recorte real de guava, 259/282 grupos (91.8%) mezclaban ambos árboles.
 * `collapseMirroredClones` (`../mirror-tree.js`) colapsa, ANTES de agrupar
 * por fingerprint, el par gemelo a UNA copia. TEXTO CORREGIDO (el anterior
 * decía "se reporta una vez, no dos" para TODO fingerprint colapsado — era
 * impreciso, RAICES.md lo mide en 62% de los casos reales de guava):
 * un fingerprint que el par gemelo comparte ÚNICAMENTE ENTRE SÍ —el caso
 * más común— queda, tras el colapso, con EXACTAMENTE 1 ocurrencia, y el
 * filtro de abajo (`group.length > threshold.value`, con `threshold.value
 * = 1`) lo descarta ENTERO: no "se reporta una vez", DESAPARECE de los dos
 * lados a la vez (confirmado por prueba directa contra este mismo
 * escenario — ver el docstring de `../mirror-tree.js` para el detalle y
 * por qué ese resultado es, de hecho, consistente con la intención del
 * módulo). Sólo un fingerprint que ADEMÁS aparece en un tercer archivo sin
 * relación con el par sobrevive con 2 ocurrencias reales y sí forma grupo
 * (ver `mirror-tree.test.ts`).
 *
 * OLA N, FRENTE A4b — TRES FORMAS QUE NO SON DUPLICACIÓN DE CONOCIMIENTO,
 * cada una medida contra `tests/golden/precision/*.verdicts.csv` y
 * documentada en detalle en `../primitivas/a4b-clone-shape.js` (compartida
 * con `distributed-duplication.ts`, que agrupa el mismo `repo.clones`):
 * densidad estructural baja (un comentario largo infla líneas sin inflar
 * nodos — `ListenableFuture.java`/guava, 1.46 nodos/línea medido, contra
 * ≥4.67 en los 19 verdaderos de span chico medidos en 8 lenguajes), familia
 * de CONTRATO (clases hermanas que implementan/extienden/satisfacen el
 * MISMO símbolo — usa el grafo, no `superclassName`, porque ese campo sólo
 * lee la cláusula `extends` y nunca `implements` — ver el docstring del
 * módulo compartido para el hueco medido en `ForwardingLock`/
 * `ForwardingCondition`), y par SIMÉTRICO (`Min`/`Max`, `emptiesFirst`/
 * `emptiesLast`: la única diferencia real es el propio nombre mencionado
 * dentro del cuerpo). `needsGraph` sigue en `false`: el fingerprinting no
 * necesita el grafo para detectar duplicación, el grafo sólo AFINA la señal
 * de contrato cuando está disponible (`repo.graph` puede ser `null` acá; el
 * filtro de contrato simplemente no dispara sin él — nunca oculta de más).
 *
 * OLA O, FRENTE N2 — CUATRO FORMAS MÁS, medidas sobre los 13 repos antes de
 * escribirlas y documentadas una por una (con su medición y con lo que se
 * midió y NO separó) en `../primitivas/n2-forma-de-clon.js`, compartido con
 * `distributed-duplication.ts` por el mismo motivo que el módulo de A4b:
 *   1. ÁRBOL ESPEJO CHICO — `refinarArbolesEspejo` cierra el agujero que
 *      `../mirror-tree.js` declara abierto en su sección "LO QUE SIGUE
 *      ABIERTO" (su piso absoluto de fingerprints no escala con el tamaño del
 *      archivo, así que un gemelo chico nunca se empareja). 116 grupos del
 *      corpus.
 *   2. LÍNEAS DE COMENTARIO QUE PAGAN EL PISO DE TAMAÑO — el piso de aguas
 *      arriba cuenta líneas CRUDAS; `minCodeLines` lo aplica a las líneas que
 *      se puede probar que llevan código.
 *   3. ARNÉS DESCUBIERTO POR NOMBRE — reusa el criterio 1 de
 *      `../primitivas/n10-no-es-producto.js` (contrato de descubrimiento por
 *      nombre + invocación sin argumentos), con la aridad PROBADA sobre el
 *      texto del clon porque `RepoUnit.functions` llega vacío a un detector
 *      `inter-file`.
 *   4. FAMILIA SIMÉTRICA DE 3 O MÁS — la generalización que
 *      `isSymmetricNamePair` declaraba como límite por falta de evidencia
 *      medida; ahora hay 24 casos en el corpus.
 *
 * OLA P, FRENTE P10 — LAS DOS COSAS QUE NO SON UN FILTRO. Este kind es el
 * único grande MAYORITARIAMENTE VERDADERO del catálogo (61 % de precisión,
 * n=36), así que bajar falsos dejó de ser el camino: de sus 75 filas juzgadas
 * vigentes, 39 son `dudoso` — ni verdaderas ni falsas: **hallazgos que no
 * supieron explicarse**. Medido leyendo las notas una por una
 * (`tests/golden/precision/*.verdicts.csv`): **38 de las 39** notas `dudoso`
 * dicen lo mismo con distintas palabras — *"no pude confirmar la segunda
 * copia"*, *"sin ver la segunda ubicación"*, *"no verifiqué las 3 copias
 * exactas"*, *"no verificado por tiempo"*. Y **las 22 notas `verdadero`
 * nombran, sin una sola excepción, los símbolos que se repiten**
 * (`register_gemfile_offense`/`register_gems_rb_offense`, `absolute_url`/
 * `relative_url`, `useGlobalFilters`/`useGlobalPipes`). O sea: lo que separa
 * "lo pude juzgar" de "no lo pude juzgar" es UN dato que el detector ya tiene
 * en la mano y tiraba.
 *
 *   1. EVIDENCIA — `detail` ahora lista TODAS las copias con archivo, rango de
 *      líneas y el símbolo que las contiene (`CloneCandidate.className`/
 *      `.functionName`, que hasta hoy sólo viajaban a `suggest()`). Va en
 *      `detail` y NO en `title` a propósito: `title` entra en la clave de
 *      contenido con la que `detect/precision/verdicts-io.ts#mergeRows`
 *      reconcilia un veredicto humano viejo con el hallazgo vivo
 *      (`code-finding-ids.ts#contentKeyForFinding` = kind+archivo+símbolo+
 *      título), así que reescribirlo dejaría huérfanos los 36 veredictos ya
 *      emitidos sobre este kind; `detail` no entra ni en esa clave ni en
 *      `stableFindingId`. Evidencia gratis, cero riesgo de recall.
 *
 *   2. AGRUPACIÓN — `groupKey` (Nivel 1 de `../grouping.ts`, el punto de
 *      extensión que ningún detector había usado en cinco olas). Sin él,
 *      `duplication` cae al Nivel 2, que agrupa por `(locations[0].file,
 *      kind)`: junta en UNA tarjeta N clases de clon que no tienen nada que
 *      ver entre sí salvo que la PRIMERA copia de cada una cae en el mismo
 *      archivo. Dos defectos en uno:
 *        · semántico — la tarjeta no es un problema, es "lo que quedó anclado
 *          acá"; su título describe a UNO de los N miembros y sus `locations`
 *          son la unión de todo. Es la forma de un `dudoso`.
 *        · metrológico — `census.ts#censusOf` cobra `memberCount` UNA VEZ POR
 *          ARCHIVO DISTINTO de la unión, y la unión de N clases de clon toca
 *          muchos más archivos que cualquiera de ellas: un grupo de 9 miembros
 *          cuya unión toca 4 archivos aporta 36 al volumen sin que exista un
 *          solo hallazgo de más. El propio docstring de `census.ts` lo declara
 *          como COTA SUPERIOR ("un archivo tocado por sólo ALGUNOS de sus
 *          miembros puede quedar sobre-contado").
 *      La clave elegida es **el conjunto de archivos que toca la clase de
 *      clon**, ordenado. Semánticamente: "estos archivos comparten código
 *      duplicado" es UN problema con UN remedio (extraer a un lugar común), lo
 *      compartan en 1 fragmento o en 12. Y metrológicamente cierra el agujero
 *      por construcción: como todos los miembros de un grupo tocan EXACTAMENTE
 *      los mismos archivos, la unión ES ese conjunto y `memberCount × archivos`
 *      pasa de cota superior a **cuenta exacta** de incidencias (archivo,
 *      miembro). Nada se deja de emitir: `Σ memberCount` es idéntico antes y
 *      después (§2.2 del Contrato 2), así que el volumen que se va es
 *      exactamente el sobre-conteo, ni un hallazgo.
 *
 * OLA Q, FRENTE F2 — EL CUARTO CRITERIO DE "NO ES PRODUCTO": SUBÁRBOL
 * AUTOCONTENIDO (`../primitivas/n10-no-es-producto.js`, criterio 3, hermano de
 * los dos que ya vivían ahí). El lever medido dos veces por caminos
 * independientes en la Ola P: 9 de los 14 falsos vigentes de este kind viven en
 * árboles de demo, banco de pruebas, muestra de integración o arnés. Con MI
 * recuento sobre las planillas de hoy son 7 de 12 (8 contando la librería de
 * arneses publicada de guava), o sea el mismo orden y la misma familia.
 *
 * La forma es "una carpeta sin NI UNA arista de código con el resto del repo",
 * no una lista de nombres de directorio — el bloque del criterio en el módulo
 * compartido tiene la medición completa, incluidas LAS DOS VARIANTES MÁS
 * AMPLIAS QUE SE PROBARON Y SE DESCARTARON por marcar paquetes de producto en
 * `newtonsoft-json`, `guava`, `hugo` y `vueuse`. Efecto medido sobre los 13
 * repos del corpus, pipeline real, antes/después con el mismo instrumento:
 * volumen 3.117 → 3.107 (ruby −2, typescript −8; las otras SEIS celdas de
 * lenguaje idénticas), 2 tarjetas menos, 1 de ellas juzgada `falso`, CERO
 * verdaderos juzgados perdidos (compuerta de recall re-corrida sobre `jekyll` y
 * `nest`: los perdidos son exactamente los mismos de antes).
 */
import { suggest } from "../../code-suggest.js";
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
import { presencia } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { CodeGraph } from "../../graph/types.js";
import type { CloneCandidate, FileSummary, InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "minCopies" | "minDensity" | "minCodeLines";

/**
 * Cuántas copias se nombran una por una en `detail` antes de resumir el resto
 * (`… y N más`). 6, no "todas": el `detail` viaja al panel y a la planilla de
 * veredictos en UNA celda, y el caso extremo medido del corpus tiene 23 copias
 * (`vueuse/packages/core/computedAsync/demo.vue`). 6 cubre entero el 97 % de
 * los grupos del corpus (medido: de las 75 filas juzgadas vigentes, 73 tienen
 * <= 5 copias) sin volver ilegible al 3 % restante, y el conteo total sigue
 * estando en el título, así que nunca se pierde la magnitud.
 */
const MAX_COPIAS_DETALLADAS = 6;

/**
 * El símbolo que CONTIENE a esta copia, tal como el walker lo vio: clase y/o
 * función. Es el dato que separa un veredicto de un `dudoso` — ver el
 * docstring de cabecera. Devuelve `""` cuando el clon no cae dentro de ningún
 * símbolo con nombre (un bloque suelto a nivel de archivo): la ausencia se
 * omite, nunca se rellena con un nombre inventado.
 */
function simboloContenedor(clone: CloneCandidate): string {
  return [clone.className, clone.functionName].filter(esNombreReal).join(".");
}

/**
 * `false` para lo que NO es un nombre de símbolo. Dos casos, y el segundo lo
 * encontré midiendo, no leyendo: además de `null`, el walker de clones de
 * `code-analyzer.ts` rellena `functionName` con un CENTINELA entre paréntesis
 * cuando la función es anónima (medido sobre preact: los cinco fragmentos de
 * `debug/src/debug.js:377-415` llegan todos con ese valor). `detect/types.ts`
 * documenta para `FunctionUnit.name` que ahí el centinela nunca aparece —
 * `CloneCandidate` no tiene esa garantía.
 *
 * La prueba es por FORMA y no contra el texto del centinela: un nombre
 * envuelto en paréntesis no es un identificador en ninguna de las nueve
 * gramáticas, así que descartar eso no puede tapar un nombre real, y no ata
 * este módulo a la redacción exacta de un placeholder de otro archivo.
 */
function esNombreReal(nombre: string | null): nombre is string {
  if (!nombre) return false;
  const limpio = nombre.trim();
  return limpio.length > 0 && !limpio.startsWith("(");
}

/** `archivo:inicio-fin (Clase.función)` — una copia, en una línea. */
function describirCopia(clone: CloneCandidate): string {
  const dentro = simboloContenedor(clone);
  const rango = `${clone.file}:${clone.startLine}-${clone.endLine}`;
  return dentro ? `${rango} (${dentro})` : rango;
}

/**
 * LA EVIDENCIA QUE FALTABA: dónde están las OTRAS copias y qué símbolo las
 * contiene. Sin esto, quien juzga ve una sola ubicación y el conteo, y no
 * puede hacer nada más que escribir "no pude confirmar la segunda copia" — que
 * es, literalmente, lo que dicen 38 de las 39 notas `dudoso` de este kind.
 */
export function describirCopias(group: readonly CloneCandidate[]): string {
  const nombradas = group.slice(0, MAX_COPIAS_DETALLADAS).map(describirCopia);
  const resto = group.length - nombradas.length;
  return resto > 0 ? `${nombradas.join(" | ")} | y ${resto} más` : nombradas.join(" | ");
}

/**
 * NIVEL 1 de `../grouping.ts` para este detector: el conjunto ORDENADO de
 * archivos que toca la clase de clon. Ver el docstring de cabecera (punto 2)
 * para el porqué semántico y el metrológico.
 *
 * Ordenado y deduplicado a propósito: dos clases de clon entre los mismos dos
 * archivos tienen que caer en el mismo grupo aunque el recorrido las haya
 * encontrado en orden distinto (mismo espíritu que la regla que salió de la
 * Ola O — un resultado no puede depender del orden del recorrido). El
 * separador es `NUL`, el único byte que ninguna ruta puede contener, así que
 * dos conjuntos distintos de archivos jamás pueden producir la misma clave
 * por concatenación.
 *
 * NUNCA devuelve `undefined`: todo hallazgo de este kind tiene al menos una
 * ubicación, así que todo hallazgo de este kind declara su causa raíz. Que
 * `grouping.ts` reciba una clave para TODOS los hallazgos del detector es lo
 * que hace que el Nivel 2 (localidad genérica `(archivo, kind)`, que es el que
 * fabricaba el sobre-conteo) no se aplique nunca más a `duplication`.
 */
export function duplicationGroupKey(f: RawFinding): string {
  return [...new Set(f.locations.map((l) => l.file))].sort().join("\u0000");
}

/** `CodeLocation` sin rol, para las `context.locations` que `suggest()` espera. */
const toPlainLocation = (clone: CloneCandidate) => ({
  file: clone.file,
  startLine: clone.startLine,
  endLine: clone.endLine,
});

/** `true` cuando `clone` cae DENTRO de un clon ya cubierto, más grande. */
function isInsideReported(clone: CloneCandidate, covered: readonly CloneCandidate[]): boolean {
  return covered.some(
    (other) =>
      other.file === clone.file &&
      other.startLine <= clone.startLine &&
      other.endLine >= clone.endLine &&
      other.nodes > clone.nodes,
  );
}

/**
 * Único lugar que arma los `RawFinding[]` de `duplication`. Agrupa por
 * fingerprint, descarta grupos por debajo del umbral y los ya cubiertos por
 * un grupo más grande, y ordena los candidatos por tamaño (estructuras más
 * grandes primero) antes de decidir cobertura — exactamente como
 * `code-analyzer.ts` hacía antes de esta migración.
 *
 * `minDensity` y `graph` — OLA N, FRENTE A4b: tres formas de "esto no es
 * duplicación de conocimiento" (densidad baja, familia de contrato, par
 * simétrico), ver el docstring de cabecera del módulo y
 * `../primitivas/a4b-clone-shape.js`. `graph` puede ser `null` (este
 * detector no exige grafo): el filtro de contrato sencillamente no
 * encuentra blanco compartido sin él.
 */
export function buildDuplicationFindings(
  clones: readonly CloneCandidate[],
  threshold: Threshold,
  minDensity: Threshold,
  graph: CodeGraph | null,
  minCodeLines: Threshold,
  archivos: readonly FileSummary[] = [],
): RawFinding[] {
  // Árbol espejo: colapsar el sobre-conteo ANTES de agrupar — ver el
  // docstring del módulo y `mirror-tree.ts`. Frente N2: `refinarArbolesEspejo`
  // agrega los gemelos que el piso ABSOLUTO de fingerprints deja escapar,
  // sólo bajo un par de raíces que el piso estricto ya confirmó varias veces.
  const collapsedClones = collapseMirroredClones(
    clones,
    refinarArbolesEspejo(clones, detectMirrorTrees(clones)),
  );

  const groups = new Map<string, CloneCandidate[]>();
  for (const clone of collapsedClones) {
    const list = groups.get(clone.fingerprint);
    if (list) list.push(clone);
    else groups.set(clone.fingerprint, [clone]);
  }

  const findings: RawFinding[] = [];
  const covered: CloneCandidate[] = [];
  // Frente A4b: quién extiende/implementa/satisface a quién, para el
  // filtro de familia de contrato — se calcula UNA vez por corrida, no por
  // grupo (mismo espíritu que `collapseMirroredClones` arriba).
  const contractTargets = computeContractTargets(graph);
  // OLA Q, FRENTE F2 — el CUARTO criterio de "no es producto": subárbol
  // autocontenido (`../primitivas/n10-no-es-producto.js`). Se calcula UNA vez
  // por corrida, igual que `contractTargets`. Sin grafo el conjunto queda
  // vacío y el filtro no dispara nunca: este detector no exige grafo y no
  // puede empezar a exigirlo por un filtro.
  const autocontenidos = subarbolesAutocontenidos(archivos, paresDeArchivoDelGrafo(graph));

  const candidates = [...groups.values()]
    // `threshold.value` es 1 (`presencia()`, R3): la pregunta es binaria —
    // ¿existe AL MENOS UNA copia además de la primera? — no una magnitud a
    // calibrar. `group.length > 1` es exactamente `group.length >= 2`.
    .filter((group) => group.length > threshold.value)
    // Estructuras más grandes primero, para reportar una clase duplicada
    // en vez de cada uno de sus métodos duplicados por separado.
    .sort((a, b) => b[0]!.nodes - a[0]!.nodes);

  for (const group of candidates) {
    if (group.every((clone) => isInsideReported(clone, covered))) continue;
    covered.push(...group);

    const first = group[0]!;
    // Frente A4b: las tres formas de "no es duplicación de conocimiento" —
    // marcadas como cubiertas (arriba) para que un clon anidado más chico
    // de la MISMA familia no resurja por separado, pero sin emitir
    // hallazgo. Ver `../primitivas/a4b-clone-shape.js` para la medición de
    // cada una.
    if (isLowDensityClone(first, minDensity)) continue;
    if (hasSharedContractTarget(group, contractTargets)) continue;
    if (isSymmetricNamePair(group)) continue;
    // Frente N2 — las tres formas nuevas, mismo trato (cubiertas arriba, sin
    // emitir): ver `../primitivas/n2-forma-de-clon.js` para la medición de
    // cada una y para las tres señales que se midieron y NO separan.
    if (tienePocoCodigo(first, minCodeLines)) continue;
    if (esArnesDeDescubrimiento(group)) continue;
    if (esFamiliaSimetricaDeNombres(group)) continue;
    // Frente F2 — el cuarto criterio de "no es producto", mismo trato que los
    // seis de arriba (cubierto, sin emitir). Se pregunta por TODAS las copias:
    // una sola copia en código cableado al repo y el hallazgo se emite igual.
    if (esSubarbolAutocontenido(group.map((c) => c.file), autocontenidos)) continue;

    const lines = first.endLine - first.startLine + 1;
    // Texto idéntico y estructura meramente idéntica llevan a consejos
    // distintos (Extract Method vs. Form Template Method).
    const identicalText = group.every((c) => c.normalized === first.normalized);

    // OLA P, P10 — el rol de cada ubicación deja de ser un número de orden a
    // secas y pasa a nombrar el símbolo que la contiene cuando existe. `role`
    // NO entra ni en `stableFindingId` (`code-finding-ids.ts` arma el ancla
    // con `file` + `symbol`, nada más) ni en la clave de contenido, así que es
    // gratis.
    //
    // DÓNDE SE VE Y DÓNDE NO, verificado en `shared/types.ts`: el
    // `CodeLocation` público NO lleva `role` (sólo `file`/`startLine`/
    // `endLine`/`symbol`), así que esto NO llega al panel. Llega a quien
    // consume `Finding.locations` puertas adentro — las hipótesis que
    // re-emiten los lugares del problema con su rol (`hypotheses/builder.ts`
    // los prefijea, `hypotheses/singleton.ts` los selecciona por rol). La
    // evidencia que sí ve una persona es la de `detail`, abajo. Poner el
    // símbolo en `RoleLocation.symbol` —que SÍ viaja al panel y a la planilla—
    // es lo que haría falta, y no se puede desde un frente suelto: `symbol`
    // entra en el ancla de `stableFindingId` Y en la clave de contenido, así
    // que dejaría huérfanos los 36 veredictos ya emitidos sobre este kind.
    const roleLocations = group.map((clone, i) => {
      const orden = i === 0 ? "primera copia" : `copia #${i + 1}`;
      const dentro = simboloContenedor(clone);
      return {
        file: clone.file,
        startLine: clone.startLine,
        endLine: clone.endLine,
        role: dentro ? `${orden} — ${dentro}` : orden,
      };
    });
    const [firstLocation, ...restLocations] = roleLocations;
    if (!firstLocation) continue;

    findings.push({
      title: `${group.length} fragmentos ${identicalText ? "idénticos" : "de igual estructura"} de ${lines} líneas`,
      // OLA P, P10 — LA EVIDENCIA QUE CONVIERTE UN `dudoso` EN UN VEREDICTO.
      // El texto fijo de siempre (dos redacciones, según `identicalText`) más
      // la lista de TODAS las copias con su archivo, su rango de líneas y el
      // símbolo que las contiene. `detail` y no `title`: ver el punto 1 del
      // docstring de cabecera (el título entra en la clave con la que se
      // reconcilian los veredictos humanos ya emitidos; `detail` no).
      detail:
        (identicalText
          ? "El mismo código repetido: cambiar el comportamiento obliga a editar cada copia y es fácil olvidar una."
          : "Misma estructura con nombres o literales distintos: comparten esqueleto y difieren en los detalles.") +
        ` Copias: ${describirCopias(group)}.`,
      trigger: [{ label: "copias", value: group.length, threshold }],
      locations: [firstLocation, ...restLocations],
      severity: Math.min(100, group.length * 12 + lines * 1.5),
      advice: suggest({
        type: "duplication",
        context: {
          locations: group.map(toPlainLocation),
          identicalText,
          containingFunctionNames: group.map((c) => c.functionName),
          enclosingClassNames: group.map((c) => c.className),
          enclosingSuperclassNames: group.map((c) => c.superclassName),
          sameEnclosingConditional: false,
        },
      }),
    });
  }
  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "duplication"> = {
  id: "duplication",
  kind: "duplication",
  scope: "inter-file",
  needsGraph: false,
  title: "Duplicación",
  needs: [],
  thresholds: {
    // R3 (auditoría de umbrales inventados): esto NO es un piso elegido a
    // mano — es binario por definición del hallazgo ("¿hay al menos una
    // copia además de la primera?"), el mismo caso que ya motivó `presencia()`
    // (ver el docstring de cabecera de `thresholds.ts`). Antes
    // `pisoDeclarado(2, …)`.
    minCopies: presencia({
      rationale: "una sola ocurrencia de un fragmento no es duplicación; a partir de la segunda copia ya lo es, por definición del hallazgo.",
    }),
    // Frente A4b — ver `../primitivas/a4b-clone-shape.js` para la medición
    // completa (hueco 1.46 → 4.67 nodos/línea).
    minDensity: MIN_DENSITY_SPEC,
    // Frente N2 — el MISMO piso de tamaño que ya se aplica aguas arriba, pero
    // sobre las líneas que llevan código; ver `../primitivas/n2-forma-de-clon.js`.
    minCodeLines: MIN_CODE_LINES_SPEC,
  },
  /**
   * OLA P, P10 — PRIMER detector del catálogo que declara Nivel 1. Ver
   * `duplicationGroupKey` y el punto 2 del docstring de cabecera: sin esto,
   * `grouping.ts` cae al Nivel 2 (`(locations[0].file, kind)`) y arma tarjetas
   * que juntan clases de clon sin relación entre sí, con el sobre-conteo de
   * volumen que eso arrastra en `census.ts`.
   *
   * Un `interruptor` de medición NO: la comparación antes/después se hizo
   * corriendo el mismo árbol con y sin esta línea y está en el informe P10 —
   * dejar un `process.env` acá envenenaría el caché de análisis para todos los
   * demás frentes (el caché no lleva variables de entorno en su clave; está
   * anotado en `GUIA-PROXIMA-OLA.md` §8).
   */
  groupKey: duplicationGroupKey,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    return buildDuplicationFindings(
      repo.clones,
      ctx.threshold("minCopies"),
      ctx.threshold("minDensity"),
      repo.graph,
      ctx.threshold("minCodeLines"),
      repo.files,
    );
  },
};
