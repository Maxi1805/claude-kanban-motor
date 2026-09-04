/**
 * `n10-no-es-producto.ts` — Ola O, frente N10. LA RAÍZ TRANSVERSAL "código
 * que no es producto": vendorizado, generado, super-source, demos,
 * benchmarks, arneses de test y fixtures.
 *
 * QUÉ PROBLEMA RESUELVE. El analizador trata todo archivo con extensión
 * conocida y toda función parseada como código que el equipo escribió para
 * que HAGA algo en producción. Buena parte no lo es, y cuando no lo es el
 * hallazgo es incorregible por construcción: nadie va a refactorizar una
 * copia de upstream (se re-copia), ni un arnés de test (la repetición ES el
 * arnés). Aparece MEDIDO como falso en al menos seis kinds — `duplication`,
 * `distributed-duplication`, `boolean-complexity`, `empty-catch`,
 * `layer-skip`, `speculative-abstraction`.
 *
 * LA REGLA QUE GOBIERNA ESTE ARCHIVO, heredada palabra por palabra de
 * `services/ingest-exclusion.ts`: **está prohibido resolver esto con una
 * lista de nombres de proyecto, framework o librería.** Ningún criterio de
 * acá nombra una herramienta, un ecosistema ni un directorio de moda. Los
 * dos que hay son:
 *
 *   1. Un CONTRATO DE DESCUBRIMIENTO: el nombre de la función es el que un
 *      runner usa por defecto para ENCONTRARLA. Lo fija la herramienta, no
 *      el proyecto — mismo criterio de admisión que `TEST_FILE_PATTERNS` de
 *      `ingest-exclusion.ts` ya aplica a nombres de ARCHIVO, movido a la
 *      granularidad de FUNCIÓN, que es donde vive el problema medido.
 *   2. Una PROCEDENCIA DECLARADA AJENA: el archivo declara, en su propia
 *      cabecera, una atribución de autoría distinta de la que declara la
 *      abrumadora mayoría de los archivos del mismo repo. Cero nombres: los
 *      dos lados de la comparación los aportan los archivos analizados, y
 *      el criterio funciona igual en un repo cuyo autor nunca vimos.
 *
 * POR QUÉ DOS GRANULARIDADES DISTINTAS, y no una. No es una comodidad: es
 * lo que cada criterio puede decidir honestamente.
 *   · (1) decide por FUNCIÓN. Tiene que ser así: `guava-testlib` es una
 *     librería PUBLICADA en Maven Central (código de producción de pleno
 *     derecho, ver el RECHAZADO de `ingest-exclusion.ts` §4 sobre el sufijo
 *     `Tests.java`) cuyo árbol contiene, mezclados, su API de producción y
 *     los métodos de test genéricos que esa API existe para ejecutar.
 *     Excluir el ARCHIVO sería el falso positivo que aquel RECHAZADO evita;
 *     excluir la FUNCIÓN saca exactamente el arnés y deja el API bajo
 *     análisis. La granularidad fina es más SEGURA, no más laxa.
 *   · (2) decide por ARCHIVO, y no puede decidir por menos: una copia de
 *     upstream es un archivo entero, y la evidencia (la cabecera) es del
 *     archivo. Por eso se aplica en la ingesta y no en un detector — ver
 *     "DÓNDE SE APLICA CADA UNO".
 *
 * DÓNDE SE APLICA CADA UNO.
 *   · (1) lo consume el detector, en `run()`, con lo que ya tiene en la
 *     mano (`FunctionUnit.name` + `FunctionUnit.metrics.parameters`). Hoy
 *     está cableado en `detect/intra-function/boolean-complexity.ts` y
 *     `detect/intra-function/empty-catch.ts`. Cualquier otro detector
 *     `intra-*` lo cablea con una línea; los `inter-file` también pueden
 *     (`RepoUnit.functions` es `RepoFunctionUnit`, que conserva `name` y
 *     `metrics`).
 *   · (2) lo consume `services/ingest-exclusion.ts`, que es el único lugar
 *     del sistema que ve el CONTENIDO de todos los archivos de un repo.
 *     Este módulo aporta únicamente las funciones PURAS (sin I/O, sin
 *     estado): quién lee el disco y quién memoiza es responsabilidad de la
 *     capa de ingesta.
 *
 * LO QUE ESTE MÓDULO NO CUBRE, con el motivo medido y no por pereza — ver
 * el informe `claude-kanban-docs/ola-o/informes/N10.md`:
 *   · **Demos y ejemplos.** No hay criterio estructural: `docs`,
 *     `examples`, `samples` están explícitamente RECHAZADOS como nombres de
 *     directorio en `code-analyzer.ts#SKIP_DIRS` ("no son dependencias; si
 *     tienen código, es del usuario") y ese rechazo sigue siendo correcto.
 *   · **Benchmarks como categoría.** Se descartó por MEDICIÓN, no por
 *     dificultad: el ÚNICO `empty-catch` juzgado VERDADERO de todo el
 *     corpus (`tests/golden/precision/lodash.verdicts.csv`, `perf/perf.js:51`)
 *     está en un script de benchmark, y el juez lo llamó real. Una regla
 *     "benchmark ⇒ no es producto" habría matado el único verdadero del
 *     kind. Los benchmarks que SÍ son ruido caen por (1) o por (2) cuando
 *     corresponde, o no caen.
 *   · **Bundles vendorizados sin cabecera.** Medido sobre los dos casos
 *     citados en el brief: `hugo/livereload/livereload.js` (media de largo
 *     de línea 36, línea más larga 497) y
 *     `eslint/docs/src/assets/js/css-vars-ponyfill@2.js` (media 23, máxima
 *     109) — los dos MUY por debajo del criterio de forma minificada que
 *     `ingest-exclusion.ts` ya aplica (media > 110 Y una línea >= 1000), y
 *     el segundo sin cabecera de atribución en el repo que lo hospeda. No
 *     son distinguibles por forma ni por procedencia: quedan sin cubrir, y
 *     está medido en vez de supuesto.
 *
 * OLA Q, FRENTE F2 — EL TERCER CRITERIO: **subárbol autocontenido**, la
 * respuesta al punto "Demos y ejemplos" que el párrafo de arriba dejó abierto
 * en la Ola O. No se resolvió con nombres de directorio (`docs`, `examples`,
 * `samples` siguen RECHAZADOS como léxico, y con razón): se resolvió con la
 * FORMA — una carpeta sin NI UNA arista de código con el resto del repo. Ver
 * su propio bloque, abajo, con la medición de las dos variantes más amplias
 * que se probaron y se DESCARTARON por marcar producto.
 */
