/**
 * `mirror-tree` — colapso de ÁRBOLES ESPEJO en el lado detector (paquete
 * ESPEJO-DUPLICACION). Causa raíz medida en guava: dos subárboles fuente
 * casi byte-idénticos (`guava/src/...`/`android/guava/src/...`, el backend
 * "jre" y el backend "android" del mismo código) hacen que CUALQUIER
 * detector que agrupe por huella estructural (`duplication`,
 * `distributed-duplication`) o por relación de grafo (`speculative-abstraction`)
 * cuente cada ocurrencia REAL dos veces — una por copia del árbol — sin que
 * eso sea un falso positivo (el código SÍ está duplicado, literalmente, dos
 * veces), pero SÍ es sobre-conteo del mismo hallazgo lógico, no una señal de
 * mayor duplicación real qué la que hay una sola vez.
 *
 * REPRODUCIDO antes de escribir esto (ver el resultado de la tarea para el
 * detalle de la medición): sobre un recorte real de guava (530 archivos,
 * `com/google/common/{collect,base}` en `guava/` y `android/guava/`),
 * `duplication` reportó 259/282 grupos (91.8%) mezclando ambos árboles, y
 * `speculative-abstraction` reportó "KeySet único implementador SortedKeySet"
 * y "Negated único implementador NegatedFastMatcher" DOS VECES cada uno (una
 * por copia de `Maps.java`/`CharMatcher.java`).
 *
 * SEÑAL — SOLO `repo.clones` (`CloneCandidate[]`), sin leer disco ni recibir
 * nada nuevo: dos archivos son "gemelos" cuando (a) SUFIJO DE RUTA — viven en
 * el mismo lugar relativo bajo una raíz distinta (mismo nombre de archivo +
 * mismos directorios padre inmediatos, ver `commonSuffixSegments`) Y (b)
 * HUELLA CASI IDÉNTICA — buena parte de sus fingerprints estructurales
 * (`CloneCandidate.fingerprint`, el mismo índice que ya arma
 * `duplication.ts`) también aparecen en el otro archivo. Ninguna señal sola
 * alcanza: (a) sin (b) sólo prueba mismo nombre en el mismo lugar relativo
 * (podría ser una reescritura completa, contenido irreconocible); (b) sin
 * (a) sólo prueba código parecido en cualquier parte del repo — eso YA lo
 * cubre `duplication.ts` agrupando por fingerprint, no hace falta declarar
 * "gemelos" para eso, y declararlo igual arriesgaría colapsar duplicación
 * genuina entre archivos sin ninguna relación de ruta.
 *
 * NO necesita `repo.files`/`FileSummary`: el universo de archivos candidatos
 * (y su tamaño, vía cuántos fingerprints aporta) se deriva enteramente de
 * `repo.clones` — un archivo sin ningún `CloneCandidate` no puede probar (b)
 * de todos modos, así que incluirlo desde `repo.files` no cambiaría el
 * resultado. DESVIACIÓN DECLARADA frente a "a partir de repo.files/
 * repo.clones" del encargo: se usa sólo el segundo porque el primero no
 * aporta nada que el segundo no traiga ya.
 *
 * QUÉ NO HACE: no decide que dos archivos gemelos son "el mismo archivo" en
 * general — sólo expone `canonicalFile`, que los tres consumidores
 * (`duplication.ts`, `distributed-duplication.ts`, `speculative-abstraction.ts`)
 * usan para colapsar, POR FINGERPRINT o por hallazgo ya construido, el
 * sobre-conteo puntual que el árbol espejo produce.
 *
 * TEXTO CORREGIDO (era impreciso — RAICES.md lo mide en 62% de los casos
 * reales de guava; no re-verificado acá con esa cifra exacta, pero SÍ
 * confirmado el mecanismo con prueba directa, ver abajo): decir "ningún
 * hallazgo se descarta por completo, se reporta una vez, no dos" es cierto sólo cuando
 * el fingerprint colapsado TAMBIÉN aparece en un tercer archivo sin
 * relación (`collapseMirroredClones` lo deja con 2 ocurrencias reales, y
 * `duplication.ts#buildDuplicationFindings` sí lo reporta). Cuando un
 * fingerprint es compartido ÚNICAMENTE por el par gemelo — el caso más
 * común, un método o una clase completa que existe igual en las dos
 * copias del árbol y en ningún otro lado — el colapso lo deja con
 * EXACTAMENTE 1 ocurrencia (ver el primer test de
 * `collapseMirroredClones` más abajo), y `buildDuplicationFindings` exige
 * `group.length > threshold.value` (1, `presencia()`): 1 no es mayor que
 * 1, así que el hallazgo DESAPARECE ENTERO — de los dos lados a la vez —,
 * no "se reporta una vez". Ya estaba probado, con el veredicto correcto,
 * en `duplication.test.ts#"árbol espejo (paquete ESPEJO-DUPLICACION)"`
 * ("un par gemelo... no infla el conteo de copias"): `findings` da
 * longitud `0` — era el TEXTO el que no coincidía con lo que el propio
 * test ya afirmaba y verificaba.
 *
 * Esto no es necesariamente un defecto: dentro de UN SOLO artefacto
 * publicado (sólo `android/guava`, o sólo `guava/` jre, considerados por
 * separado) ese código no está duplicado en absoluto — aparece una única
 * vez. La duplicación sólo existe al comparar los DOS artefactos entre sí,
 * que es exactamente lo que este módulo declara "sobre-conteo del mismo
 * hallazgo lógico, no señal de mayor duplicación real" (ver el docstring
 * de cabecera). Que el resultado sea "nada que reportar" para ese
 * fingerprint es, en ese sentido, consistente con la intención del módulo
 * — el texto viejo describía mal el MECANISMO (decía "se reporta una vez"
 * cuando el mecanismo real es "desaparece"), no necesariamente el
 * resultado deseado.
 *
 * LO QUE SIGUE ABIERTO, medido pero NO arreglado en esta pasada (fuera de
 * alcance de una corrección de texto): un archivo espejo CHICO —pocas
 * líneas, pocos `CloneCandidate` propios— puede no llegar nunca al piso
 * ABSOLUTO `minSharedFingerprints` (3) sin importar cuán completo sea el
 * solapamiento, porque ese piso no escala con el tamaño del archivo. Caso
 * real confirmado en el corpus:
 * `guava/src/com/google/common/util/concurrent/SettableFuture.java` y su
 * gemelo en `android/guava/...` son BYTE-IDÉNTICOS (30 líneas, clase
 * entera) pero tan chicos que producen muy pocos `CloneCandidate` propios
 * — por debajo del piso absoluto, `detectMirrorTrees` nunca los declara
 * gemelos, `collapseMirroredClones` es un no-op sobre ellos, y
 * `duplication` termina reportando "2 fragmentos idénticos" — literalmente
 * cierto, pero el mismo sobre-conteo por artefacto publicado que este
 * módulo existe para colapsar. Nombrado y medido, no re-calibrado: subir
 * o bajar `minSharedFingerprints`/`minOverlapRatio` para cubrir archivos
 * chicos pide la misma rigurosidad de calibración contra un recorte real
 * de guava que ya se hizo para los valores actuales (ver el docstring de
 * `MirrorThresholds`), no un ajuste a ciegas.
 */
