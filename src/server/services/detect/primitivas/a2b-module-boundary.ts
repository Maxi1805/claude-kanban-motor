/**
 * `a2b-module-boundary.ts` — Ola N, frente A2b, Raíz 3 del brief de A2 ("el
 * paquete no es una capa"). Primitiva compartida entre `layer-skip.ts` e
 * `import-depth-demeter.ts`: los dos miden "niveles de carpeta salteados"
 * (`profundidad(carpeta destino) - profundidad(ancestro común) - 1`) como
 * proxy de profundidad ARQUITECTÓNICA — y el proxy se equivoca cuando la
 * profundidad de carpeta es sólo un NAMESPACE repartido en raíces de código
 * hermanas, no una jerarquía de capas real.
 *
 * MEDIDO en `tests/golden/precision/guava.verdicts.csv` (ver el docstring de
 * `layer-skip.ts`/`import-depth-demeter.ts` para las citas completas): guava
 * publica `guava/`, `android/guava/`, `android/guava-testlib/`, `guava-gwt/`,
 * `futures/failureaccess/` como directorios de NIVEL SUPERIOR separados
 * (build multi-módulo) para el MISMO árbol lógico de paquetes Java
 * (`com.google.common.*`). El ancestro común de carpetas entre dos de esos
 * directorios suele ser la raíz del repo (`commonLen = 0`), así que
 * CUALQUIER referencia que cruce dos de esos módulos infla
 * `nivelesSalteados` por la profundidad ENTERA del paquete destino — sin
 * importar si lo referenciado es la clase más pública del proyecto
 * (`Ticker`, `ArrayListMultimap`, `ImmutableList`, referenciadas desde
 * decenas de puntos de entrada del propio proyecto) o un detalle interno
 * real.
 *
 * LA SEÑAL: un archivo referenciado desde MUCHAS raíces de carpeta de nivel
 * superior DISTINTAS (primer segmento de ruta), a través de TODO el grafo
 * —no sólo del par bajo análisis— se comporta como superficie pública de
 * facto sin importar su profundidad de carpeta. Es geometría de rutas +
 * forma del grafo (fan-in), igual que el resto de estos dos detectores:
 * ningún nombre de build system, ningún nombre de lenguaje, cero vocabulario
 * de nodo de ninguna gramática.
 *
 * POR QUÉ "PRIMER SEGMENTO" Y NO OTRA GRANULARIDAD — verificado a propósito
 * contra el confundidor GEMELO que este mecanismo NO debe tocar
 * (`tests/golden/precision/eslint.verdicts.csv`: `lib/linter/linter.js` →
 * `lib/languages/js/source-code`, juzgado VERDADERO — "el core del linter
 * reeempieza directo dentro del directorio interno del plugin de lenguaje
 * 'js', bypassa `languages/js/index.js`"). Ese hallazgo real tiene la MISMA
 * geometría de "carpetas hermanas bajo un ancestro compartido" que el caso
 * guava (por eso NO se generalizó acá el descuento existente de
 * "mismo árbol hacia abajo" a una tolerancia de profundidad — se probó y
 * rompía este caso, ver el docstring de los dos detectores, sección
 * "DESCARTADO"). La diferencia medible es el ANCHO del fan-in en la RAÍZ del
 * repo: `linter.js`/`api.js`/`rule-tester.js` viven los tres bajo el MISMO
 * primer segmento (`lib`) que `languages/js/source-code` — eslint entero
 * vive bajo un único directorio de nivel superior, así que el fan-in por
 * primer-segmento nunca pasa de 1 ahí, y este mecanismo NO se activa (correcto:
 * no debe). guava, en cambio, tiene el fan-in de una misma clase repartido
 * en 4-5 primeros-segmentos distintos, y SÍ se activa.
 */
import type { CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";

/**
 * Piso de "cuántas raíces de carpeta de nivel superior distintas alcanzan
 * el mismo archivo" para tratarlo como superficie pública de facto. MEDIDO
 * contra guava (`scripts/a2b-measure-guava-module-boundary.mts`, ver el
 * resultado de la tarea): las clases centrales confundidas en la planilla
 * (`Ticker`, `ArrayListMultimap`, `ImmutableList`, `Invokable`) llegan a 3-5
 * primeros-segmentos distintos; el ruido de vecindario normal (un archivo
 * usado sólo dentro de su propio árbol, o desde un único módulo hermano
 * puntual) se queda en 1-2. 3 es el piso mínimo que separa ambos grupos en
 * la muestra medida — no una cita de industria, declarado como tal.
 */
export const WIDE_FANIN_MIN_TOP_ANCESTORS = 3;

/** Primer segmento de una ruta de carpeta ya partida en segmentos ("a/b/c" -> "a"); "" si la ruta ya es de nivel raíz (sin carpeta). */
function topAncestorOf(folderSegments: readonly string[]): string {
  return folderSegments[0] ?? "";
}

/** Segmentos de carpeta de una ruta de archivo, sin el nombre de archivo — misma forma que `folderSegmentsOf` de los dos detectores que usan esta primitiva. */
function folderSegmentsOfPath(filePath: string): readonly string[] {
  const segments = filePath.split("/");
  segments.pop();
  return segments;
}

/**
 * Fan-in por archivo DESTINO, contado en primeros-segmentos de carpeta
 * DISTINTOS de sus llamadores — no en cantidad cruda de aristas ni de
 * archivos llamadores. O(E), una sola pasada sobre TODAS las aristas de
 * confianza del grafo completo (no sólo las del par que un detector esté
 * evaluando en un momento dado): la pregunta es "¿qué tan ampliamente se usa
 * este archivo en TODO el repo?", no "¿cuántas veces lo usa este llamador
 * puntual?".
 *
 * `isConfidentEdge` lo decide cada detector llamador con su propio criterio
 * (cada uno ya filtra `inferred`/`ambiguous`/`global-uniqueness` a su
 * manera, ver sus docstrings) — esta función no reinventa ese filtro, sólo
 * lo aplica antes de contar.
 */
export function computeTopAncestorFanIn(
  edges: Iterable<CodeGraphEdge>,
  nodeById: ReadonlyMap<string, CodeGraphNode>,
  isConfidentEdge: (edge: CodeGraphEdge) => boolean,
): ReadonlyMap<string, ReadonlySet<string>> {
  const fanIn = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!isConfidentEdge(edge)) continue;
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode || fromNode.file === toNode.file) continue;
    const fromTop = topAncestorOf(folderSegmentsOfPath(fromNode.file));
    let set = fanIn.get(toNode.file);
    if (!set) {
      set = new Set();
      fanIn.set(toNode.file, set);
    }
    set.add(fromTop);
  }
  return fanIn;
}

/** Cuántos primeros-segmentos de carpeta distintos alcanzan `toFile`, según un fan-in ya calculado por `computeTopAncestorFanIn`. 0 si `toFile` no tiene ningún llamador de confianza. */
export function topAncestorFanInCount(fanIn: ReadonlyMap<string, ReadonlySet<string>>, toFile: string): number {
  return fanIn.get(toFile)?.size ?? 0;
}

/** `true` si `count` alcanza el piso de "superficie pública de facto" — ver `WIDE_FANIN_MIN_TOP_ANCESTORS`. */
export function isWideFanIn(count: number, min: number = WIDE_FANIN_MIN_TOP_ANCESTORS): boolean {
  return count >= min;
}
