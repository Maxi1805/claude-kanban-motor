/**
 * `n2-forma-de-clon.ts` — Ola O, frente N2 (`duplication` /
 * `distributed-duplication`). Cuatro formas de "texto repetido que NO es
 * duplicación de conocimiento" que la Ola N dejó abiertas, cada una MEDIDA
 * sobre los 13 repos del corpus antes de escribirla.
 *
 * Vive acá y no dentro de un detector porque los DOS detectores agrupan el
 * MISMO `repo.clones` y las cuatro formas aparecen en los dos — mismo
 * criterio (y mismo prefijo de frente) que `a4b-clone-shape.ts`, que este
 * módulo COMPLEMENTA, nunca reemplaza.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 1. ÁRBOL ESPEJO CHICO (`refinarArbolesEspejo`)
 *
 * `mirror-tree.ts` declara, en su propia sección "LO QUE SIGUE ABIERTO", el
 * agujero que esta función cierra: su piso ABSOLUTO `minSharedFingerprints`
 * (3) no escala con el tamaño del archivo, así que un archivo espejo que
 * aporta 1 o 2 `CloneCandidate` propios NO puede alcanzarlo por completo que
 * sea el solapamiento, y su copia gemela se reporta como duplicación. Caso
 * citado ahí y confirmado acá: los dos `SettableFuture.java` de guava son
 * byte-idénticos y `detectMirrorTrees` no los empareja.
 *
 * MEDIDO sobre el corpus (13 repos, volcando `repo.clones` y re-corriendo el
 * agrupamiento fuera del proceso de análisis): el piso deja escapar 116
 * grupos, 110 de ellos en el único repo del corpus con dos árboles fuente
 * gemelos publicados por separado. Ejemplos verificados uno por uno, todos
 * pares `X` / `<otra raíz>/X` con el MISMO contenido: `Table.java` (230
 * líneas), `AbstractSetMultimap.java` (119), `ForwardingBlockingDeque.java`
 * (87), `Absent.java` (75).
 *
 * QUÉ AGREGA, y por qué no es "bajar el umbral". Bajar
 * `minSharedFingerprints` a 1 sin más declararía gemelos a dos archivos
 * homónimos que comparten UN fragmento por casualidad. Lo que esta función
 * agrega es EVIDENCIA DE ÁRBOL, no de archivo: primero se leen los pares que
 * `detectMirrorTrees` YA confirmó con el piso estricto; de cada par se deriva
 * el PAR DE RAÍCES (los dos prefijos de ruta que quedan al sacar el sufijo
 * común); y sólo bajo un par de raíces que ya acumula varios pares
 * confirmados se admite un par nuevo con el piso relajado. Un par de raíces
 * con un solo gemelo confirmado no habilita nada.
 *
 * POR QUÉ ESO SEPARA, medido y no supuesto: en el corpus entero hay
 * exactamente DOS repos con algún par de raíces confirmado. En uno, el par de
 * raíces dominante acumula **666** gemelos confirmados y los otros dos pares
 * acumulan **1** cada uno — un hueco de tres órdenes de magnitud, no un
 * continuo que haya que cortar a ojo. En el otro (un monorepo de proyectos de
 * ejemplo autocontenidos) los pares de raíces miden 9, 4, 4, 4 y 3. Los otros
 * once repos no tienen NINGÚN par de raíces confirmado, así que esta función
 * es un no-op exacto sobre ellos: no puede introducir un cambio donde no hay
 * árbol espejo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 2. LÍNEAS DE COMENTARIO QUE PAGAN EL PISO DE TAMAÑO (`lineasDeCodigoProbadas`)
 *
 * El piso de tamaño de un clon se aplica AGUAS ARRIBA de estos detectores
 * (`code-analyzer.ts#walkFile`, sobre `endPosition.row - startPosition.row`)
 * y cuenta LÍNEAS CRUDAS. Un comentario aporta 1 solo nodo mida lo que mida
 * (eso ya lo explota `a4b-clone-shape.ts#isLowDensityClone`) pero aporta
 * TODAS sus líneas al span, así que un fragmento de 4 líneas de código con 2
 * de comentario cruza un piso de 6 que su código no cruza.
 *
 * MEDIDO leyendo los archivos reales del corpus y contando líneas de
 * comentario dentro del span de cada grupo emitido: **196 de 2.283 grupos
 * (8,6 %) tienen menos de 6 líneas de CÓDIGO**. Este módulo cubre la parte
 * que se puede PROBAR sin volver a leer el archivo (68 de esos 196, ver el
 * límite declarado abajo): cero de los 26 verdaderos juzgados que siguen
 * vivos caen, y sí cae uno de los falsos juzgados
 * (`Comparators.emptiesFirst`/`emptiesLast` de guava: 6 líneas de span, una
 * de ellas comentario, 5 de código).
 *
 * POR QUÉ ES UNA COTA INFERIOR, declarado: el texto que llega hasta acá
 * (`CloneCandidate.normalized`) tiene los espacios COLAPSADOS
 * (`code-analyzer.ts#normalizeSource`), así que un comentario de línea ya no
 * tiene final: se sabe que EMPIEZA (el marcador sobrevive) pero no dónde
 * termina. Por eso se cuenta 1 línea por marcador de comentario de línea y,
 * en un comentario de bloque, 1 por su apertura más 1 por cada marcador de
 * continuación — lo que da un piso, nunca un techo, del comentario real. El
 * filtro sólo dispara cuando el fragmento tiene menos de 6 líneas de código
 * INCLUSO con esa cuenta conservadora, así que no puede ocultar de más. El
 * arreglo exacto (no contar comentarios ni en el span ni en el hash) vive en
 * `walkFile` y está pedido en el informe del frente.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 3. ARNÉS DESCUBIERTO POR NOMBRE (`esArnesDeDescubrimiento`)
 *
 * Reusa, sin reimplementarlo, el criterio 1 de `n10-no-es-producto.ts`: una
 * función cuyo nombre es el que un runner reflexivo usa para ENCONTRARLA y
 * que ese runner INVOCA sin argumentos es un arnés, no comportamiento de
 * producto. Ese módulo lo declara pensado para `FunctionUnit`/
 * `RepoFunctionUnit`; un detector `inter-file` de clones no tiene ninguno de
 * los dos (`RepoUnit.functions` llega VACÍO a propósito — ver
 * `code-analyzer.ts#crossAnalyze`), sólo `CloneCandidate.functionName`.
 *
 * LA MITAD QUE FALTA, y cómo se prueba sin inventarla: la aridad. El propio
 * `n10-no-es-producto.ts` avisa que sin ella el criterio sería "un prefijo de
 * nombre a secas, que es exactamente el léxico de dominio prohibido". Acá la
 * aridad no se supone: se PRUEBA sobre el texto del clon, exigiendo que el
 * nombre propio de la función aparezca seguido de un par de paréntesis VACÍO
 * — la forma que tiene una declaración sin parámetros en todas las gramáticas
 * soportadas. Si el clon no es la declaración (p.ej. es sólo el bloque de
 * adentro), esa forma no aparece y este filtro NO dispara: se abstiene, que
 * es la lectura conservadora.
 *
 * MEDIDO: 75 grupos del corpus (de 2.283) tienen TODAS sus copias dentro de
 * una función que pasa las dos mitades del criterio. Son exactamente la
 * familia que la planilla de veredictos ya llamaba falsa
 * (`MultisetTestSuiteBuilder`, `ListGenerators`: "estructura repetitiva
 * legítima del arnés de test"). Sin la mitad de la aridad serían 98 — las 23
 * de diferencia son justamente las que no se pueden probar y no se filtran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 4. FAMILIA SIMÉTRICA DE 3 O MÁS (`esFamiliaSimetricaDeNombres`)
 *
 * `a4b-clone-shape.ts#isSymmetricNamePair` declara, como límite explícito,
 * que sólo cubre grupos de EXACTAMENTE 2 copias porque no había evidencia
 * medida en grupos más grandes. Ahora la hay: 24 grupos del corpus tienen 3 o
 * más copias que cumplen la MISMA condición (nombres propios todos distintos
 * y, sacado de cada cuerpo su propio nombre en posición de invocación, el
 * mismo texto). Ninguno de los 26 verdaderos juzgados vivos cae.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LO QUE SE MIDIÓ Y NO SE PUDO SEPARAR — está acá para que la próxima ola no
 * lo vuelva a intentar a ciegas (detalle en el informe del frente):
 *  · SOLAPAMIENTO DE TOKENS entre copias (¿comparten identificadores o sólo
 *    la forma?): NO separa. Sobre los 40 hallazgos juzgados, los cinco
 *    solapamientos más BAJOS son los cinco VERDADEROS.
 *  · FAMILIA DE SOBRECARGA (todas las copias con el mismo nombre, la misma
 *    clase y el mismo archivo — lo que el sistema de tipos obliga a repetir):
 *    2 verdaderos juzgados y 0 falsos. Es exactamente al revés de lo
 *    esperado.
 *  · EL PAR SIMÉTRICO EN SÍ no es separable de un verdadero: `Min`/`Max`
 *    (falso juzgado) y `highlighter_prefix`/`highlighter_suffix` (verdadero
 *    juzgado) tienen la MISMA forma — dos hermanas cuyo cuerpo difiere sólo
 *    en la substitución que distingue sus nombres. Por eso (4) no se
 *    generaliza más allá de lo que ya cubría el par.
 */
