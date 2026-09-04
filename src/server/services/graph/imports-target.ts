/**
 * Resolución del especificador crudo de una arista `imports` a un archivo
 * del repo — CONTRATO-F8G.md §7 (F4), extraído VERBATIM de `graph/build.ts`
 * por Cimientos (§6: "extrae verbatim las cuatro funciones de import...
 * sin cambio de comportamiento") para que F4 tenga un archivo propio donde
 * arreglar el cero de Go/Python (CONTRATO-F8G.md §3.3) sin tocar `build.ts`.
 *
 * ARREGLADO ACÁ (F4, CONTRATO-F8G.md §3.3): la extracción (`edges/imports.ts`)
 * siempre funcionó — medido en una ola anterior: 38.711 imports crudos en
 * guava. El cero en Go/Python era de RESOLUCIÓN, en esta capa, por la MISMA
 * familia de bug que ya mordió cuatro veces (el ternario de Ruby, los
 * ternarios de Java/C#, tipos-explicitos en JS, interfaces en JAVA_PROBE):
 * código escrito para la FORMA de un solo lenguaje (JS: `./x`, separador
 * `/`) tratado como si fuera universal. Dos causas exactas, verificadas
 * contra el corpus real antes de escribir el fix:
 *
 *   1. `normalizeRelativeImport` partía SIEMPRE por `/`. Python separa un
 *      import relativo por `.` (`._compat`, no `./_compat`) — con `/` como
 *      único separador, `"._compat".split("/")` da UN solo token, `"._compat"`
 *      completo, que se empuja tal cual como si fuera un nombre de
 *      carpeta/archivo: nunca matchea nada. `relativeSegments` de abajo
 *      decide el separador POR FORMA (¿el especificador contiene `/`? si no,
 *      es estilo Python: cuenta los puntos INICIALES como niveles — uno
 *      "quédate en este directorio", cada uno de más es un `..` — y el resto,
 *      si lo hay, es una ruta punteada dentro de ese nivel) — mismo resultado
 *      BYTE IDÉNTICO para todo especificador que sí contenga `/` (JS/TS/Vue),
 *      ver el test.
 *   2. `resolveImportTarget` cortaba con `if (!spec.startsWith(".")) return
 *      null;` — todo especificador ABSOLUTO (Go: nunca empieza con `.`)
 *      quedaba fuera sin excepción. `absoluteModuleTarget` de abajo agrega
 *      UN caso, acotado por FORMA (no por nombre de lenguaje — este archivo
 *      no recibe el `language` del archivo, y agregarlo tocaría la llamada
 *      congelada de `build.ts`): un especificador con `/` cuyo primer
 *      segmento tiene forma de dominio (contiene un `.`, la convención real
 *      de Go para todo módulo publicado — `github.com/...`, `golang.org/x/...`)
 *      prueba, en orden, sacarle 0..N-1 segmentos iniciales y matchear lo que
 *      queda contra las rutas conocidas con la MISMA regla de `matchKnownPath`
 *      (como mucho una extensión candidata). Exactamente UN acierto en toda
 *      la prueba ⇒ resuelve; cero o dos-o-más ⇒ `null`, nunca se adivina.
 *      Un paquete de biblioteca estándar (`fmt`, `path/filepath`, sin punto
 *      en el primer segmento) queda EXCLUIDO a propósito: una palabra corta
 *      coincidiendo por casualidad con un archivo local del mismo nombre
 *      (`path` vs. un `path.go` real) es exactamente la clase de acierto por
 *      casualidad que este módulo se niega a adivinar. Un import de paquete
 *      que resuelve a un DIRECTORIO con más de un archivo (el caso típico de
 *      un paquete Go real) tampoco se adivina: `matchKnownPath` sólo empareja
 *      archivos exactos (con a lo sumo una extensión), nunca una carpeta.
 *
 * Ninguna otra línea de lógica cambió respecto de la extracción — mismas
 * cuatro firmas exportadas, mismo comportamiento para todo lo que ya
 * resolvía antes de este commit (ver `imports-target.test.ts`, casos
 * "byte-idéntico" marcados como tales).
 *
 * ARREGLADO DESPUÉS (A1, ver ORDEN-DE-ATAQUE.md): `imports = 0` sobre todo
 * TypeScript moderno. Misma familia de bug que arriba (código escrito para
 * la FORMA de un solo estilo, tratado como universal) pero ahora dentro de
 * `matchKnownPath` mismo: sabía agregar una extensión a `base`, nunca sacar
 * la que el especificador ya trae (`./iface.js` con el archivo real
 * `iface.ts` — la convención ESM/NodeNext de este propio repo). Ver el
 * docstring de `matchKnownPath` más abajo para el detalle.
 *
 * `EdgeFacts.kind !== "imports"` / `!isTrustworthyEdgeFact` se filtran en el
 * caller (`build.ts#resolveImportEdges` original, ahora acá) — ver ese
 * archivo para `isTrustworthyEdgeFact`, que no viaja acá porque depende de
 * `EDGE_EXTRACTORS` (un registro que este módulo, sin AST, no necesita
 * conocer más que a través del `EdgeFacts` ya filtrado que recibe).
 *
 * ARREGLADO ACÁ (RAICES.md ⇢ PENDIENTES #1 de esta ola, TABLA-ARISTAS.md
 * §3.2/§4): `imports` en Java (guava) capturaba 15 de ~1.400 relaciones
 * internas resolubles — el agujero absoluto más grande medido en toda la
 * tabla — y en C# (newtonsoft-json) capturaba 0. Medido contra el corpus
 * real (`scripts/probes/`, esta tarea) ANTES de escribir el fix, sobre los
 * ~10.700 imports internos (`com.google.*`) de guava:
 *
 *   - 4.518 (42%) fallaban por AMBIGÜEDAD DE MÓDULO PARALELO: `guava/src/` y
 *     `android/guava/src/` son dos builds Maven/Gradle INDEPENDIENTES que
 *     versionan el MISMO paquete `com.google.common.*` dos veces completas
 *     (`guava/src/com/google/common/base/Preconditions.java` Y
 *     `android/guava/src/com/google/common/base/Preconditions.java`, verificado
 *     por `find`). El emparejo por sufijo ya encontraba los dos candidatos;
 *     lo único que faltaba era un criterio para preferir uno sin adivinar por
 *     nombre de módulo: `nearestBySharedPrefix` de abajo desempata por
 *     CERCANÍA DE DIRECTORIO con el archivo que importa — el mismo principio
 *     que usa la resolución de módulos de Node (camina hacia arriba desde el
 *     importador) y el que aplica un build Maven/Gradle real (cada módulo
 *     compila con SU PROPIO classpath, nunca el de un módulo hermano) — sin
 *     leer ningún `pom.xml`/`build.gradle` ni nombrar "guava" en ningún lado:
 *     un archivo bajo `android/guava/src/...` está, en árbol de directorios,
 *     mucho más cerca de otro archivo bajo `android/guava/src/...` que de uno
 *     bajo `guava/src/...`, y esa cercanía es toda la señal que se necesita.
 *     Ambigüedad GENUINA (mismo grado de cercanía en ambos candidatos, p.ej.
 *     un archivo `guava-gwt/src-super/.../super/...` que no está más cerca de
 *     ningún lado) sigue devolviendo `null` — no se fuerza.
 *   - ~3.800 fallaban porque el especificador nombra un MIEMBRO del archivo
 *     (`import static com.google.common.base.Preconditions.checkNotNull;`) o
 *     un TIPO ANIDADO (`com.google.common.util.concurrent.Service.State`, un
 *     enum anidado dentro de `Service.java`) — el segmento final del
 *     especificador no es un nivel de directorio más, es un símbolo
 *     DECLARADO DENTRO del archivo. `dottedSuffixTarget` de abajo pela
 *     segmentos finales, de a uno, empezando por el especificador completo, y
 *     se DETIENE en el primer nivel que encuentre alguna señal (resuelta o
 *     ambigua) — nunca sigue pelando más allá de un nivel que ya tuvo
 *     candidatos, para no confundir un miembro real con una coincidencia más
 *     corta y ajena. Un piso de 2 segmentos evita pelar hasta una palabra
 *     sola sin señal de jerarquía (mismo criterio que ya aplica
 *     `specAsPath` — hoy fusionado en `dottedSuffixTarget` — para un
 *     especificador de una sola palabra).
 *   - El resto (3.173) son dependencias EXTERNAS reales (`com.google.errorprone.*`,
 *     `com.google.caliper.*`, `com.google.j2objc.*`) sin archivo en el repo:
 *     siguen (correctamente) en `null`.
 *
 * CONFIRMADO corriendo `scripts/dump-graph-census.mts` (el pipeline de
 * producción real, `analyzeRepo` + `onGraph`, no un script descartable)
 * sobre guava tras el fix: **`imports` java 15 → 5.632** (el resto de las
 * aristas de guava — `extends` 463, `implements` 102, `calls` 15.064,
 * `carries` 2.010, `contains` 58.375, `instantiates` 1.312,
 * `invokes-indirect` 41, `references` 55.164 — quedan BYTE IDÉNTICAS al
 * censo previo al fix: cambio quirúrgico, sin tocar ninguna otra arista). El
 * número final (5.632) es menor que la cuenta de imports-facts individuales
 * (~6.700) porque `resolveImportEdges` no deduplica pero `mergeEdges`
 * (`build.ts`) sí colapsa aristas repetidas (from,to) en una con weight
 * acumulado — varios `import`/`import static` desde el mismo archivo al
 * mismo destino cuentan como UNA arista de grafo, no varias.
 *
 * PARA C# había además una TERCERA causa, más profunda que la ya
 * diagnosticada (namespace 1-a-N, `edge-coverage-waivers.json`, entrada
 * `imports/csharp` — la entrada YA SE BORRÓ de ese archivo con este fix, ver
 * más abajo por qué): el viejo `specAsPath` convertía CADA punto del
 * especificador en un `/` y comparaba contra rutas conocidas separadas por
 * `/` — pero un proyecto .NET real no separa el namespace en un directorio
 * por segmento: `Src/Newtonsoft.Json/` es UN SOLO directorio en disco para
 * DOS segmentos de namespace (`Newtonsoft` + `Json`), la convención real de
 * `dotnet new`/Visual Studio de nombrar la carpeta del proyecto como el
 * nombre del assembly. Verificado antes del fix: `resolveImportTarget` con
 * un `using Alias = Newtonsoft.Json.Serialization.ErrorEventArgs;` real
 * (1-a-1, DEBERÍA resolver según el propio comentario de esta sección) daba
 * `null` incluso con el archivo exacto presente en `known` — la waiver de C#
 * hablaba de un problema (1-a-N) mientras un segundo problema (separador
 * equivocado) tapaba incluso los casos 1-a-1 que se creían resueltos.
 * `dottedSuffixTarget`/`dottedBaseOf` comparan en el espacio de PUNTOS (la
 * unidad semántica real del lenguaje: para C#/Java todo separador de
 * namespace ES un punto, sin excepción), no en el de barras — un directorio
 * con un punto en el nombre dejó de ser invisible. CONFIRMADO corriendo
 * `scripts/dump-graph-census.mts` sobre newtonsoft-json real tras el fix:
 * **`imports` csharp 0 → 45** (el resto de las aristas — `calls` 1.690,
 * `carries` 151, `contains` 3.926, `instantiates` 43, `references` 1.520,
 * `satisfies` 120 — queda BYTE IDÉNTICO al censo previo). De esas 45: 44
 * `using` simples de namespace-con-un-solo-archivo + 1 `using Alias =`,
 * sobre 209 `using` internos medidos; el `using` de NAMESPACE pelado con 2+
 * archivos sigue en `null` — comportamiento correcto, no tocado. Sin ningún
 * directorio con punto en su nombre (Java, Python; confirmado también contra
 * click real: `imports` python 46 → 46, BYTE IDÉNTICO), `dottedBaseOf` da
 * BYTE IDÉNTICO al viejo `specAsPath` — no hay regresión posible para esos
 * lenguajes.
 *
 * LA WAIVER `(imports, csharp)` DE `edge-coverage-waivers.json` SE BORRÓ acá
 * — su propio texto lo pedía ("si csharp emite >0 imports, este waiver está
 * vencido y se borra") y con este fix csharp emite >0 (arriba). El límite que
 * documentaba (namespace pelado con 2+ archivos ⇒ ambiguo, `null`) SIGUE
 * SIENDO CORRECTO y sigue pasando — sólo que la compuerta de cobertura mide
 * "¿esta celda emite algo?", no "¿resuelve TODO caso posible?", y ahora sí
 * emite. El razonamiento completo de por qué ese subconjunto queda en `null`
 * vive en el docstring de `dottedSuffixTarget` más abajo, no en el JSON.
 */
