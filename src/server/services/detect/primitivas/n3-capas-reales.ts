/**
 * `n3-capas-reales.ts` — Ola O, frente N3. LA RAÍZ de `layer-skip` e
 * `import-depth-demeter`: los dos trataban **profundidad de RUTA** como si
 * fuera **profundidad ARQUITECTÓNICA**.
 *
 * EL PROBLEMA, MEDIDO. `nivelesSalteados = profundidad(carpeta destino) −
 * profundidad(ancestro común) − 1` cuenta SEGMENTOS DE RUTA. Pero un
 * segmento de ruta sólo puede ser una CAPA si algo puede pasar POR ahí: una
 * carpeta que no contiene ningún archivo analizado no tiene superficie, no
 * tiene punto de entrada, no hay nada que enrutar a través suyo. Atravesarla
 * no es "saltearse una capa": es recorrer un NAMESPACE.
 *
 * Es exactamente el caso que los veredictos ya juzgaban falso, con esa misma
 * palabra, y es el confundidor dominante del corpus:
 *
 *  - JAVA (`tests/golden/precision/guava.verdicts.csv`, 10 de 10 juzgados
 *    FALSOS, nota del integrador de la Ola M: *"en Java la profundidad de
 *    carpeta ES el paquete (namespace), no una capa"*). Verificado sobre el
 *    árbol real de guava (esta tarea, `find -maxdepth 1 -type f`):
 *    `android/guava/src` = 0 archivos, `…/src/com` = 0, `…/com/google` = 0,
 *    `…/google/common` = 0. Los cinco niveles que la fórmula vieja contaba
 *    como "capas salteadas" NO CONTIENEN UN SOLO ARCHIVO: son los segmentos
 *    del paquete `com.google.common.*`, escritos como carpetas porque el
 *    compilador de Java lo exige, no porque haya una jerarquía de capas.
 *
 *  - PYTHON: `lib/` en sqlalchemy = 0 archivos (sólo `lib/sqlalchemy/`); el
 *    primer nivel "salteado" no existe como superficie.
 *
 * MEDIDO, sobre el grafo real de 8 repos (`scratchpad/n3-dump.mts` +
 * `n3-eval2.mts`, esta tarea, un proceso por repo bajo el semáforo): de los
 * 727 pares de guava que sobreviven a todos los filtros de confianza
 * anteriores, **712 cruzan CERO carpetas pobladas** — o sea el 98 % del
 * volumen java del kind no está saltando ninguna capa. Los 15 que quedan
 * cruzan una carpeta REAL (`futures/failureaccess/src`, que sí contiene un
 * archivo: `module-info.java`), así que el mecanismo NO deja java en cero:
 * distingue, dentro del mismo repo y del mismo lenguaje, el namespace de la
 * capa. En los otros repos medidos el efecto es casi nulo, porque su
 * profundidad de carpeta SÍ es profundidad real: hugo 23 → 22, eslint 4 → 4,
 * rubocop 22 → 22, sqlalchemy 33 → 33, vueuse 1 → 1. No es un corte parejo
 * ni un umbral más duro: es una pregunta distinta.
 *
 * POR QUÉ NO ES LÉXICO: la señal es "¿este directorio contiene directamente
 * algún archivo analizado?" — se responde con la lista de archivos que el
 * analizador ya tiene (`RepoUnit.files`), sin mirar nombres de carpeta, ni
 * extensiones, ni `language`, ni convenciones (`src/`, `internal/`,
 * `__init__.py`, `index.*`). Un repo Java con capas reales
 * (`…/service/OrderService.java` referenciando
 * `…/repository/internal/jdbc/OrderDao.java`, con archivos en `repository/`)
 * sigue disparando: ver el test de este archivo y el de los dos detectores.
 */

/**
 * Piso de CAPAS REALES cruzadas para que un par sea siquiera candidato. 1,
 * porque es el mínimo que hace verdadera la afirmación del hallazgo: existe
 * al menos UNA carpeta con archivos entre la superficie del módulo y el
 * destino, o sea existe al menos un punto de entrada REAL por el que el
 * llamador podría haber pasado y no pasó. Con 0 la afirmación es
 * literalmente falsa (no hay ninguna capa entre medio: sólo namespace), y
 * emitirla es lo que producía el 98 % del volumen java medido arriba. No es
 * un umbral de MAGNITUD (esa la sigue midiendo `minSkippedLevels`, sin
 * cambios): es la condición de existencia del fenómeno.
 */
export const MIN_REAL_LAYERS = 1;

/** Segmentos de carpeta de una ruta de archivo, sin el nombre de archivo ("a/b/c.rb" -> ["a","b"]). Misma forma que `folderSegmentsOf` de los dos detectores que usan esta primitiva. */
function folderOf(filePath: string): string {
  const segments = filePath.split("/");
  segments.pop();
  return segments.join("/");
}

/**
 * El conjunto de carpetas que contienen DIRECTAMENTE al menos un archivo
 * analizado. Incluye `""` (la raíz del repo) si hay algún archivo suelto en
 * la raíz — es coherente: la raíz también es un lugar donde algo puede
 * vivir. O(F), una pasada sobre la lista de archivos que el detector ya
 * recibe.
 */
export function populatedFolders(files: readonly { readonly path: string }[]): ReadonlySet<string> {
  const set = new Set<string>();
  for (const f of files) set.add(folderOf(f.path));
  return set;
}

/**
 * Cuántas de las carpetas que este par ATRAVIESA son capas reales. El rango
 * es exactamente el mismo que cuenta `nivelesSalteados`: los niveles desde
 * el punto de divergencia (`commonLen + 1`, la "superficie" del módulo vista
 * desde el llamador) hasta el nivel inmediatamente anterior a la carpeta
 * propia del destino. La carpeta propia del destino NO cuenta: llegar hasta
 * ahí es el hallazgo, no el camino.
 *
 * Devuelve un número entre 0 y `nivelesSalteados`. 0 significa "todo lo que
 * hay entre la superficie y el destino son carpetas vacías de archivos": un
 * namespace, no capas.
 */
export function countRealLayersCrossed(
  populated: ReadonlySet<string>,
  targetFolderSegments: readonly string[],
  commonAncestorLength: number,
): number {
  let count = 0;
  for (let depth = commonAncestorLength + 1; depth <= targetFolderSegments.length - 1; depth++) {
    if (populated.has(targetFolderSegments.slice(0, depth).join("/"))) count++;
  }
  return count;
}