import type { CloneCandidate } from "./types.js";

export interface MirrorThresholds {
  /**
   * Segmentos de ruta que tienen que coincidir, contando desde el final
   * (nombre de archivo incluido), para que dos archivos con el mismo nombre
   * cuenten como "mismo lugar relativo bajo una raíz distinta". Sin cita
   * externa: 1 (sólo el nombre de archivo) acepta cualquier archivo homónimo
   * en cualquier parte del repo (demasiado débil — `index.ts` existe decenas
   * de veces sin relación); 3 exige, además del nombre, que los DOS
   * directorios padre inmediatos también coincidan — sigue siendo barato de
   * cumplir por una reescritura real bajo el mismo paquete, pero ya no lo
   * cumple un archivo homónimo suelto en un paquete distinto (verificado
   * contra guava: `NullnessCasts.java`/`Internal.java`/`Platform.java`
   * existen, a propósito, una vez en `com/google/common/base` y otra en
   * `com/google/common/collect` — mismo árbol, mismo nombre, sufijo de ruta
   * de sólo 1 segmento con este umbral, correctamente EXCLUIDOS de ser
   * "gemelos": son dos archivos legítimamente distintos, no una copia del
   * mismo árbol).
   */
  readonly minSuffixSegments: number;
  /**
   * Fingerprints compartidos mínimos, en absoluto: un `ratio` alto con muy
   * pocos fingerprints totales (p.ej. 1 de 2) es tan débil como coincidencia
   * que no alcanza para declarar "casi idéntico". Sin cita externa: 3 es el
   * primer número que dos subárboles no triviales comparten por diseño, no
   * por azar (un boilerplate de una sola línea repetido por casualidad en
   * dos archivos no relacionados aporta como mucho 1-2 fingerprints
   * compartidos).
   */
  readonly minSharedFingerprints: number;
  /**
   * Fracción de los fingerprints del archivo MÁS CHICO (de los dos) que
   * también aparece en el otro. Calibrado contra el recorte de guava
   * (ver el resultado de la tarea): los pares gemelos reales (mismo
   * contenido, ambos árboles) miden 0.50-1.00; los pares "mismo nombre,
   * implementación realmente distinta entre backends" (p.ej.
   * `RegularImmutableMap.java`, backend jre vs. android: 0.03;
   * `HashBiMap.java`: 0.07) caen muy por debajo. 0.5 separa ambos grupos sin
   * tocar ninguno de los dos extremos medidos.
   */
  readonly minOverlapRatio: number;
}