import { fileNodeId, type CodeGraphEdge } from "./types.js";
import type { EdgeFacts } from "./edges/types.js";

/**
 * Los "segmentos de nivel" de un especificador relativo, POR FORMA: si
 * contiene `/` es POSIX-style (JS/TS/Vue: `./x`, `../a/b`) y se parte tal
 * cual, byte-idéntico al comportamiento de antes de este commit. Si no
 * contiene `/` es Python (`._compat`, `..pkg.mod`): los puntos INICIALES son
 * niveles (uno = "este directorio", cada uno extra = subir un nivel más) y
 * el resto — si lo hay — es una ruta punteada dentro de ese nivel
 * (`.sub.mod` = `sub/mod` bajo el directorio actual). El caller (`normalize-
 * RelativeImport`, y transitivamente `resolveImportTarget`) sólo llama esto
 * con especificadores que ya empiezan con `.` (gate ya aplicado ahí), así
 * que siempre hay al menos un punto inicial.
 */
function relativeSegments(spec: string): string[] {
  if (spec.includes("/")) return spec.split("/");
  let i = 0;
  while (spec[i] === ".") i++;
  const rest = spec.slice(i);
  const ups: string[] = Array(Math.max(i - 1, 0)).fill("..");
  const names = rest === "" ? [] : rest.split(".");
  return [...ups, ...names];
}