import { edgeIsAmbiguous, type CodeGraph } from "../../graph/types.js";

/* ── Criterio 1 — contrato de descubrimiento por NOMBRE DE FUNCIÓN ────────
 *
 * QUÉ LO HACE GENÉRICO. Cuatro runners de cuatro ecosistemas distintos
 * descubren qué ejecutar reflexionando sobre el NOMBRE del método/función,
 * sin ninguna anotación ni configuración: es su valor por defecto
 * publicado, no una convención social del proyecto que se analiza.
 *   · `unittest` de la stdlib de Python: `TestLoader.testMethodPrefix`
 *     vale `"test"`; el runner ejecuta todo método que empiece así.
 *   · `pytest`: su opción `python_functions` vale `test*` por defecto.
 *   · JUnit 3 (`junit.framework.TestSuite`): NO tiene anotaciones — el
 *     prefijo `test` en un método público sin argumentos ES el contrato
 *     entero. Es el runner de `guava-testlib`, el caso medido.
 *   · Minitest de Ruby: ejecuta los métodos de instancia `test_*`.
 * Es EL MISMO criterio de admisión que `ingest-exclusion.ts` ya usa para
 * nombres de ARCHIVO (`test_*.py`, `_test.go`, `.test.ts`), aplicado al
 * nombre de la función. No agrega vocabulario nuevo al proyecto: agrega la
 * granularidad que faltaba.
 *
 * POR QUÉ ADEMÁS EXIGE ARIDAD CERO, y no es decoración. Los cuatro runners
 * INVOCAN el método sin argumentos: instancian la clase (o toman la función
 * suelta) y llaman. Un método con parámetros no puede ser uno de ellos —
 * el runner no tendría qué pasarle. Esa mitad del contrato es la que
 * separa el arnés (`testRemove_wrongType()`) de una función de producción
 * que empieza igual (`testConnection(url)`, `testAndSet(expected, next)`):
 * sin ella el criterio sería un prefijo de nombre a secas, que es
 * exactamente el léxico de dominio prohibido.
 *
 * LÍMITE DECLARADO, medido: un test de `pytest` que recibe fixtures
 * (`def test_x(tmp_path)`) tiene aridad > 0 y NO cae acá. No es un agujero
 * en la práctica — esos archivos ya no llegan al análisis, los excluye
 * `TEST_FILE_PATTERNS` (`test_*.py`) en la ingesta. Lo mismo con
 * `TestXxx(t *testing.T)` de Go (aridad 1): sus archivos son `_test.go`,
 * excluidos por el propio COMPILADOR de Go y ya por la ingesta. Lo que
 * llega hasta acá es, justamente, el arnés que NO vive en un archivo con
 * nombre de test — el caso que ningún criterio anterior podía ver.
 *
 * RECHAZADO: el prefijo sin frontera. `tester`, `testing`, `testable`,
 * `testimony` empiezan con las mismas cuatro letras y no son nada de esto;
 * `guava-testlib` está LLENO de clases `XxxTester` cuyos métodos de API
 * (`expectContents`, `getMap`) son producción pura. La frontera (`_`, una
 * mayúscula, un dígito o el fin del nombre) es la que separa el token
 * `test` de una palabra que lo contiene, y es la misma que usan los
 * patrones por defecto de los propios runners (`test*` de pytest matchea
 * `testable`, sí — pero pytest sólo lo mira DENTRO de un archivo que ya
 * clasificó como de test; acá no hay ese contexto, así que la frontera es
 * obligatoria).
 */
const DISCOVERY_NAME = /^[Tt]est(?:[_A-Z0-9]|$)/;

/** Por qué un pedazo de código no cuenta como producto. */
export type MotivoNoEsProducto = "arnes-por-nombre" | "procedencia-ajena" | "subarbol-autocontenido";

export interface NoEsProducto {
  motivo: MotivoNoEsProducto;
  /** Qué se observó, concreto, para poder auditar la decisión sin releer nada. */
  detalle: string;
}

/**
 * La superficie MÍNIMA que el criterio 1 necesita de una función. Se declara
 * acá, estructural, en vez de importar `FunctionUnit`: así lo puede llamar
 * igual un detector `intra-function` (que tiene `FunctionUnit`) y uno
 * `inter-file` (que tiene `RepoFunctionUnit`, sin `node`), y el módulo no
 * arrastra la dependencia de tipos de `detect/types.ts`.
 */
