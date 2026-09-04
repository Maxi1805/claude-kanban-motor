/**
 * Carga los veredictos que el INTEGRADOR de la Ola P juzgó A MANO, leyendo el
 * código citado, uno por uno.
 *
 * POR QUÉ EXISTE. Después del re-muestreo de cierre, ocho kinds quedaron por
 * debajo del piso de n=5 de `gate-logic.ts` — varios porque la ola les mató
 * justo los hallazgos que estaban juzgados. Un kind sin base no tiene
 * precisión: no se le puede prestar la precisión vieja a un detector cuyo
 * criterio cambió. Estos veredictos reponen la base.
 *
 * Usa el I/O del propio proyecto (`verdicts-io.ts`) en vez de escribir el CSV
 * a mano: el escritor canónico es el que fija el orden de columnas y el
 * quoting, y el round-trip está probado (`verdicts-io.test.ts`). Nunca pisa un
 * veredicto ya cargado.
 *
 * Todas las notas empiezan con `ola P, integrador:` para que se recuperen con
 * un grep, igual que las de la Ola O.
 *
 * Uso: npx tsx scripts/p-cargar-veredictos.mts [--dry]
 */
import path from "node:path";

import type { PrecisionVerdictOrPending } from "../src/server/services/detect/precision/types.js";
import { readPrecisionCsv, writePrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";

const DIR = path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");
const PRE = "ola P, integrador: ";

/** id -> [veredicto, nota]. El slug se descubre solo. */
const V: Record<string, readonly [PrecisionVerdictOrPending, string]> = {
  // ── concrete-over-abstraction (n=0 -> 5). Java es el 98 % del volumen nuevo; incluyo el único csharp.
  "concrete-over-abstraction:6ZyRGDMEOvfORSgj": ["falso", PRE +
    "SetGenerators.java USA TestStringSetGenerator EXTENDIÉNDOLO: sus ocho clases anidadas son `class ImmutableSetCopyOfGenerator extends TestStringSetGenerator` (líneas 68, 75, 86, 98, 110, 129, 180). El consejo 'depende de la interfaz TestSetGenerator en vez de la clase' es imposible: no se hereda implementación de una interfaz. Y TestStringSetGenerator NO ES CONCRETA — es `public abstract class TestStringSetGenerator implements TestSetGenerator<String>` (línea 32). " +
    "DEFECTO NOMBRABLE: la prueba nueva de P3 ('B tiene que ser destino de al menos una arista instantiates') la pasa una clase ABSTRACTA porque `new TestStringSetGenerator() { ... }` (subclase anónima, guava-testlib/.../TestsForSetsInJavaUtil.java:189, 231, 248) sí emite instantiates. Instanciar una subclase anónima no prueba que el tipo sea concreto."],
  "concrete-over-abstraction:6wJoua2QX3MgtjVp": ["falso", PRE +
    "Misma forma exacta: MapGenerators.java usa TestStringListGenerator extendiéndolo (`class ImmutableMapKeyListGenerator extends TestStringListGenerator`, líneas 99 y 110), y TestStringListGenerator es abstracta. Ver la nota de concrete-over-abstraction:6ZyRGDMEOvfORSgj para el mecanismo."],
  "concrete-over-abstraction:E2KcAzLBHlxJvjt4": ["falso", PRE +
    "Misma forma, en el árbol espejo android/: MapGenerators.java extiende TestStringMapGenerator, que es abstracta. Tercer caso de la misma familia; los tres son el arnés de conformidad de guava-testlib, donde 'depender de la clase' ES el mecanismo de reuso."],
  "concrete-over-abstraction:KtxeBe6fNNv948FN": ["falso", PRE +
    "DirectedNetworkConnections.java nombra HashBiMap en UN SOLO lugar y es un SITIO DE CONSTRUCCIÓN: `HashBiMap.create(EXPECTED_DEGREE)` (línea 43). El uso posterior ya es por la interfaz: `((BiMap<E, N>) inEdgeMap).values()` en 54, 59 y 64. Construir exige un tipo concreto por definición; no se puede 'depender de BiMap' para crear la instancia. Es la familia que la Vía 3 de esta ola declaró mal preguntada (acusar el sitio de construcción) y que sigue viva."],
  "concrete-over-abstraction:-4FH5-80o_gMUjCo": ["falso", PRE +
    "JTokenWriter.WriteToken hace `if (reader is JTokenReader tokenReader && ...)` (línea 501): es un TEST DE TIPO EN RUNTIME para tomar un camino rápido (clonar el token en vez de leer y escribir, con el comentario que lo dice arriba), con `else base.WriteToken(...)` para el caso general. La interfaz que el hallazgo propone, IJsonLineInfo, es de información de línea/posición y no tiene nada que ver con la operación. Un downcast de optimización con fallback no es acoplamiento a una implementación."],

  // ── coupling-without-abstraction (n=4 -> 5). Go es la celda que la Ola O marcó como el +5.060 %.
  "coupling-without-abstraction:4KadX6x606SdYkX6": ["falso", PRE +
    "cache/dynacache/dynacache.go y cache/filecache/filecache.go comparten los nombres Get/GetOrCreate y nada más. Son dos cachés de naturaleza distinta y NO intercambiables: dynacache es un caché en memoria particionado y GENÉRICO (`func (p *Partition[K, V]) GetOrCreate(key K, create func(key K) (V, error)) (V, error)`, y el método ni siquiera está en el mismo tipo que el que el hallazgo nombra), filecache es un caché en disco con locks por id (`func (c *Cache) GetOrCreate(id string, create func() (io.ReadCloser, error)) (ItemInfo, io.ReadCloser, error)`). Ninguna interfaz común sobre esos dos protocolos sería implementable. Es el residuo que P4 declaró: el vocabulario de métodos de Go es tan corto que un nombre idiomático pasa el corte de ubicuidad del 5 %."],

  // ── empty-catch (n=4 -> 5)
  "empty-catch:KkRMrz4gAsGR8sFN": ["falso", PRE +
    "CollectionRetainAllTester.expectReturnsFalseOrThrows: `catch (UnsupportedOperationException tolerated) { }`. El catch vacío ES la aserción — el nombre del método dice que el contrato admite las dos respuestas (devolver false O lanzar), y el nombre de la variable ('tolerated') lo declara. Misma familia que los otros tres falsos ya juzgados de este kind en guava (`expected`, `acceptable`): arnés de conformidad donde tragar la excepción es el comportamiento verificado."],

  // ── flag-accumulator (n=0 -> 6). Cubro las seis celdas con volumen: go x2, python, ruby, typescript, javascript.
  "flag-accumulator:JYi9VuF0enRKSogL": ["falso", PRE +
    "publisher.go#createTransformerChain es la RAÍZ DE COMPOSICIÓN de una cadena que YA está descompuesta en objetos: cada guarda hace `transformers = append(transformers, urlreplacers.NewAbsURLTransformer(...))`, o sea agrega un decorador YA EXTRAÍDO a una `transform.Chain`. El remedio que el hallazgo propone ('componer objetos que se agregan uno a la vez') es literalmente lo que el código hace. Es exactamente el diagnóstico de la Ola O para este kind — acusar al Decorator ya aplicado, o sea a la solución — sobreviviendo al arreglo de P6, que atacó la otra mitad (texto/datos)."],
  "flag-accumulator:cioyFYHTWKBe03Kq": ["falso", PRE +
    "common/loggers/logger.go#New: `handlers = append(handlers, logg.HandlerFunc(...))` bajo cuatro guardas de opciones. Misma forma que createTransformerChain: es el ensamblado de una cadena de handlers a partir de un struct de opciones, con cada handler ya siendo un objeto propio. Agregar una capa nueva es agregar UN if en UN lugar, que es el estado final al que el refactor apunta."],
  "flag-accumulator:NHup59TaZT2Cba_n": ["falso", PRE +
    "engine/default.py#_setup_dml_or_text_result: `strategy` NO SE ENVUELVE, SE REEMPLAZA. Cada rama le asigna una estrategia DISTINTA y completa (FullyBufferedCursorFetchStrategy, BufferedRowCursorFetchStrategy, _NO_CURSOR_DML) y descarta la anterior; la única mención de la vieja es leerle un campo (`alternate_description=strategy.alternate_cursor_description`). Eso es SELECCIÓN de estrategia, no apilado de decoradores. " +
    "DEFECTO NOMBRABLE: la guarda `wrapsSelf` no distingue 'el lado derecho ENVUELVE el valor viejo' de 'el lado derecho lo MENCIONA y lo tira'."],
  "flag-accumulator:cz0KJLQqvOqu6rFZ": ["falso", PRE +
    "corrector.rb#source_buffer: `source = source.processed_source if source.respond_to?(:processed_source)` y dos líneas más iguales. Es una CADENA DE DESENVOLVIMIENTO por duck typing — el comentario del propio código lo dice ('Duck typing for get to a ::Parser::Source::Buffer') y termina con `raise TypeError` si no llegó. Cada paso BAJA un nivel de envoltura; el smell de Kerievsky es apilar envolturas, o sea la operación inversa."],
  "flag-accumulator:7XEhWEXg98WeqDeY": ["falso", PRE +
    "fastify-adapter.ts#sanitizeUrl: `url = this.removeDuplicateSlashes(url)`, `url = this.trimLastSlash(url)`, `url = url.toLowerCase()`. Es un PIPELINE DE TRANSFORMACIÓN sobre un string, la misma familia TEXTO/DATOS que P6 arregló. " +
    "DEFECTO NOMBRABLE: el filtro de P6 exige un LITERAL DE CADENA en el lado derecho, y acá no hay ninguno (son llamadas a método sobre el propio string). El discriminador correcto es 'el acumulador es un primitivo que se transforma', no 'hay un literal de cadena a la derecha'."],
  "flag-accumulator:-CZOIoDfjRuXRlTI": ["falso", PRE +
    "lodash.js#wrapper: `args = composeArgs(args, partials, holders, isCurried)`, `args = composeArgsRight(...)`, `args = reorder(args, argPos)`. Se transforma la LISTA DE ARGUMENTOS de una llamada, no un objeto con comportamiento. Mismo mecanismo que fastify-adapter.ts#sanitizeUrl, sobre un arreglo en vez de un string, y también sin literal de cadena que lo delate."],

  // ── inappropriate-intimacy (n=0 -> 3). Los TRES supervivientes del kind en los 13 repos: es el máximo posible.
  "inappropriate-intimacy:-7LehBaEXg3Yw00F": ["falso", PRE +
    "engine/interfaces.py es, por diseño, el módulo donde viven los PROTOCOLOS del subsistema (Dialect, Compiled, TypeCompiler declarados o re-exportados ahí), y sus referencias a sql/ están casi todas dentro del bloque `if TYPE_CHECKING:` (línea 48 en adelante). Una anotación de tipo no es conocer el detalle interno del otro: no ejecuta nada y desaparece en runtime. " +
    "DEFECTO NOMBRABLE, y afecta a más de un detector: el grafo NO distingue un import de sólo-tipos (`if TYPE_CHECKING:` en Python, `import type` en TypeScript) de una referencia real, y este detector —que exige breadth >= 3 en las dos direcciones— es el que más se confunde con eso."],
  "inappropriate-intimacy:LDtP-j1K-pZ_Bta0": ["falso", PRE +
    "interfaces.py <-> sql/compiler.py: las 9 referencias de cada lado son, verificadas una por una, imports de sólo-tipos. En interfaces.py están en `if TYPE_CHECKING:` (líneas 58-64: _InsertManyValuesBatch, AggregateOrderByStyle, DDLCompiler, IdentifierPreparer, InsertmanyvaluesSentinelOpts, Linting, SQLCompiler) y en compiler.py también (líneas 145-153: _CoreSingleExecuteParams, Dialect, SchemaTranslateMapType...). Es el par declaración-de-contrato / implementación-del-contrato anotándose mutuamente."],
  "inappropriate-intimacy:gMzkqg_425_9uiOH": ["falso", PRE +
    "interfaces.py <-> sql/elements.py: misma causa que los otros dos supervivientes del kind. Los tres hallazgos vivos del kind en los 13 repos anclan en el MISMO archivo (engine/interfaces.py) y los tres son anotaciones de tipo. El arreglo de definición de P8 (exigir que la intimidad cruce un límite de módulo) sacó los 15 falsos conocidos y dejó tres de una familia que ningún filtro de carpeta puede ver."],

  // ── orphan-file (n=3 -> 5). Cubro las dos celdas más grandes que quedan: javascript y csharp.
  "orphan-file:1IpPf5-2n3dRfNOV": ["falso", PRE +
    "compat/scheduler.js es un PUNTO DE ENTRADA PUBLICADO del paquete: preact/package.json lo declara en `exports` ('./compat/scheduler' -> require: './compat/scheduler.js', líneas 76-79) y en `files` (línea 135). No lo referencia nadie del repo porque su consumidor es quien instala el paquete. El propio `detail` del hallazgo pide descartar exactamente este caso ('confirmá que no sea un punto de entrada'), y la evidencia está en un archivo que el analizador ya lee."],
  "orphan-file:5wPCshy4P-IrrrOQ": ["falso", PRE +
    "ILGeneratorExtensions.cs SÍ se usa: DynamicReflectionDelegateFactory.cs lo llama en las líneas 94, 239, 317, 321, 347 y 355 (`generator.PushInstance(...)`, `generator.BoxIfNeeded(...)`). Son MÉTODOS DE EXTENSIÓN de C#: el nombre de la clase declarante NO APARECE en el sitio de llamada, así que el grafo no puede ver la arista por nombre. " +
    "DEFECTO NOMBRABLE: todo `static class` de extensiones de C# es huérfano por construcción para este detector."],

  // ── parallel-hierarchies (n=1 -> 5). Un caso por lenguaje con volumen.
  "parallel-hierarchies:5kY8WyJHKAWk267Y": ["falso", PRE +
    "SampleElements.java (clases de datos de ejemplo del arnés de tests) y MapMakerInternalMap.java (la implementación del mapa concurrente, con decenas de tipos de entrada anidados) no tienen nada que ver: coinciden en tamaño (7 miembros) y en patrón de ramificación, que es lo único que el detector compara. Es el riesgo que P7 declaró y NO cerró: su arreglo topa los grupos de N>2, pero un PAR exacto en una forma chica sigue siendo indistinguible de una coincidencia."],
  "parallel-hierarchies:9ANGK65naXTD9jc6": ["falso", PRE +
    "hooks.go declara una familia de interfaces chicas de hooks de renderizado (PageProvider, AttributesProvider, HeadingRenderer...) y page.go la familia de la página. Coinciden en 4 miembros y en forma. No hay mantenimiento espejo: agregar un método a PageProvider no obliga a tocar page.go. Misma causa que el caso de guava."],
  "parallel-hierarchies:2D4R4-EmEr3ZUkut": ["falso", PRE +
    "repl-function.ts (la familia de funciones del REPL) contra base-rpc.context.ts (la familia de contextos RPC de microservicios): dos subsistemas sin relación, emparejados por tener 7 miembros y la misma firma de grados. Tercer caso de la misma familia, en un tercer lenguaje."],
  "parallel-hierarchies:Dk671qV52NZKmjTA": ["falso", PRE +
    "interfaces.py#Error es la RAÍZ DE LA JERARQUÍA DE EXCEPCIONES DBAPI (`class Error(Exception)`), y se empareja con la familia de cursor.py (las estrategias de fetch). Cuarto caso, cuarto lenguaje, misma causa: la firma de grados no es isomorfismo."],

  // ── speculative-abstraction (n=2 -> 5). typescript, java y python son el 81 % del volumen.
  "speculative-abstraction:-n7LQfKcOK1rherc": ["falso", PRE +
    "LA ARISTA ES FABRICADA, y el mecanismo está verificado. MulterModule (platform-express) no declara `extends` ni `implements` NADA: es `@Module({}) export class MulterModule` con métodos estáticos {register, registerAsync, createAsyncProviders, createAsyncOptionsProvider}. ClientsModule (microservices) declara {register, registerAsync, createAsyncProviders, createAsyncOptionsProvider, createFactoryWrapper, assignOnAppShutdownHook}. El conjunto de miembros del primero es SUBCONJUNTO del segundo, así que `deriveSatisfiesEdges` —que compara conjuntos de nombres de miembro— emite `ClientsModule satisfies MulterModule`, y este detector lo lee como 'MulterModule es una interfaz con un único implementador'. " +
    "DOS CLASES SIN NINGUNA RELACIÓN QUE COMPARTEN EL VOCABULARIO DE FÁBRICA DEL FRAMEWORK PRODUCEN UNA ABSTRACCIÓN INVENTADA. Es la causa más probable de que este kind pasara de 491 a 830 de censo en esta ola, con `satisfies` multiplicándose (P4 midió 10 -> 648 aristas satisfies sólo en hugo)."],
  "speculative-abstraction:-ognlTMbO8JGrlPp": ["falso", PRE +
    "CommonPattern tiene un único subtipo EN EL ÁRBOL ANALIZADO (JdkPattern), pero su propio javadoc dice para qué existe: 'The subset of the java.util.regex.Pattern API which is used by this package, and also shared with the re2j library. For internal use only.' O sea que el segundo implementador vive en OTRO proyecto (re2j) y el tercero es el super-source de GWT (guava-gwt/src-super/.../base/super/.../Platform.java, que reemplaza Platform.compilePattern). Es un límite de portabilidad deliberado: inline-arlo rompe las dos alternativas. Es la familia 'API pública cuyos implementadores viven afuera del repo' que P3 declaró abierta."],
  "speculative-abstraction:-Jau560Egyh1gi9T": ["falso", PRE +
    "NCLOB (dialects/oracle/types.py) es un TIPO SQL PÚBLICO que el usuario escribe en su modelo (`class NCLOB(sqltypes.Text)`), no una abstracción interna: su 'único implementador' (_OracleUnicodeTextNCLOB, en cx_oracle.py) es el adaptador privado del driver. Quitar la abstracción sacaría el nombre público. Misma familia que CommonPattern: el consumidor de la abstracción está afuera del árbol."],
};

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const slugs = new Set<string>();
  const byId = new Map<string, readonly [PrecisionVerdictOrPending, string]>(Object.entries(V));
  let escritos = 0;
  const noEncontrados = new Set(byId.keys());

  const fs = await import("node:fs");
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".verdicts.csv"))) {
    const file = path.join(DIR, f);
    const rows = readPrecisionCsv(file);
    let tocado = false;
    const out = rows.map((r) => {
      const hit = byId.get(r.id);
      if (!hit) return r;
      noEncontrados.delete(r.id);
      if (r.verdict !== "") {
        console.error(`SALTEADO ${r.id}: ya tenía veredicto "${r.verdict}"`);
        return r;
      }
      tocado = true;
      escritos += 1;
      slugs.add(f);
      return { ...r, verdict: hit[0], note: hit[1] };
    });
    if (tocado && !dry) writePrecisionCsv(file, out);
  }
  console.log(`${escritos} veredicto(s) escrito(s) en ${slugs.size} planilla(s)${dry ? " (DRY)" : ""}`);
  if (noEncontrados.size > 0) console.error(`IDS NO ENCONTRADOS: ${[...noEncontrados].join(", ")}`);
}

main();