/** Segmentos de `spec` aplicados sobre el directorio de `fromFile`, resolviendo `.`/`..` — mismo estilo POSIX que `build.ts#folderChain`. `null` si `..` se sale por arriba de la raíz del repo. */
export function normalizeRelativeImport(fromFile: string, spec: string): string | null {
  const stack = fromFile.split("/").slice(0, -1);
  for (const part of relativeSegments(spec)) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

/** `base` tal cual, o `base` + EXACTAMENTE una extensión (sin cruzar `/`) presente en `known` — nunca adivina si más de una extensión coincide (ambiguo, se descarta). No toca la extensión que `base` ya trae, si la trae: eso es trabajo de `withoutTrailingExtension` + `matchKnownPath` de nuevo, ver abajo. */
function matchKnownPathAsIsOrExtended(base: string, known: ReadonlySet<string>): string | null {
  if (known.has(base)) return base;
  const prefix = `${base}.`;
  let match: string | null = null;
  for (const p of known) {
    if (!p.startsWith(prefix) || p.slice(prefix.length).includes("/")) continue;
    if (match !== null) return null;
    match = p;
  }
  return match;
}

/**
 * La extensión FINAL del último segmento de `base` (después de la última
 * `/`) recortada — el sentido inverso de lo que ya hace
 * `matchKnownPathAsIsOrExtended` (que sólo sabe AGREGAR una extensión, nunca
 * sacar la que el especificador ya trae). `null` si ese segmento no tiene
 * ningún `.` con al menos un carácter antes (un nombre que EMPIEZA con `.`,
 * como un dotfile, no cuenta: no hay "nombre" del que la extensión sea un
 * sufijo). Prueba de FORMA, no de lista de extensiones conocidas — funciona
 * igual para `.js`, `.mjs`, `.cjs`, `.jsx`, o cualquier otra.
 */
function withoutTrailingExtension(base: string): string | null {
  const slash = base.lastIndexOf("/");
  const name = slash === -1 ? base : base.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return base.slice(0, base.length - (name.length - dot));
}

/**
 * ARREGLADO ACÁ (A1 — el cero de `imports` en TypeScript/ESM moderno, ver
 * ORDEN-DE-ATAQUE.md): `matchKnownPathAsIsOrExtended` probaba `base` tal
 * cual y `base` + una extensión AGREGADA, pero nunca probaba sacarle la
 * extensión que el especificador YA TRAE. En ESM/NodeNext (estilo
 * obligatorio de este mismo repo) el especificador de un import relativo
 * incluye la extensión de SALIDA (`./iface.js`) aunque el archivo en disco
 * sea `iface.ts` — `base` llega acá como `".../iface.js"` y ni el match
 * exacto ni el de "agregar extensión" lo alcanzan nunca (agregar UNA
 * extensión más a algo que ya termina en `.js` no da `.ts`). Se prueba
 * PRIMERO `base` tal cual (prioridad al match exacto/agregado, byte-idéntico
 * al comportamiento de antes) y sólo si eso falla se intenta con la
 * extensión del propio especificador recortada — así un archivo `.js` REAL
 * (CommonJS conviviendo con TS) sigue matcheando por la vía de siempre, sin
 * pasar por acá. La misma disciplina de "nunca adivinar" aplica en el
 * segundo intento: si el nombre pelado matchea DOS candidatos (p.ej. tanto
 * `iface.ts` como `iface.tsx`), `matchKnownPathAsIsOrExtended` ya devuelve
 * `null` por ambigüedad y esta función también.
 */
export function matchKnownPath(base: string, known: ReadonlySet<string>): string | null {
  const direct = matchKnownPathAsIsOrExtended(base, known);
  if (direct !== null) return direct;
  const stripped = withoutTrailingExtension(base);
  return stripped === null ? null : matchKnownPathAsIsOrExtended(stripped, known);
}

/**
 * CONTRATO-F8G.md §3.3, punto 2. Especificador ABSOLUTO (no relativo) con
 * forma de import de módulo Go — `host.tld/vendor/pkg/...`, la convención
 * real de todo módulo Go publicado fuera de la biblioteca estándar. Acotado
 * por FORMA, no por nombre de lenguaje (esta función no sabe qué lenguaje
 * produjo `spec` — ver el docstring del módulo):
 *
 *   - Sin `/` ⇒ nunca (un import Python/Java/C# absoluto separa por `.`,
 *     jamás por `/`; tratarlo acá arriesgaría, p.ej., que `collections.abc`
 *     se compare contra rutas del repo sin ninguna razón para hacerlo).
 *   - Primer segmento sin un `.` ⇒ nunca — biblioteca estándar de Go
 *     (`fmt`, `path/filepath`) o nombre corto de paquete: adivinar que
 *     coincide con un archivo local del mismo nombre por casualidad es
 *     exactamente lo que este módulo se niega a hacer.
 *
 * Mecanismo: probar, en orden, sacar 0..N-1 segmentos iniciales (el prefijo
 * de hosting/vendor, incluido un sufijo de versión de módulo — `.../v3/log`,
 * convención real de Go Modules v2+, verificada contra el corpus: se
 * atraviesa sola, con el resto del algoritmo, al sacar 4 segmentos en vez de
 * 3 — ningún caso especial para `vN`) y matchear lo que queda contra `known`
 * con la MISMA regla de `matchKnownPath` (como mucho una extensión
 * candidata) DE DOS FORMAS: tal cual, o con `/<último segmento>` agregado —
 * la convención real de Go de que un paquete llamado `log` suele tener
 * adentro un archivo `log.go` con ese mismo nombre (`log/log.go`,
 * `extractors/extractors.go`, medido en el corpus), mismo rol que el
 * fallback `/index` ya usa para imports relativos, aplicado acá al ÚLTIMO
 * segmento del sufijo en vez de a un nombre de archivo fijo (Go no tiene
 * convención de "índice", tiene la de "el paquete se llama como su archivo
 * principal"). Se acumulan TODOS los aciertos distintos de toda la prueba
 * (ambas formas, todos los `k`) — exactamente uno ⇒ resuelve; cero o
 * dos-o-más ⇒ `null` (nunca se adivina entre variantes de cuántos segmentos
 * son el prefijo, ni entre "archivo exacto" y "archivo con nombre de
 * paquete"). Un import de PAQUETE que no cae en ninguna de las dos
 * convenciones (el caso típico: un directorio con muchos archivos, ninguno
 * llamado como el paquete — `doc/` en cobra) no encuentra acá ningún
 * acierto y queda `null`, brecha declarada, no adivinada.
 */
function absoluteModuleTarget(spec: string, known: ReadonlySet<string>): string | null {
  if (!spec.includes("/")) return null;
  const segments = spec.split("/");
  if (!segments[0]!.includes(".")) return null;
  const hits = new Set<string>();
  for (let k = 0; k < segments.length; k++) {
    const rest = segments.slice(k);
    const suffix = rest.join("/");
    if (suffix === "") continue;
    const direct = matchKnownPath(suffix, known);
    if (direct !== null) hits.add(direct);
    const packageName = rest[rest.length - 1]!;
    const named = matchKnownPath(`${suffix}/${packageName}`, known);
    if (named !== null) hits.add(named);
  }
  return hits.size === 1 ? [...hits][0]! : null;
}

/**
 * Cuántos segmentos de DIRECTORIO (no de archivo: el último segmento de cada
 * ruta, el nombre de archivo, se descarta) comparten dos rutas, contados
 * desde la raíz del repo hacia adentro. La métrica de "cercanía" que
 * desempata cuando el mismo sufijo matchea DOS O MÁS archivos: nunca por
 * nombre de módulo o de lenguaje, sólo por FORMA de la ruta — el mismo
 * principio que ya usa la resolución de módulos de Node (camina desde el
 * importador hacia arriba) y el que aplica cualquier build Maven/Gradle real
 * (cada módulo compila con SU PROPIO classpath, nunca el de un módulo
 * hermano), sin leer ningún descriptor de build ni nombrar ningún módulo.
 */
function sharedDirPrefixLength(fromFile: string, candidate: string): number {
  const a = fromFile.split("/").slice(0, -1);
  const b = candidate.split("/").slice(0, -1);
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * De un conjunto de candidatos YA SABIDO no-único (2+), el/los que comparten
 * la MAYOR cantidad de segmentos de directorio con `fromFile` — ver
 * `sharedDirPrefixLength`. Devuelve el candidato si hay UNO SOLO a esa
 * distancia máxima; `null` si dos o más empatan (ambigüedad GENUINA — ningún
 * candidato está más cerca que otro del archivo que importa, no hay más señal
 * que extraer sin adivinar). Nunca se llama con 0 o 1 candidato: esos casos
 * los resuelve el caller directamente, sin necesidad de esta función.
 */
function nearestBySharedPrefix(fromFile: string, candidates: ReadonlySet<string>): string | null {
  let bestLen = -1;
  let bestSet = new Set<string>();
  for (const c of candidates) {
    const len = sharedDirPrefixLength(fromFile, c);
    if (len > bestLen) {
      bestLen = len;
      bestSet = new Set([c]);
    } else if (len === bestLen) {
      bestSet.add(c);
    }
  }
  return bestSet.size === 1 ? [...bestSet][0]! : null;
}

/* ────────────────────────────────────────────────────────────────────────
 * ÍNDICE DE SUFIJOS DEL CONJUNTO `known` — memoizado por identidad del Set
 *
 * POR QUÉ EXISTE (Ola Y, Y5 — medido, no estimado). `dottedSuffixHits` y
 * `matchKnownPathSuffix` recorrían el conjunto ENTERO de rutas del repo
 * —y `dottedSuffixHits` además re-derivaba la forma punteada de cada una
 * con `dottedBaseOf` (un `slice` + `split` + `join` por ruta)— UNA VEZ POR
 * CADA NIVEL DE PELADO DE CADA ESPECIFICADOR. En `corpus/guava` eso es
 * ~1.971 rutas × ~3.800 especificadores × hasta 6 peels, dos veces
 * (`resolveImportEdges` y `classifyImportSpecifiers`): `node --cpu-prof`
 * sobre un análisis completo de guava mide **`dottedBaseOf` en 220,0 s de
 * 568,5 s — el 38,7 % del análisis entero**, y `dottedSuffixHits` en
 * 234,7 s (41,3 %) contando sus llamados. Es exactamente el antipatrón que
 * `ola-y/CONTEXTO.md` §5 prohíbe: un costo de REPO ENTERO pagado por ítem
 * en vez de una sola vez.
 *
 * QUÉ CONSERVA. El índice guarda, para cada ruta conocida, TODOS sus
 * sufijos ALINEADOS AL SEPARADOR — en espacio de puntos (la forma de
 * `dottedBaseOf`) y en espacio de barras (la de `matchKnownPathSuffix`). Un
 * sufijo alineado es exactamente el predicado que las dos funciones ya
 * evaluaban: `db === suffix || db.endsWith(`.${suffix}`)` es cierto si y
 * sólo si `suffix` es la concatenación de los últimos k segmentos de `db`
 * (el carácter anterior a `suffix` dentro de `db` es el separador, así que
 * el corte cae en un borde de segmento). Mismo conjunto, mismo orden de
 * inserción (se recorre `known` en su propio orden), misma respuesta.
 *
 * POR QUÉ LA CLAVE ES EL `Set`. Los dos callers de producción
 * (`resolveImportEdges`, `classifyImportSpecifiers`) construyen `known`
 * UNA vez y sólo lo LEEN — que es lo que hace que el índice se amortice
 * entre todos los especificadores de la corrida. `WeakMap` ⇒ la entrada
 * muere con el conjunto, cero retención entre corridas; misma disciplina
 * que `detect/inter-file/confident-edges.ts#CACHE`. Y se guarda el `size`
 * con el que se construyó: si alguien alguna vez agrega o saca rutas de un
 * conjunto ya indexado, el índice se rehace en vez de responder viejo.
 * LÍMITE DECLARADO de ese guardián, para no venderlo por más de lo que es:
 * detecta cualquier cambio de CARDINALIDAD, no un reemplazo que agregue y
 * saque la misma cantidad de rutas. Ningún caller lo hace —los dos de
 * producción construyen el conjunto y sólo lo LEEN— y verificarlo de verdad
 * costaría recorrer el conjunto en cada consulta, que es justo el costo que
 * este índice existe para sacar.
 * ──────────────────────────────────────────────────────────────────────── */

interface SuffixIndex {
  /** `known.size` al construirlo — ver la nota de invalidación de arriba. */
  readonly size: number;
  /** sufijo punteado → rutas cuya `dottedBaseOf` es ese sufijo o termina en `.<sufijo>`. */
  readonly dotted: ReadonlyMap<string, ReadonlySet<string>>;
  /** sufijo con barras → rutas cuya forma sin extensión es ese sufijo o termina en `/<sufijo>`. */
  readonly slashed: ReadonlyMap<string, ReadonlySet<string>>;
}

const SUFFIX_INDEX_CACHE = new WeakMap<ReadonlySet<string>, SuffixIndex>();
const NO_HITS: ReadonlySet<string> = new Set<string>();

function suffixIndexOf(known: ReadonlySet<string>): SuffixIndex {
  const hit = SUFFIX_INDEX_CACHE.get(known);
  if (hit && hit.size === known.size) return hit;

  const dotted = new Map<string, Set<string>>();
  const slashed = new Map<string, Set<string>>();
  const add = (into: Map<string, Set<string>>, key: string, path: string): void => {
    const bucket = into.get(key);
    if (bucket) bucket.add(path);
    else into.set(key, new Set([path]));
  };

  for (const p of known) {
    // La forma punteada la sigue definiendo `dottedBaseOf`, no una copia de su
    // cuerpo: si esa definición cambia, el índice cambia con ella.
    const dottedSegments = dottedBaseOf(p).split(".");
    for (let k = 0; k < dottedSegments.length; k++) add(dotted, dottedSegments.slice(k).join("."), p);
    // Espacio de BARRAS: la MISMA "forma sin extensión" que `matchKnownPathSuffix` comparaba.
    const slashSegments = (p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : p).split("/");
    for (let k = 0; k < slashSegments.length; k++) add(slashed, slashSegments.slice(k).join("/"), p);
  }

  const index: SuffixIndex = { size: known.size, dotted, slashed };
  SUFFIX_INDEX_CACHE.set(known, index);
  return index;
}

/**
 * `suffix` (sin extensión) contra el FINAL de cada ruta conocida — a
 * diferencia de `matchKnownPath` (que exige coincidencia desde el INICIO de
 * la ruta), esto encuentra `"com/foo/Bar"` dentro de
 * `"guava/src/com/foo/Bar.java"` sin conocer el prefijo `"guava/src/"` de
 * antemano. El límite de segmento es obligatorio (`/` justo antes, o
 * coincidencia con la ruta completa) para no confundir `"oo/Bar"` con
 * `"foo/Bar"` a mitad de un nombre de carpeta. Como mucho una extensión
 * candidata por ruta candidata — misma disciplina que `matchKnownPath` — y
 * EXACTAMENTE una ruta candidata en total; cualquier otra cosa es `null`.
 *
 * SIN CAMBIOS respecto de antes de este fix — a propósito. La causa medida
 * (guava real: `guava/src/...` y `android/guava/src/...` duplican el mismo
 * paquete) es de especificador PUNTEADO (Java `import`, nunca contiene `/`);
 * el desempate por cercanía de directorio (`nearestBySharedPrefix`) vive en
 * `dottedSuffixTarget`, la rama que SÍ mide el hueco. Esta función (la rama
 * `/`: Ruby `require`, fallback de Go) no tiene medición que justifique
 * tocarla en este frente — extender el desempate acá sin evidencia sería
 * exactamente el tipo de cambio no verificado que este proyecto evita.
 */
function matchKnownPathSuffix(suffix: string, known: ReadonlySet<string>): string | null {
  const hits = suffixIndexOf(known).slashed.get(suffix) ?? NO_HITS;
  return hits.size === 1 ? [...hits][0]! : null;
}

/**
 * La forma "sin extensión" de una ruta conocida, en el ESPACIO DE PUNTOS —
 * cada `/` se lee como si fuera un `.` más. ARREGLADO ACÁ (ver el docstring
 * del módulo): un especificador punteado (Java `com.foo.Bar`, C# `App.
 * Services.OrderService`) tiene el PUNTO como único separador semántico real
 * de todo el lenguaje — pero el directorio físico que lo aloja no siempre
 * separa un nivel de namespace por carpeta: un proyecto .NET real nombra su
 * propia carpeta raíz como el ASSEMBLY completo (`Src/Newtonsoft.Json/` es UN
 * SOLO directorio para DOS segmentos de namespace, `Newtonsoft` + `Json`,
 * convención de `dotnet new`/Visual Studio, verificada en el corpus).
 * Comparar en espacio de puntos (convertir la BARRA de la ruta conocida, no
 * el punto del especificador) hace que este caso matchee igual que el que sí
 * separa por carpeta — sin depender de ninguna lista de proyectos ni nombrar
 * C#: para cualquier lenguaje SIN puntos en sus nombres de directorio (Java,
 * Python, el propio guava) esto da BYTE IDÉNTICO a convertir el especificador
 * a barras, porque no hay ningún punto "de directorio" que mueva el resultado.
 */
function dottedBaseOf(path: string): string {
  const base = path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : path;
  return base.split("/").join(".");
}

/**
 * Los candidatos (rutas conocidas completas, no su forma punteada) cuya
 * versión punteada (`dottedBaseOf`) termina exactamente en `.suffix`, o es
 * `suffix` entera. Extraído de `dottedSuffixTarget` para que el bucle de pelado
 * de abajo pueda distinguir "cero candidatos en este nivel, seguir pelando"
 * de "hubo candidatos pero no se pudieron desempatar, PARAR acá" sin repetir
 * la recolección.
 */
function dottedSuffixHits(suffix: string, known: ReadonlySet<string>): ReadonlySet<string> {
  // Mismo predicado de antes (`db === suffix || db.endsWith(`.${suffix}`)`),
  // leído de un índice construido UNA vez por conjunto `known` en vez de
  // recorrer y re-derivar el repo entero por cada sufijo — ver `suffixIndexOf`.
  return suffixIndexOf(known).dotted.get(suffix) ?? NO_HITS;
}

/**
 * A7 (Ola 9, F6; ENSANCHADO en la Ola 11b a los especificadores con `/`;
 * REESCRITO acá — ver el docstring del módulo para las dos causas medidas) —
 * especificador ABSOLUTO PUNTEADO (sin `/`: Java `com.foo.Bar`, C# `App.
 * Services.OrderService`, Python `click.types`) contra el FINAL de las rutas
 * conocidas, en espacio de puntos (`dottedSuffixHits`/`dottedBaseOf`).
 *
 * PELADO DE SEGMENTO FINAL — la causa nueva medida en guava (~3.800 imports):
 * el especificador puede nombrar no el ARCHIVO sino un MIEMBRO declarado
 * DENTRO de él — un import estático (`import static com.google.common.base.
 * Preconditions.checkNotNull;`, el especificador entero es `Clase.método`) o
 * un tipo anidado (`com.google.common.util.concurrent.Service.State`, un enum
 * anidado dentro de `Service.java`) — casos donde el segmento final del
 * especificador no es un nivel de directorio más, es un símbolo que cuelga
 * del archivo. Se prueba, en orden, el especificador completo y luego cada
 * prefijo más corto (pelando un segmento final por vez) hasta un PISO de 2
 * segmentos (un especificador de una sola palabra no tiene señal de
 * jerarquía — mismo criterio que ya rechazaba esto antes de este fix) — y se
 * PARA en el PRIMER nivel que tenga algún candidato, sin importar si ese
 * candidato resuelve único o queda ambiguo: un nivel más corto que matchee
 * por casualidad, DESPUÉS de que un nivel más largo ya tuvo señal, sería una
 * coincidencia ajena, no un miembro real — nunca se sigue pelando más allá de
 * eso.
 *
 * Cubre, con UN solo mecanismo y sin una rama por lenguaje:
 *   - Java `import com.foo.Bar;` → `com/foo/Bar` (peel de 0) → `src/main/java/com/foo/Bar.java`.
 *   - Java `import static com.foo.Bar.CONST;` → falla en peel 0 (`Bar/CONST`
 *     no es ruta de nadie) → peel 1 (`com/foo/Bar`) resuelve.
 *   - C# `using static App.Services.OrderService;` / `using Alias = App.
 *     Services.OrderService;` (formas que nombran un TIPO, 1-a-1) → resuelve
 *     en peel 0, ahora también cuando la carpeta del proyecto tiene un punto
 *     en el nombre (ver `dottedBaseOf`).
 *   - Python `import click.types` → `src/click/types.py`.
 *
 * AMBIGÜEDAD GENUINA (2+ candidatos en `dottedSuffixHits` que ni el emparejo
 * exacto ni el desempate por cercanía de directorio logran reducir a uno)
 * sigue en `null`, nunca se adivina — igual que antes de este fix, sólo que
 * ahora la ambigüedad genuina es MENOS frecuente porque `nearestBySharedPrefix`
 * ya resolvió el caso más común (dos builds paralelos del mismo paquete).
 *
 * C# `using System.Foo;` en su forma SIMPLE (namespace pelado) sigue siendo
 * DISTINTO en la gramática (namespace, no archivo — un `using` así trae a
 * alcance TODO un namespace, que TÍPICAMENTE vive en más de un archivo a la
 * vez) — el resultado esperado y correcto sigue siendo `null` la enorme
 * mayoría de las veces (namespace con múltiples archivos ⇒ ambiguo, ninguna
 * cercanía de directorio desempata entre archivos HERMANOS del mismo
 * namespace, que están todos a la MISMA distancia entre sí) — no una brecha,
 * la disciplina de "nunca adivinar" funcionando como debe frente a una
 * relación que genuinamente no es 1-a-1 — el mismo límite que documentaba el
 * waiver `(imports, csharp)` de `tests/golden/edge-coverage-waivers.json`
 * (BORRADO con este fix: la celda ya emite `imports > 0`, que es todo lo que
 * esa compuerta mide — ver el docstring del módulo) y no se fuerza: un
 * namespace con EXACTAMENTE un archivo real en el repo, o un `using` que
 * nombra un TIPO en vez de un namespace, ya no dependen de que la carpeta
 * del proyecto separe cada segmento en su propia carpeta. Medido contra
 * newtonsoft-json real: ver el docstring del módulo y `imports-target.test.ts`.
 */
function dottedSuffixTarget(spec: string, known: ReadonlySet<string>, fromFile: string): string | null {
  const segments = spec.split(".");
  for (let end = segments.length; end >= 2; end--) {
    const suffix = segments.slice(0, end).join(".");
    const hits = dottedSuffixHits(suffix, known);
    if (hits.size === 0) continue;
    if (hits.size === 1) return [...hits][0]!;
    return nearestBySharedPrefix(fromFile, hits);
  }
  return null;
}

/**
 * Especificador ABSOLUTO SIN `.` inicial, leído por FORMA (nunca por nombre
 * de lenguaje — este módulo no recibe el `language` del archivo):
 *
 *   - Contiene `/` ⇒ ya ES una ruta POSIX, la convención de "ruta de carga"
 *     (`$LOAD_PATH` de Ruby, classpath de Go tras `absoluteModuleTarget`):
 *     Ruby `require "app/document"`, Go `github.com/spf13/cobra` (fallback).
 *     Emparejo por sufijo en espacio de BARRAS (`matchKnownPathSuffix`).
 *   - Si no, contiene `.` ⇒ separador punteado (Java, C#, Python) — emparejo
 *     por sufijo en espacio de PUNTOS, con pelado de miembro
 *     (`dottedSuffixTarget`, ver su docstring para las dos causas nuevas que
 *     arregla).
 *   - Ninguno de los dos ⇒ `null`: una sola palabra no tiene señal de
 *     jerarquía y adivinar que `"List"` es `List.java` por sí solo es
 *     exactamente el acierto por casualidad que este módulo se niega a hacer.
 *
 * Los dos casos con separador son EXCLUYENTES a propósito: `github.com/spf13/
 * cobra` tiene `/` Y `.`, y leerlo también en espacio de puntos daría
 * `github/com/spf13/cobra`, una ruta que no existe en ningún repo. El `/`
 * manda — y de cualquier forma esta función se prueba DESPUÉS de
 * `absoluteModuleTarget` (que sabe sacar el prefijo de hosting del propio
 * especificador, algo que ningún emparejo por sufijo puede hacer), así que
 * ningún caso de Go que ya resolvía cambia de destino.
 */
function absoluteSuffixTarget(spec: string, known: ReadonlySet<string>, fromFile: string): string | null {
  if (spec.includes("/")) return matchKnownPathSuffix(spec, known);
  if (spec.includes(".")) return dottedSuffixTarget(spec, known, fromFile);
  return null;
}

/** Especificadores relativos contra el archivo que importa, o absolutos con forma de módulo Go (prefijo de hosting recortable) o de RUTA DE CARGA (tramo final de la ruta real, separador `/` o `.`) contra la raíz del repo — todos sobre el conjunto de rutas de ESTA corrida. `null` = no se adivina (paquete externo, alias, o ambiguo). */
export function resolveImportTarget(fromFile: string, spec: string, known: ReadonlySet<string>): string | null {
  if (!spec.startsWith(".")) return absoluteModuleTarget(spec, known) ?? absoluteSuffixTarget(spec, known, fromFile);
  const base = normalizeRelativeImport(fromFile, spec);
  if (base === null) return null;
  return matchKnownPath(base, known) ?? matchKnownPath(`${base}/index`, known);
}

/**
 * Todas las aristas `imports` resueltas de un conjunto de archivos ya
 * filtrado a `EdgeFacts` de confianza (`kind === "imports"` verificado
 * contra `EDGE_EXTRACTORS` por el caller) — nunca cacheado por archivo, ver
 * el docstring de `build.ts`'s bloque P4, punto B: depende del CONJUNTO de
 * archivos, no de qué declara cada uno.
 */
/**
 * LOS ESPECIFICADORES QUE NO RESOLVIERON — Ola P (P2), pedido de N9 (Ola O)
 * abierto desde entonces.
 *
 * `resolveImportEdges` de abajo tiene los dos conjuntos en la mano y TIRA la
 * mitad no resuelta: un especificador que no matchea ningún archivo del repo
 * simplemente no produce arista, y con eso desaparece la única evidencia de
 * que este archivo importa algo de AFUERA. Esa evidencia es la mitad que
 * queda de la colisión de nombres que N9 midió en `sqlalchemy`: `Any`
 * (CM=3.493), `int` (524), `Tuple` (432), `Sequence` (403) y `annotations`
 * (228) resuelven todos a un homónimo local del propio repo, porque el
 * nombre viene bindeado por `from typing import Any` y el grafo no tiene
 * cómo saber que `typing` no es suyo.
 *
 * EL DISCRIMINADOR, textual de N9: *"un nombre bindeado por un import de un
 * especificador NO resuelto no puede ser un símbolo del repo, salvo que ese
 * mismo especificador aparezca también como resuelto en otro archivo — que es
 * justo lo que distingue `typing` de `@nestjs/common`"*. Por eso este
 * clasificador devuelve, además de los dos conjuntos por archivo, el conjunto
 * REPO-COMPLETO de especificadores que resolvieron en algún lado
 * (`resolvedSomewhere`): sin él, una regla que trate a todo no-resuelto como
 * externo borra las 229 aristas correctas de `Injectable`, las 178 de
 * `Controller` y las 282 de `Type` en nest (alias de monorepo, adentro del
 * repo) y todo `import a.b.C;` de guava — el modo de falla que N9 midió y por
 * el que dejó el arreglo sin aterrizar.
 *
 * Sin heurística y sin vocabulario: usa `resolveImportTarget`, la MISMA
 * función que produce las aristas reales. "No resuelto" acá significa
 * exactamente "esa función devolvió `null`", ni más ni menos — nunca "parece
 * un paquete externo".
 */
export interface ImportSpecifierClassification {
  /** Por archivo, los especificadores crudos DISTINTOS, en el orden en que aparecen. */
  readonly byFile: ReadonlyMap<string, { readonly resolved: readonly string[]; readonly unresolved: readonly string[] }>;
  /** Todo especificador que resolvió a un archivo del repo desde ALGÚN archivo. Ver "EL DISCRIMINADOR" arriba. */
  readonly resolvedSomewhere: ReadonlySet<string>;
}

export function classifyImportSpecifiers(
  files: readonly { readonly path: string; readonly edges: readonly EdgeFacts[] }[],
): ImportSpecifierClassification {
  const known = new Set(files.map((f) => f.path));
  const byFile = new Map<string, { readonly resolved: readonly string[]; readonly unresolved: readonly string[] }>();
  const resolvedSomewhere = new Set<string>();
  for (const f of files) {
    const resolved: string[] = [];
    const unresolved: string[] = [];
    const seen = new Set<string>();
    for (const ef of f.edges) {
      if (seen.has(ef.toName)) continue;
      seen.add(ef.toName);
      if (resolveImportTarget(f.path, ef.toName, known) === null) unresolved.push(ef.toName);
      else {
        resolved.push(ef.toName);
        resolvedSomewhere.add(ef.toName);
      }
    }
    if (resolved.length > 0 || unresolved.length > 0) byFile.set(f.path, { resolved, unresolved });
  }
  return { byFile, resolvedSomewhere };
}

export function resolveImportEdges(
  files: readonly { readonly path: string; readonly edges: readonly EdgeFacts[] }[],
): CodeGraphEdge[] {
  const known = new Set(files.map((f) => f.path));
  const edges: CodeGraphEdge[] = [];
  for (const f of files) {
    for (const ef of f.edges) {
      const target = resolveImportTarget(f.path, ef.toName, known);
      if (target === null || target === f.path) continue;
      edges.push({ from: fileNodeId(f.path), to: fileNodeId(target), kind: "imports", provenance: "resolved", weight: 1 });
    }
  }
  return edges;
}