export interface FuncionParaClasificar {
  readonly name: string | null;
  readonly metrics: { readonly parameters: number };
}

/**
 * `NoEsProducto` cuando la función es una que un runner descubre por su
 * propio nombre y ejecuta sin argumentos — ver el bloque de arriba para el
 * criterio de admisión completo. `null` (el caso abrumadoramente mayoritario)
 * ⇒ es código como cualquier otro y se analiza igual.
 *
 * Una función anónima nunca cae acá: sin nombre no hay contrato de
 * descubrimiento posible.
 */
export function arnesPorNombreDeDescubrimiento(fn: FuncionParaClasificar): NoEsProducto | null {
  const name = fn.name;
  if (!name || !DISCOVERY_NAME.test(name)) return null;
  if (fn.metrics.parameters !== 0) return null;
  return {
    motivo: "arnes-por-nombre",
    detalle:
      `"${name}" sin parámetros: es el contrato de descubrimiento por nombre que ejecutan los runners ` +
      `reflexivos (prefijo "test" + invocación sin argumentos) — un arnés de test, no comportamiento de producto.`,
  };
}

/* ── Criterio 2 — procedencia declarada ajena (por ARCHIVO) ───────────────
 *
 * LA FORMA, en una línea: un archivo cuya CABECERA declara una atribución de
 * autoría que no es la que declara la abrumadora mayoría de los archivos del
 * mismo repo es una copia traída de afuera.
 *
 * POR QUÉ ES ESTRUCTURAL Y NO LÉXICO. No hay ningún nombre en este código:
 * los dos lados de la comparación —la firma del archivo y la firma dominante
 * del repo— salen de los propios archivos analizados. El criterio funciona
 * idéntico en un repo de una empresa que nunca vimos, y no funciona (se
 * abstiene, ver las tres compuertas) en un repo que no usa cabeceras. Lo
 * único fijo son las PALABRAS FUNCIONALES en inglés con las que se escribe
 * una atribución de copyright (`copyright`, `(c)`, `©`, `written by`) y las
 * muletillas legales que hay que descartar para comparar — vocabulario de
 * formato, no de dominio, misma familia que el `do not edit` que
 * `ingest-exclusion.ts` ya reconoce.
 *
 * MEDIDO sobre los 13 repos del corpus (ver el informe del frente): actúa en
 * 4 y se abstiene en 9. Los 77 archivos que marca son, uno por uno, copias
 * reales de upstream — la copia de `text/template`+`html/template` de la
 * stdlib de Go dentro de hugo (54), `Striped64`/`LongAdder`/`AtomicDouble*`
 * de JSR-166 dentro de guava (14 + los tests derivados), `LinqBridge.cs`
 * dentro de newtonsoft-json (1), y tres archivos sueltos de hugo con autor
 * propio declarado. Cero falsos positivos revisados a mano.
 *
 * REQUISITO DE SEGURIDAD, más fuerte que el de cobertura, igual que en
 * `ingest-exclusion.ts`: sacar código legítimo del usuario es un BUG; dejar
 * pasar una copia vendorizada es ruido. Por eso las tres compuertas de
 * `procedenciaDominante` y por eso un archivo SIN firma nunca es ajeno.
 */

/**
 * Cuántas líneas del arranque se miran. El mismo número que
 * `ingest-exclusion.ts#GENERATED_MARKER_LINES`, y por la misma razón: una
 * CABECERA. Una atribución en el medio del archivo es una cita, no una
 * declaración sobre el archivo.
 */
const HEADER_LINES = 40;

/**
 * Una línea de comentario, con su contenido. Los prefijos son los de los
 * lenguajes soportados; el `*` cubre la continuación de bloque. Exigir que
 * la línea SEA un comentario es la misma restricción anclada que
 * `ingest-exclusion.ts` documenta para `GENERATED_MARKER_RE` — sin ella, un
 * archivo que HABLA de copyrights (una plantilla, un test de licencias) se
 * clasificaría por lo que menciona en vez de por lo que es.
 */