import { arnesPorNombreDeDescubrimiento } from "./n10-no-es-producto.js";
import { DEFAULT_MIRROR_THRESHOLDS } from "../mirror-tree.js";
import { pisoDeclarado } from "../thresholds.js";
import type { MirrorTrees } from "../mirror-tree.js";
import type { ThresholdSpec } from "../thresholds.js";
import type { CloneCandidate } from "../types.js";

/* ── 1. Árbol espejo chico ────────────────────────────────────────────── */

/**
 * Pares de RAÍCES ya confirmados que hacen falta para admitir un par nuevo
 * con el piso de fingerprints relajado. No es un corte a ojo: en el corpus el
 * par de raíces de un árbol espejo real mide 666 y 9-3 en los dos repos que
 * lo tienen, y los pares que NO son árbol espejo miden 1. Cualquier valor
 * entre 2 y 9 da el mismo resultado sobre el corpus; 3 es el mismo número que
 * `mirror-tree.ts` ya eligió para "no es azar" en su propio piso absoluto.
 */
const MIN_GEMELOS_POR_PAR_DE_RAICES = 3;

/** Segmentos comunes contando desde el final — misma cuenta que `mirror-tree.ts`. */
function segmentosDeSufijoComun(a: readonly string[], b: readonly string[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/**
 * Las dos raíces de un par de archivos homónimos: lo que queda de cada ruta
 * al sacarle el sufijo que comparten. Se devuelve ordenado para que el par
 * `(x, y)` y el par `(y, x)` den la misma clave.
 */
function parDeRaices(a: string, b: string): { clave: string; sufijo: number } {
  const sa = a.split("/");
  const sb = b.split("/");
  const sufijo = segmentosDeSufijoComun(sa, sb);
  const ra = sa.slice(0, sa.length - sufijo).join("/");
  const rb = sb.slice(0, sb.length - sufijo).join("/");
  return { clave: ra < rb ? `${ra} ${rb}` : `${rb} ${ra}`, sufijo };
}

/** Union-Find con compresión de camino — misma justificación que el de `mirror-tree.ts`: 15 líneas privadas antes que acoplar dos módulos. */
class UnionFind {
  private readonly padre = new Map<string, string>();

  private raiz(x: string): string {
    if (!this.padre.has(x)) this.padre.set(x, x);
    let r = x;
    while (this.padre.get(r) !== r) r = this.padre.get(r)!;
    let cur = x;
    while (this.padre.get(cur) !== r) {
      const sig = this.padre.get(cur)!;
      this.padre.set(cur, r);
      cur = sig;
    }
    return r;
  }

  unir(a: string, b: string): void {
    const ra = this.raiz(a);
    const rb = this.raiz(b);
    if (ra === rb) return;
    // Representante determinístico: el menor lexicográficamente, igual que `mirror-tree.ts`.
    const [queda, cae] = ra < rb ? [ra, rb] : [rb, ra];
    this.padre.set(cae, queda);
  }

  claves(): IterableIterator<string> {
    return this.padre.keys();
  }

  buscar(x: string): string {
    return this.raiz(x);
  }
}

/**
 * `base` más los pares gemelos que su piso ABSOLUTO de fingerprints dejó
 * escapar, admitidos SÓLO bajo un par de raíces que `base` ya confirmó varias
 * veces — ver el punto 1 del docstring de cabecera.
 *
 * Devuelve `base` tal cual cuando no hay nada que agregar, así que el
 * llamador puede usarlo siempre sin ramificar.
 */
export function refinarArbolesEspejo(
  clones: readonly CloneCandidate[],
  base: MirrorTrees,
): MirrorTrees {
  if (base.canonicalOf.size === 0) return base;

  const huellasPorArchivo = new Map<string, Set<string>>();
  for (const c of clones) {
    let set = huellasPorArchivo.get(c.file);
    if (!set) {
      set = new Set();
      huellasPorArchivo.set(c.file, set);
    }
    set.add(c.fingerprint);
  }

  // Evidencia de ÁRBOL: cuántos gemelos ya confirmados aporta cada par de raíces.
  const gemelosPorParDeRaices = new Map<string, number>();
  for (const [gemelo, canonico] of base.canonicalOf) {
    const { clave } = parDeRaices(gemelo, canonico);
    gemelosPorParDeRaices.set(clave, (gemelosPorParDeRaices.get(clave) ?? 0) + 1);
  }

  const uf = new UnionFind();
  for (const [gemelo, canonico] of base.canonicalOf) uf.unir(gemelo, canonico);

  const porNombreBase = new Map<string, string[]>();
  for (const archivo of huellasPorArchivo.keys()) {
    const segmentos = archivo.split("/");
    const nombre = segmentos[segmentos.length - 1]!;
    const lista = porNombreBase.get(nombre);
    if (lista) lista.push(archivo);
    else porNombreBase.set(nombre, [archivo]);
  }

  let agrego = false;
  for (const lista of porNombreBase.values()) {
    // Mismo techo defensivo que `mirror-tree.ts#MAX_BUCKET_SIZE`, por la misma razón.
    if (lista.length < 2 || lista.length > 64) continue;
    for (let i = 0; i < lista.length; i++) {
      const a = lista[i]!;
      const fpA = huellasPorArchivo.get(a)!;
      for (let j = i + 1; j < lista.length; j++) {
        const b = lista[j]!;
        if (uf.buscar(a) === uf.buscar(b)) continue; // ya son gemelos por `base`
        const { clave, sufijo } = parDeRaices(a, b);
        if (sufijo < DEFAULT_MIRROR_THRESHOLDS.minSuffixSegments) continue;
        if ((gemelosPorParDeRaices.get(clave) ?? 0) < MIN_GEMELOS_POR_PAR_DE_RAICES) continue;

        const fpB = huellasPorArchivo.get(b)!;
        if (fpA.size === 0 || fpB.size === 0) continue;
        let compartidos = 0;
        for (const fp of fpA) if (fpB.has(fp)) compartidos++;
        if (compartidos === 0) continue;
        // El piso RELATIVO no se toca: sigue haciendo falta que el archivo
        // más chico esté casi enteramente contenido en el otro.
        if (compartidos / Math.min(fpA.size, fpB.size) < DEFAULT_MIRROR_THRESHOLDS.minOverlapRatio) continue;

        uf.unir(a, b);
        agrego = true;
      }
    }
  }
  if (!agrego) return base;

  const canonicalOf = new Map<string, string>();
  for (const archivo of uf.claves()) {
    const raiz = uf.buscar(archivo);
    if (raiz !== archivo) canonicalOf.set(archivo, raiz);
  }
  return { canonicalOf };
}

/* ── 2. Líneas de comentario que pagan el piso de tamaño ──────────────── */

/**
 * R3 (auditoría de umbrales inventados): NO es un piso nuevo. Es EL MISMO
 * piso de tamaño que `code-analyzer.ts#MIN_CLONE_LINES` ya aplica aguas
 * arriba (6), aplicado a la magnitud correcta — las líneas que llevan código
 * — en vez de a las líneas crudas del span. Ver el punto 2 del docstring de
 * cabecera para la medición (196 de 2.283 grupos del corpus tienen menos de 6
 * líneas de código; 68 se pueden probar sin releer el archivo).
 */
export const MIN_CODE_LINES_SPEC: ThresholdSpec = pisoDeclarado(6, {
  rationale:
    "líneas del fragmento que NO son comentario. El piso de tamaño que decide qué subárbol es un candidato a " +
    "clon se aplica aguas arriba sobre líneas CRUDAS, así que un fragmento de 4 líneas de código con 2 de " +
    "comentario cruza un piso de 6 que su código no cruza. Medido sobre el corpus leyendo los archivos reales: " +
    "196 de 2.283 grupos emitidos (8,6 %) tienen menos de 6 líneas de código; de los que se pueden probar sobre " +
    "el texto normalizado (68), ninguno es uno de los 26 verdaderos juzgados vivos y uno es un falso juzgado. " +
    "El valor es el mismo 6 de aguas arriba, no un número nuevo: cambia la magnitud que se mide, no el corte.",
});

/**
 * Marcadores de comentario de LÍNEA de las gramáticas soportadas. Vocabulario
 * de GRAMÁTICA (los tokens con los que cada lenguaje abre un comentario), no
 * léxico de dominio. La frontera por espacio a la izquierda evita el `//` que
 * vive DENTRO de un literal de ruta o de URL; el `#` no cuenta cuando abre
 * una interpolación (`#{`), que es sintaxis de expresión, no un comentario.
 */
const MARCADOR_DE_LINEA = /(?:^|\s)(?:\/\/|#(?!\{)|--(?=\s))/g;

/** Comentarios de BLOQUE, que sí conservan su cierre tras el colapso de espacios. */
const BLOQUE = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g;

/** Marcador de continuación de una línea dentro de un comentario de bloque. */
const CONTINUACION_DE_BLOQUE = /\s\*(?!\/)/g;

/**
 * Cota INFERIOR de las líneas de comentario del fragmento, leída del texto
 * normalizado — ver el punto 2 del docstring de cabecera para por qué sólo
 * puede ser una cota y por qué eso alcanza.
 */
export function lineasDeComentarioProbadas(normalized: string): number {
  let lineas = 0;
  for (const bloque of normalized.matchAll(BLOQUE)) {
    lineas += 1 + (bloque[0].match(CONTINUACION_DE_BLOQUE)?.length ?? 0);
  }
  const sinBloques = normalized.replace(BLOQUE, " ");
  lineas += sinBloques.match(MARCADOR_DE_LINEA)?.length ?? 0;
  return lineas;
}

/** Líneas del span que se puede PROBAR que no son comentario. Nunca negativo. */
export function lineasDeCodigoProbadas(clone: Pick<CloneCandidate, "startLine" | "endLine" | "normalized">): number {
  const span = clone.endLine - clone.startLine + 1;
  return Math.max(0, span - lineasDeComentarioProbadas(clone.normalized));
}

/** `true` cuando el fragmento no llega al piso de tamaño contando sólo líneas de código. */
export function tienePocoCodigo(
  clone: Pick<CloneCandidate, "startLine" | "endLine" | "normalized">,
  minCodeLines: { readonly value: number },
): boolean {
  return lineasDeCodigoProbadas(clone) < minCodeLines.value;
}

/* ── 3. Arnés descubierto por nombre ──────────────────────────────────── */

/** Escapa un texto para usarlo literal dentro de un `RegExp`. */
function escaparParaRegExp(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `true` sólo cuando el propio texto del clon PRUEBA que la función que lo
 * contiene no recibe argumentos: su nombre aparece seguido de un par de
 * paréntesis vacío, que es la forma de una declaración sin parámetros en
 * todas las gramáticas soportadas. Si el clon no incluye la declaración, esto
 * es `false` y el filtro se abstiene — ver el punto 3 del docstring.
 */
function aridadCeroProbada(clone: CloneCandidate): boolean {
  const nombre = clone.functionName;
  if (!nombre) return false;
  return new RegExp(`\\b${escaparParaRegExp(nombre)}\\s*\\(\\s*\\)`, "u").test(clone.normalized);
}

/**
 * `true` cuando TODAS las copias del grupo viven en una función que cumple el
 * criterio 1 de `n10-no-es-producto.ts` (contrato de descubrimiento por
 * nombre + invocación sin argumentos), con la aridad probada sobre el texto
 * del propio clon. Exigir TODAS y no alguna es la lectura conservadora: un
 * grupo mixto (una copia en el arnés, otra en el producto) sigue siendo
 * duplicación entre producto y arnés, y se reporta.
 */
export function esArnesDeDescubrimiento(group: readonly CloneCandidate[]): boolean {
  if (group.length === 0) return false;
  return group.every(
    (clone) =>
      aridadCeroProbada(clone) &&
      arnesPorNombreDeDescubrimiento({ name: clone.functionName, metrics: { parameters: 0 } }) !== null,
  );
}

/* ── 4. Familia simétrica de 3 o más ──────────────────────────────────── */

/** Forma de identificador simple — mismo criterio que `a4b-clone-shape.ts`. */
const IDENTIFICADOR_SIMPLE = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;

/**
 * La generalización a 3+ copias de `a4b-clone-shape.ts#isSymmetricNamePair`,
 * con exactamente la misma condición y la misma restricción a POSICIÓN DE
 * INVOCACIÓN (ver el docstring de esa función para el falso negativo medido
 * que motiva la restricción). Devuelve `false` para grupos de 2: ese caso lo
 * sigue decidiendo la función de A4b, que es su dueña.
 */
export function esFamiliaSimetricaDeNombres(group: readonly CloneCandidate[]): boolean {
  if (group.length < 3) return false;
  const nombres = group.map((c) => c.functionName);
  if (nombres.some((n) => !n || !IDENTIFICADOR_SIMPLE.test(n))) return false;
  if (new Set(nombres).size !== nombres.length) return false;

  const sinNombrePropio = (clone: CloneCandidate): string =>
    clone.normalized.replace(new RegExp(`\\b${escaparParaRegExp(clone.functionName!)}\\b(?=\\s*\\()`, "gu"), " ");
  const primero = sinNombrePropio(group[0]!);
  return group.every((clone) => sinNombrePropio(clone) === primero);
}