/**
 * Techo defensivo sobre cuántos archivos con el MISMO nombre base se
 * comparan por pares (`O(n^2)` dentro del bucket) — nunca disparado en el
 * corpus (el bucket más grande medido en guava es de 3: `guava`/`android`/
 * `guava-gwt`), sólo para no degradar a cuadrático de verdad ante un repo
 * adversarial con cientos de archivos homónimos (p.ej. `index.ts` repetido
 * en cientos de paquetes sin relación).
 */
const MAX_BUCKET_SIZE = 64;

export const DEFAULT_MIRROR_THRESHOLDS: MirrorThresholds = {
  minSuffixSegments: 3,
  minSharedFingerprints: 3,
  minOverlapRatio: 0.5,
};

export interface MirrorTrees {
  /**
   * Archivo "gemelo" (no canónico) → archivo canónico de su grupo. Un
   * archivo ausente de este mapa no participa de ningún par gemelo, O ES
   * ÉL MISMO el canónico de su grupo — `canonicalFile` trata ambos casos
   * igual (devuelve el propio archivo).
   */
  readonly canonicalOf: ReadonlyMap<string, string>;
}

/** Sin pares gemelos detectados: toda operación de colapso de este módulo es un no-op sobre esto. */
export const NO_MIRRORS: MirrorTrees = { canonicalOf: new Map() };

/** El archivo canónico de `file` — el propio `file` si no participa de ningún par gemelo. */
export function canonicalFile(trees: MirrorTrees, file: string): string {
  return trees.canonicalOf.get(file) ?? file;
}

function commonSuffixSegments(a: readonly string[], b: readonly string[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/** Union-Find con compresión de camino — mismo algoritmo que
 *  `graph/metrics/componentes.ts`, reescrito acá (privado a este módulo,
 *  entrada/salida distintas: archivos, no nodos de grafo) para no acoplar
 *  dos módulos independientes por una utilidad de 15 líneas. */
class UnionFind {
  private readonly parent = new Map<string, string>();

  private root(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let cur = x;
    while (this.parent.get(cur) !== r) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, r);
      cur = next;
    }
    return r;
  }

  union(a: string, b: string): void {
    const ra = this.root(a);
    const rb = this.root(b);
    if (ra === rb) return;
    // Representante determinístico: el menor lexicográficamente, para que
    // el resultado no dependa del orden en que se descubrieron los pares.
    const [keep, drop] = ra < rb ? [ra, rb] : [rb, ra];
    this.parent.set(drop, keep);
  }

  /** Sólo las claves que participaron de al menos una `union`. */
  keys(): IterableIterator<string> {
    return this.parent.keys();
  }

  find(x: string): string {
    return this.root(x);
  }
}

/**
 * Detecta pares de archivos "gemelos" a partir SOLO de `repo.clones` — ver
 * el docstring del módulo para la señal exacta y la calibración de
 * `thresholds`. Determinístico: mismo `clones` (en cualquier orden) siempre
 * produce el mismo `canonicalOf`.
 */