const COMMENT_LINE = /^[ \t]*(?:\/\/+|\/?\*+|#+|--|;+|%+|<!--)[ \t]?(.*)$/;

/** Las formas en que se abre una atribución de autoría. Palabras funcionales, no nombres. */
const ATTRIBUTION = /^(?:copyright|copr\.|©|\(c\)|written by)\b[\s:]*(?:\(c\)|©)?\s*(.*)$/i;

/** Años y rangos de años: identifican la fecha, nunca a quién se atribuye. */
const YEARS = /\b\d{4}(?:\s*[-–,]\s*(?:\d{4}|present))?\b/gi;

/**
 * Muletillas legales y conectores que aparecen en CUALQUIER atribución y no
 * distinguen a nadie. Sacarlas es lo que hace que "Copyright 2019 The Hugo
 * Authors" y "Copyright 2024-present The Hugo Authors, all rights reserved"
 * den la MISMA firma — y es también lo que evita el único falso positivo
 * medido del criterio (`sqlalchemy/tools/normalize_file_headers.py`, un
 * script que arma cabeceras y por lo tanto lleva una plantilla de copyright
 * con interpolaciones en el medio: sin normalizar, su firma no coincidía con
 * la del repo; normalizada, la dominante queda contenida en la suya y el
 * archivo NO se marca — ver `esProcedenciaAjena`, comparación por subconjunto).
 */
const FILLER = /\b(?:all rights reserved|and others|and contributors|contributors|et al|inc|llc|ltd|corporation|corp|the|present|by|reserved|rights)\b/gi;

/**
 * La firma de procedencia de un archivo: el conjunto NORMALIZADO de palabras
 * con las que su cabecera atribuye la autoría, como cadena canónica
 * (ordenada, para que dos escrituras del mismo autor den la misma clave).
 * `null` ⇒ el archivo no declara ninguna atribución, y entonces NUNCA puede
 * ser ajeno: la ausencia de evidencia no es evidencia.
 *
 * `cabecera` es el texto del arranque del archivo (con leer unos pocos KiB
 * alcanza; quien llame decide cuánto).
 */
export function firmaDeProcedencia(cabecera: string): string | null {
  for (const raw of cabecera.split("\n", HEADER_LINES)) {
    const comment = COMMENT_LINE.exec(raw);
    if (!comment) continue;
    const attribution = ATTRIBUTION.exec(comment[1]!.trim());
    if (!attribution) continue;
    const words = attribution[1]!
      .replace(YEARS, " ")
      .replace(FILLER, " ")
      .replace(/[^a-zA-Z ]+/g, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1);
    if (words.length === 0) continue;
    return [...new Set(words)].sort().join(" ");
  }
  return null;
}

/**
 * TRES COMPUERTAS, y las tres son de SEGURIDAD, no de cobertura: si alguna
 * no se cumple el repo entero se declara "sin procedencia dominante" y no se
 * marca NI UN archivo. Cada una salió de un repo real del corpus, no de
 * precaución teórica.
 *
 *   1. `MIN_FIRMADOS` — un piso ABSOLUTO de archivos con firma. Medido:
 *      eslint tiene 39 archivos con atribución sobre 1.455 (el resto no usa
 *      cabeceras), y entre esos 39 la mayoría relativa la tiene un tercero
 *      que hospeda en `docs/`. Con una muestra así, "la mayoría" no dice
 *      nada del repo: dice algo de sus 39 excepciones, y sin este piso el
 *      criterio habría marcado como ajenos a los archivos PROPIOS que sí
 *      declaran autor.
 *   2. `MIN_COBERTURA` — la fracción de archivos con firma sobre el total.
 *      Un repo que no usa cabeceras (preact, jekyll, vueuse: 0 %; click,
 *      nest, rubocop, lodash: 1-4 %) no tiene una convención contra la cual
 *      medir "ajeno", y el criterio se abstiene por completo.
 *   3. `MIN_SHARE` — la fracción que la firma más frecuente representa entre
 *      las firmadas. Sin una mayoría clara no hay "la del repo" contra la
 *      cual comparar; hay varias, y entonces ninguna es ajena.
 *
 * El modo de falla de las tres es el mismo y es el correcto: NO EXCLUIR.
 */
export const MIN_FIRMADOS = 50;
export const MIN_COBERTURA = 0.25;
export const MIN_SHARE = 0.6;

/**
 * La firma que declara la abrumadora mayoría de los archivos del repo, o
 * `null` cuando no hay tal cosa (ver las tres compuertas). `firmas` es UNA
 * entrada por archivo analizable del repo, con `null` para los que no
 * declaran nada — los `null` cuentan para la cobertura, que es justamente lo
 * que la compuerta 2 mide.
 */
export function procedenciaDominante(firmas: Iterable<string | null>): string | null {
  let total = 0;
  let firmados = 0;
  const conteo = new Map<string, number>();
  for (const firma of firmas) {
    total++;
    if (firma === null) continue;
    firmados++;
    conteo.set(firma, (conteo.get(firma) ?? 0) + 1);
  }
  if (total === 0 || firmados < MIN_FIRMADOS) return null;
  if (firmados / total < MIN_COBERTURA) return null;
  let mejor: string | null = null;
  let mejorConteo = 0;
  for (const [firma, n] of conteo) {
    if (n > mejorConteo) {
      mejor = firma;
      mejorConteo = n;
    }
  }
  if (mejor === null || mejorConteo / firmados < MIN_SHARE) return null;
  return mejor;
}

/**
 * `true` cuando las dos firmas son la MISMA atribución escrita de dos
 * maneras. La comparación es por SUBCONJUNTO de palabras en las dos
 * direcciones, no por igualdad: una cabecera puede agregar palabras a la
 * atribución del repo ("The Hugo Authors" vs "The Hugo Authors and
 * contributors", o la plantilla interpolada de
 * `sqlalchemy/tools/normalize_file_headers.py`) sin dejar de ser el mismo
 * autor. Dos atribuciones GENUINAMENTE distintas no se contienen: "go
 * authors" y "hugo authors" comparten sólo `authors`, y ninguna es
 * subconjunto de la otra.
 */
function mismaAtribucion(a: string, b: string): boolean {
  if (a === b) return true;
  const A = new Set(a.split(" "));
  const B = new Set(b.split(" "));
  const contenida = (x: ReadonlySet<string>, y: ReadonlySet<string>): boolean => {
    for (const w of x) if (!y.has(w)) return false;
    return true;
  };
  return contenida(A, B) || contenida(B, A);
}

/**
 * `NoEsProducto` cuando el archivo declara una autoría que no es la del
 * repo. `null` en los tres casos seguros: el archivo no declara nada, el
 * repo no tiene procedencia dominante (ver las tres compuertas), o las dos
 * atribuciones son la misma.
 */
export function esProcedenciaAjena(firma: string | null, dominante: string | null): NoEsProducto | null {
  if (firma === null || dominante === null) return null;
  if (mismaAtribucion(firma, dominante)) return null;
  return {
    motivo: "procedencia-ajena",
    detalle:
      `la cabecera atribuye la autoría a "${firma}" y la abrumadora mayoría de los archivos de este repo ` +
      `la atribuye a "${dominante}": es una copia traída de afuera, no código de este proyecto.`,
  };
}

/* ── Criterio 3 — SUBÁRBOL AUTOCONTENIDO (por CARPETA) ─────────────────────
 *
 * OLA Q, FRENTE F2. El TERCER criterio de este módulo y el CUARTO de "no es
 * producto" contando el de `services/ingest-exclusion.ts`. Es el que P7 y P10
 * pidieron por separado en la Ola P y que el integrador dejó anotado como
 * "ABIERTO, y ahora medido dos veces": es la raíz de 5 de 6 falsos de
 * `distributed-duplication` y de 9 de 14 falsos de `duplication`.
 *
 * LA FORMA, en una línea: una carpeta cuyos archivos NO TIENEN NI UNA arista
 * de código con el resto del repo — ni de ida ni de vuelta — es un subárbol
 * que vive EN el repo pero no está cableado A él. Un demo, un banco de
 * pruebas, una muestra de integración, un arnés: consumen el producto por su
 * frontera publicada (la misma que usaría alguien de afuera), y por eso el
 * grafo INTERNO no ve ninguna relación. Es "autocontenido" en el sentido
 * literal, y sale ENTERO de los propios archivos analizados: cero nombres de
 * carpeta, cero nombres de framework, cero convenciones de ecosistema.
 *
 * POR QUÉ LAS DOS DIRECCIONES, Y NO SÓLO "NADIE DEPENDE DE ÉL" — MEDIDO, y es
 * lo más importante de este bloque. La formulación natural del criterio es
 * "nada del repo depende de este subárbol". La medí sobre los 13 repos del
 * corpus, con el grafo real, y NO SE PUEDE USAR: en los lenguajes donde la
 * carpeta ES el espacio de nombres, un paquete de producto perfectamente
 * normal tampoco tiene aristas entrantes, porque la cascada de resolución no
 * las produce. Los casos, textuales del volcado:
 *   · `newtonsoft-json`: `Src/Newtonsoft.Json/Utilities` y
 *     `Src/Newtonsoft.Json/Schema` — 17 hallazgos, TODOS producto.
 *   · `guava`: `android/guava/src/com/google/common/{html,net,xml}` — producto.
 *   · `hugo`: `tpl/compare`, `common/hstrings`, `markup/pandoc` — producto.
 *   · `vueuse`: `packages/router`, `packages/integrations` — paquetes publicados.
 * Es exactamente el modo de falla que mantiene a `orphan-file` en 0 % de
 * precisión, y una variante que además exigiera "y es hermano de otros
 * subárboles mutuamente inconexos" seguía marcando los cuatro. Exigir las DOS
 * direcciones lo cierra: un paquete de producto SIEMPRE usa algo del repo, así
 * que su lado saliente nunca está vacío. El precio es cobertura (ver LO QUE NO
 * CUBRE) y el precio es el correcto: mismo requisito de seguridad que gobierna
 * los otros dos criterios — sacar código legítimo del usuario es un BUG, dejar
 * pasar una copia de demo es ruido.
 *
 * LO QUE NO CUBRE, medido y no supuesto. Los árboles de demo/benchmark de
 * `preact` (`demo/`), `jekyll` (`benchmark/`) y `vueuse` (`demo.vue` por
 * paquete) NO caen acá. La Ola Q dejó anotada UNA causa —la cascada de
 * resolución FABRICA aristas ENTRANTES hacia ellos por coincidencia de
 * nombres— y sigue siendo cierta:
 *   · `jekyll`: `lib/jekyll/renderer.rb --references(peso 32)-->
 *     benchmark/static-drop-vs-forwarded.rb`, más `extends` desde
 *     `lib/jekyll/drops/drop.rb` — un archivo de PRODUCCIÓN "extiende" una
 *     clase declarada en un banco de pruebas, porque el banco redeclara los
 *     mismos nombres para compararlos.
 *   · `preact`: `debug/src/debug.js --references(peso 12)-->
 *     demo/nested-suspense/index.jsx`.
 * Las dos son `provenance: "resolved"`, así que ningún filtro de confianza las
 * saca. Es el mismo defecto de familia que el integrador de la Ola P midió en
 * `deriveSatisfiesEdges` (§5.1): una arista DERIVADA por coincidencia de
 * nombres alimentando una afirmación que se lee como nominal. Queda anotado
 * como pedido al dueño del grafo, no parcheado acá.
 *
 * OLA S, FRENTE S3 — PERO ESA CAUSA NO ES LA QUE ATA, Y ARREGLARLA NO
 * DESBLOQUEA NADA. Medido, con el criterio de arriba corrido tal cual sobre el
 * volcado del grafo real y BORRANDO A MANO TODAS las aristas entrantes del
 * subárbol (`scripts/s3-sonda.mts` + `scripts/s3-variantes.mts`):
 *   · `preact/demo` sigue sin ser autocontenida: le quedan **153 aristas
 *     SALIENTES confiables hacia 18 archivos** (`src/`, `compat/`, `hooks/`,
 *     `debug/`).
 *   · `jekyll/benchmark` sigue sin serlo: **21 salientes hacia 5 archivos**
 *     (`lib/jekyll.rb`, `lib/jekyll/site.rb`, `lib/jekyll/path_manager.rb`…).
 * Esas salientes son REALES y son la definición misma de un demo: consume el
 * producto. O sea que **el lado SALIENTE es la restricción que ata**, no el
 * entrante, y ningún arreglo del grafo puede moverlo. Cualquier expectativa de
 * que este criterio, tal como está formulado, llegue a los árboles de demo
 * cuando la cascada mejore es incorrecta: la formulación de DOS DIRECCIONES los
 * excluye por construcción.
 *
 * Y la comprobación complementaria, por si la duda fuera al revés: refinar sólo
 * el lado ENTRANTE (descartar toda arista entrante que no necesite un nombre que
 * SÓLO este subárbol declare — la variante D de abajo, aplicada sin tocar la
 * exigencia de cero salientes) **no cambia NI UNA carpeta en 6 repos**
 * (`preact`, `jekyll`, `vueuse`, `newtonsoft-json`, `nest`, `guava`): mismos
 * subárboles, mismos hallazgos. El lado entrante no está atando nada.
 *
 * LAS VARIANTES QUE RELAJAN EL LADO SALIENTE, Y POR QUÉ NINGUNA SE PUEDE
 * ATERRIZAR (Ola S, frente S3 — medidas sobre 6 repos con el mismo volcado
 * —`preact`, `jekyll`, `vueuse`, `nest`, `newtonsoft-json`, `guava`: javascript,
 * ruby, vue, typescript, csharp, java—, reproducibles con
 * `scripts/s3-variantes.mts`). Relajar el lado saliente es la única vía que
 * puede alcanzar a un demo, y es exactamente la familia de la variante A que la
 * Ola Q ya descartó. Se midieron tres refinamientos más:
 *   · **A — "nadie depende de este subárbol"** (cero aristas entrantes
 *     confiables). Recontada hoy: suprime **19 hallazgos vivos de PRODUCTO** en
 *     `newtonsoft-json` (marca `Src/Newtonsoft.Json/{Utilities,Schema,
 *     Linq/JsonPath}`) y 39 en `nest`. Descartada, igual que en la Ola Q.
 *   · **D — A refinada por EXCLUSIVIDAD DE NOMBRE**: no vale como "alguien
 *     depende de esto" una arista entrante —ni ambigua— cuyo nombre destino
 *     TAMBIÉN se declara fuera del subárbol; sólo cuenta la que necesita un
 *     nombre que sólo el subárbol declara. **Arregla el modo de falla de A en
 *     los lenguajes donde la carpeta es el espacio de nombres**: en
 *     `newtonsoft-json` pasa de 19 hallazgos de producto suprimidos a **0**
 *     (`Utilities` recibe 857 entrantes ambiguas, 821 de ellas por nombres que
 *     sólo él declara — el grafo SÍ sabe que el repo lo necesita, sólo que no
 *     sabe de qué archivo). Pero **marca paquetes PUBLICADOS de un repo
 *     multi-paquete**, que ningún hecho del código distingue de una muestra:
 *     `vueuse/packages/{router,integrations,electron,firebase,nuxt,components,
 *     skills,rxjs}` y `preact/jsx-runtime`. Y sobre `guava` —el repo que faltaba
 *     medir y el que cierra la discusión— **declara satélite al ÁRBOL ESPEJO
 *     ENTERO (`android/`, el producto en su variante Android) más
 *     `guava/src/com/google/common/{eventbus,html,net}`: 297 de los 360
 *     hallazgos del repo, 1.014 de sus 1.315 de volumen, y entre ellos UN
 *     `verdadero` JUZGADO** (`android/guava/src/com/google/common/collect/
 *     CompactLinkedHashMap.java`, "3 fragmentos idénticos de 13 líneas").
 *     Descartada por la misma regla que gobierna el módulo entero: sacar código
 *     legítimo del usuario es un BUG — y acá además rompería la compuerta de
 *     recall.
 *   · **D+ / E — D más compuertas** ("el grafo miró adentro": ≥1 entrante; y
 *     "ningún hermano bajo el mismo padre es necesitado por el repo"). Reducen
 *     los falsos positivos a `preact/jsx-runtime/src` y ganan 22 y 18 hallazgos
 *     en `nest` respectivamente (2 de ellos juzgados `falso`, ninguno
 *     `verdadero`) — pero en `guava` D+ sigue marcando `android/` y
 *     `guava-testlib`: 287 hallazgos, 995 de volumen, el MISMO `verdadero`
 *     juzgado muerto. **Tampoco se aterrizan**, y el motivo es doble: el
 *     resultado en `guava`, y el método — son cinco compuertas conjuntivas de
 *     las cuales tres se introdujeron para que salieran bien los repos que se
 *     habían mirado hasta entonces. Ajustar el criterio a la muestra es la forma
 *     exacta del defecto que la Ola P midió en `deriveSatisfiesEdges`, y el
 *     sexto repo lo demostró en el acto.
 *
 * LA RAZÓN DE FONDO, y conviene que quede escrita para no volver a intentarlo
 * sin evidencia nueva: **"nadie del repo depende de este subárbol" no es una
 * pregunta que el grafo pueda contestar**, y falla de TRES maneras
 * independientes, las tres medidas:
 *   1. Da FALSOS CEROS. Un paquete de producto en C#/Java/Go no tiene entrantes
 *      confiables (`Src/Newtonsoft.Json/Utilities`: 0 confiables, 857 ambiguas).
 *   2. Da FALSOS NO-CEROS por homonimia (los dos casos de arriba).
 *   3. Y da NO-CEROS que son LITERALMENTE CIERTOS. En `preact`,
 *      `src/diff/index.js` LLAMA `componentWillUnmount`, `shouldComponentUpdate`,
 *      `componentDidUpdate` y `componentWillReceiveProps` — los puntos de
 *      extensión del propio framework — y las ÚNICAS declaraciones de esos
 *      nombres en todo el repo están en `demo/`. El producto depende del demo, y
 *      el grafo tiene razón: en un repo de framework, el árbol de demos es el
 *      único implementador del contrato de callbacks que el framework define y
 *      no declara. Esto NO lo arregla ninguna mejora de la cascada.
 * Un demo y un paquete publicado que el repo no consume son, en el código,
 * indistinguibles: lo que los separa es la intención de publicación, que vive en
 * el empaquetado y no en el grafo.
 *
 * RIESGO LATENTE DECLARADO, medido por S3 y no arreglado acá: el criterio tal
 * como está marca `preact/test-utils` (2 archivos, 135 líneas, cero aristas
 * confiables en las dos direcciones), que es un **paquete PUBLICADO**
 * (`preact/test-utils`). Hoy no cuesta ni un hallazgo —no hay ninguno ahí
 * dentro—, así que no es una pérdida medida, pero es del tipo que el módulo
 * prohíbe. Contar las aristas AMBIGUAS como cruce lo cierra (con ambiguas:
 * `preact` 2 → 1 subárbol, y `test-utils` deja de marcarse), y cuesta el
 * subárbol `rubocop/jekyll`, que es el único `falso` juzgado que este criterio
 * suprime hoy: `jekyll` 1 → 0. Es un canje con número de los dos lados y no se
 * decide desde un frente suelto.
 *
 * LAS DOS COMPUERTAS, las dos de SEGURIDAD, mismo espíritu que las tres de
 * `procedenciaDominante`:
 *   1. COBERTURA DE ARISTAS: la MAYORÍA de los archivos analizados del repo
 *      tiene que participar en al menos una arista de código con otro archivo.
 *      Este criterio afirma algo NEGATIVO ("este subárbol no está cableado") y
 *      una afirmación negativa sólo vale si el instrumento habría mostrado lo
 *      contrario. Sin esta compuerta, un repo (o un lenguaje) donde el
 *      extractor todavía no emite aristas declara autocontenido TODO. No es un
 *      umbral calibrado, es una mayoría: o el grafo ve este repo o no lo ve.
 *      MEDIDO sobre los 13 del corpus, donde queda INERTE: la cobertura va de
 *      0,80 (`lodash`) a 1,00 (`cobra`, `rubocop`), con 10 de 13 por encima de
 *      0,92. La compuerta la disparó un caso real y por eso está: un fixture
 *      sintético de `distributed-duplication.test.ts` con 5 archivos y UNA
 *      arista (cobertura 0,40) declaraba autocontenido su propio árbol de
 *      prueba y se comía el hallazgo que el test verifica.
 *   2. TAMAÑO: un subárbol autocontenido no puede llevarse la MAYORÍA de las
 *      líneas analizadas del repo. Tampoco es un umbral calibrado: es la
 *      definición de "periférico". Si donde vive el grueso del código es lo que
 *      se declara satélite, lo que está mal es la lectura. Salió de medir la
 *      variante por ARCHIVO de este mismo criterio, que marca `lodash.js` — el
 *      89 % de las líneas de su repo, o sea el producto entero.
 *
 * El modo de falla de las dos es el mismo y es el correcto: NO EXCLUIR.
 */

/** La superficie mínima que el criterio 3 necesita de un archivo analizado. */
export interface ArchivoParaSubarbol {
  readonly path: string;
  readonly lines: number;
}

/** Los prefijos de carpeta de una ruta, del más corto al más largo. `"a/b/c.rb"` → `["a", "a/b"]`. Un archivo suelto en la raíz no aporta ninguno: la raíz no es un subárbol del repo, es el repo. */
function carpetasDe(ruta: string): string[] {
  const segmentos = ruta.split("/");
  segmentos.pop();
  const salida: string[] = [];
  for (let i = 1; i <= segmentos.length; i++) salida.push(segmentos.slice(0, i).join("/"));
  return salida;
}

/**
 * El conjunto de carpetas AUTOCONTENIDAS del repo (ver el bloque de arriba).
 * Vacío —la abstención— cuando la compuerta 1 no se cumple.
 *
 * `aristas` son pares `[archivoOrigen, archivoDestino]` YA proyectados a
 * archivo y YA filtrados por confianza; quien llama decide qué considera una
 * arista de código (los detectores de clones pasan `confidentEdges` sin
 * `contains`). Los pares con los dos extremos en el mismo archivo se ignoran:
 * no cruzan ninguna frontera de carpeta.
 *
 * O(A × profundidad + E × profundidad), una pasada por archivo y una por
 * arista — sin construir el árbol de carpetas.
 */
export function subarbolesAutocontenidos(
  archivos: readonly ArchivoParaSubarbol[],
  aristas: Iterable<readonly [string, string]>,
): ReadonlySet<string> {
  const rutas = new Set(archivos.map((a) => a.path));
  const lineasPorCarpeta = new Map<string, number>();
  let lineasTotales = 0;
  for (const archivo of archivos) {
    lineasTotales += archivo.lines;
    for (const carpeta of carpetasDe(archivo.path)) {
      lineasPorCarpeta.set(carpeta, (lineasPorCarpeta.get(carpeta) ?? 0) + archivo.lines);
    }
  }

  const cruzada = new Set<string>();
  const conArista = new Set<string>();
  for (const [desde, hacia] of aristas) {
    if (desde === hacia || !rutas.has(desde) || !rutas.has(hacia)) continue;
    conArista.add(desde);
    conArista.add(hacia);
    const deDesde = new Set(carpetasDe(desde));
    const deHacia = new Set(carpetasDe(hacia));
    // Toda carpeta que contiene a UNO de los dos extremos y no al otro tiene la
    // arista cruzándole la frontera — en un sentido o en el otro, da igual cuál:
    // el criterio exige que no haya NINGUNA.
    for (const carpeta of deDesde) if (!deHacia.has(carpeta)) cruzada.add(carpeta);
    for (const carpeta of deHacia) if (!deDesde.has(carpeta)) cruzada.add(carpeta);
  }
  if (conArista.size * 2 <= rutas.size) return new Set(); // compuerta 1

  const autocontenidas = new Set<string>();
  for (const [carpeta, lineas] of lineasPorCarpeta) {
    if (cruzada.has(carpeta)) continue;
    if (lineas * 2 > lineasTotales) continue; // compuerta 2
    autocontenidas.add(carpeta);
  }
  return autocontenidas;
}

/**
 * El grafo entre archivos, proyectado a pares `[archivoOrigen, archivoDestino]`
 * — el insumo de `subarbolesAutocontenidos` y el único punto de este módulo que
 * toca el grafo. Se declara acá, y no en cada detector, para que el criterio
 * viva entero en un solo lugar (la regla de la Ola Q: extender este módulo, no
 * duplicarlo).
 *
 * QUÉ SE DESCARTA Y POR QUÉ:
 *   · `contains` — es la jerarquía sintáctica (archivo contiene símbolo), no
 *     una relación entre dos archivos; contarla haría que TODO archivo tuviera
 *     aristas y ninguna carpeta fuera autocontenida.
 *   · `ambiguous` — mismo criterio que `detect/inter-file/confident-edges.ts`
 *     aplica a los 17 detectores `inter-file`: "sabemos que hay relación, no
 *     cuál" no es evidencia de una relación con ESTE archivo. Y acá el modo de
 *     falla es el bueno: una ambigua de menos sólo puede hacer que una carpeta
 *     parezca autocontenida, y la compuerta de las DOS direcciones ya exige
 *     que ninguna otra arista la cruce.
 *
 * `graph === null` ⇒ sin pares, y `subarbolesAutocontenidos` se abstiene por su
 * compuerta 1. Un detector que no exige grafo (`duplication`) sigue corriendo
 * igual, sin este criterio: nunca oculta de más por falta de grafo.
 */
export function paresDeArchivoDelGrafo(graph: CodeGraph | null): readonly (readonly [string, string])[] {
  if (!graph) return [];
  const archivoDeNodo = new Map(graph.nodes.map((n) => [n.id, n.file] as const));
  const pares: (readonly [string, string])[] = [];
  for (const arista of graph.edges) {
    if (arista.kind === "contains" || edgeIsAmbiguous(arista)) continue;
    const desde = archivoDeNodo.get(arista.from);
    const hacia = archivoDeNodo.get(arista.to);
    if (desde === undefined || hacia === undefined || desde === hacia) continue;
    pares.push([desde, hacia]);
  }
  return pares;
}

/** `true` si `ruta` cae dentro de alguno de los subárboles autocontenidos. */
export function estaEnSubarbolAutocontenido(ruta: string, autocontenidas: ReadonlySet<string>): boolean {
  if (autocontenidas.size === 0) return false;
  return carpetasDe(ruta).some((carpeta) => autocontenidas.has(carpeta));
}

/**
 * `NoEsProducto` cuando TODOS los archivos que se le pasan viven dentro de
 * subárboles autocontenidos. El "todos" no es prudencia decorativa: si UNA
 * sola de las copias de un clon cae en código cableado al repo, la duplicación
 * llega al producto y el hallazgo es del producto — sacarlo sería esconder un
 * problema real porque sus otras copias están en una muestra.
 */
export function esSubarbolAutocontenido(
  rutas: readonly string[],
  autocontenidas: ReadonlySet<string>,
): NoEsProducto | null {
  if (rutas.length === 0) return null;
  if (!rutas.every((ruta) => estaEnSubarbolAutocontenido(ruta, autocontenidas))) return null;
  const carpetas = [...new Set(rutas.map((ruta) => carpetasDe(ruta).find((c) => autocontenidas.has(c)) ?? ""))];
  return {
    motivo: "subarbol-autocontenido",
    detalle:
      `todas estas copias viven en subárboles sin NI UNA arista de código con el resto del repo ` +
      `(${carpetas.sort().join(", ")}): código que vive en el repo pero no está cableado a él ` +
      `—una muestra, un banco de pruebas, un arnés—, no comportamiento de producto.`,
  };
}