export function detectMirrorTrees(
  clones: readonly CloneCandidate[],
  thresholds: MirrorThresholds = DEFAULT_MIRROR_THRESHOLDS,
): MirrorTrees {
  const fingerprintsByFile = new Map<string, Set<string>>();
  for (const c of clones) {
    let set = fingerprintsByFile.get(c.file);
    if (!set) {
      set = new Set();
      fingerprintsByFile.set(c.file, set);
    }
    set.add(c.fingerprint);
  }
  if (fingerprintsByFile.size < 2) return NO_MIRRORS;

  const byBasename = new Map<string, string[]>();
  for (const file of fingerprintsByFile.keys()) {
    const segments = file.split("/");
    const base = segments[segments.length - 1]!;
    const list = byBasename.get(base);
    if (list) list.push(file);
    else byBasename.set(base, [file]);
  }

  const uf = new UnionFind();
  let anyPair = false;

  for (const list of byBasename.values()) {
    if (list.length < 2 || list.length > MAX_BUCKET_SIZE) continue;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      const segmentsA = a.split("/");
      const fpA = fingerprintsByFile.get(a)!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (commonSuffixSegments(segmentsA, b.split("/")) < thresholds.minSuffixSegments) continue;

        const fpB = fingerprintsByFile.get(b)!;
        if (fpA.size === 0 || fpB.size === 0) continue;
        let shared = 0;
        for (const fp of fpA) if (fpB.has(fp)) shared++;
        if (shared < thresholds.minSharedFingerprints) continue;
        if (shared / Math.min(fpA.size, fpB.size) < thresholds.minOverlapRatio) continue;

        uf.union(a, b);
        anyPair = true;
      }
    }
  }

  if (!anyPair) return NO_MIRRORS;

  const canonicalOf = new Map<string, string>();
  for (const file of uf.keys()) {
    const root = uf.find(file);
    if (root !== file) canonicalOf.set(file, root);
  }
  return { canonicalOf };
}

/**
 * Colapsa, ANTES de agrupar por fingerprint, los `CloneCandidate` que un par
 * gemelo aporta dos veces al MISMO fingerprint — usado por `duplication.ts`
 * y `distributed-duplication.ts`. No borra duplicación real: para cada
 * `(fingerprint, archivo canónico)` cuyas ocurrencias vienen de MÁS DE UN
 * archivo real (el canónico y/o alguno de sus gemelos), conserva las de UN
 * solo archivo real — el canónico si aportó ese fingerprint él mismo, si no
 * el primero en orden de aparición — y descarta las del resto. Fingerprints
 * que un gemelo aporta y el canónico NO comparte (contenido que sí divergió
 * entre copias, p.ej. `ImmutableMap.java` android/jre, overlap 0.39 — por
 * debajo del piso de `detectMirrorTrees`, así que ni siquiera llega acá
 * declarado como par) nunca se tocan: sólo colapsa lo que el propio par
 * gemelo repite, no la duplicación genuina que ese archivo tenga con
 * cualquier otro.
 */
export function collapseMirroredClones(
  clones: readonly CloneCandidate[],
  trees: MirrorTrees,
): readonly CloneCandidate[] {
  if (trees.canonicalOf.size === 0) return clones;

  // (fingerprint, archivo canónico) -> archivo real "ganador" para ese par.
  const winnerByFingerprintAndCanonical = new Map<string, Map<string, string>>();
  for (const clone of clones) {
    const canonical = canonicalFile(trees, clone.file);
    let byCanonical = winnerByFingerprintAndCanonical.get(clone.fingerprint);
    if (!byCanonical) {
      byCanonical = new Map();
      winnerByFingerprintAndCanonical.set(clone.fingerprint, byCanonical);
    }
    const current = byCanonical.get(canonical);
    if (current === undefined) byCanonical.set(canonical, clone.file);
    // El propio archivo canónico siempre gana sobre un gemelo, sin importar
    // el orden de aparición — preferencia determinística y estable.
    else if (current !== canonical && clone.file === canonical) byCanonical.set(canonical, canonical);
  }

  return clones.filter((clone) => {
    const canonical = canonicalFile(trees, clone.file);
    const winner = winnerByFingerprintAndCanonical.get(clone.fingerprint)?.get(canonical);
    return winner === undefined || winner === clone.file;
  });
}
