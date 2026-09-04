/**
 * Carga los veredictos que el INTEGRADOR de la Ola S juzgó A MANO, leyendo el
 * código citado, uno por uno.
 *
 * POR QUÉ EXISTE. S1 cambió el CRITERIO de `speculative-abstraction` (un
 * contrato declarado ya no puede ESTABLECER que otro contrato tenga un único
 * implementador). El re-muestreo de cierre (`--n=15 --seed=1805`, la misma
 * semilla de las olas P, Q y R) dejó al kind con 11 veredictos vigentes, los
 * 11 heredados de la población VIEJA: cero filas juzgadas de la población que
 * el arreglo dejó viva, y cero de las 14 que el arreglo dejó ENTRAR en guava
 * al liberar cupo del tope `MAX_FINDINGS_SPEC` (100). No se le presta la
 * precisión vieja a un detector cuyo criterio cambió — la regla que la Ola R
 * dejó escrita —, así que hay que juzgar sobre la población nueva.
 *
 * Las 16 filas de abajo se eligieron por repo en proporción a la población
 * viva (guava 56, sqlalchemy 46, nest 19, newtonsoft-json 6, rubocop 4,
 * preact 1), forzando la inclusión de las que sólo existen DESPUÉS del
 * arreglo (guava `MutableGraph`, guava `ForwardingTestMapGenerator`), que son
 * las que ningún informe de frente pudo mirar.
 *
 * Usa el I/O del propio proyecto (`verdicts-io.ts`) en vez de escribir el CSV
 * a mano, igual que `p-`/`q-`/`r-cargar-veredictos.mts`. Nunca pisa un
 * veredicto ya cargado.
 *
 * Todas las notas empiezan con `ola S, integrador:` para que se recuperen con
 * un grep.
 *
 * Uso: npx tsx scripts/s-cargar-veredictos.mts [--dry]
 */
import path from "node:path";

import type { PrecisionVerdictOrPending } from "../src/server/services/detect/precision/types.js";
import { readPrecisionCsv, writePrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";

const DIR = path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");
const PRE = "ola S, integrador: ";

/** id -> [veredicto, nota]. El slug se descubre solo. */
const V: Record<string, readonly [PrecisionVerdictOrPending, string]> = {
  // ── guava (java). Las dos primeras SÓLO EXISTEN DESPUÉS del arreglo de S1:
  //    el kind está pegado al tope `MAX_FINDINGS_SPEC = 100` en guava, así que
  //    cada hallazgo que S1 sacó dejó entrar a uno del fondo de la cola.
  "speculative-abstraction:2XmZ8tvqzrH8oVPq": ["falso", PRE +
    "guava/android/guava/src/com/google/common/graph/MutableGraph.java: `public interface MutableGraph<N> extends Graph<N>` es la API PÚBLICA " +
    "del paquete `com.google.common.graph` — el tipo que devuelve `GraphBuilder.build()` y el que la documentación le dice al usuario que declare " +
    "(`MutableGraph<Integer> graph = GraphBuilder.undirected().build();`, en el javadoc de `Graph`, `ElementOrder` y `GraphBuilder`). " +
    "`StandardMutableGraph` es `final class` PACKAGE-PRIVATE: es el detalle de implementación que la interfaz existe para esconder. " +
    "HALLAZGO NUEVO DE ESTA OLA: no está en la línea base; entró porque S1 liberó cupo del tope de 100 de guava."],
  "speculative-abstraction:hQ_UjKsZzmPvfVhq": ["falso", PRE +
    "guava/android/guava-testlib/.../DerivedCollectionGenerators.java:287. LA PREMISA DEL HALLAZGO ES LITERALMENTE FALSA: " +
    "`ForwardingTestMapGenerator` tiene DOS subclases en el mismo árbol, no una — `SortedMapSubmapTestMapGenerator` " +
    "(DerivedCollectionGenerators.java:456) y `DescendingTestMapGenerator` (NavigableMapTestSuiteBuilder.java:142, `private static final class` " +
    "anidada). El detector ve sólo la primera. Con dos implementadores el hallazgo no debería emitirse por su propia regla. " +
    "HALLAZGO NUEVO DE ESTA OLA (mismo mecanismo del tope que el anterior)."],
  "speculative-abstraction:6ufIQnMjkSy28iPt": ["falso", PRE +
    "guava/android/guava/src/com/google/common/hash/HashFunction.java: `public interface HashFunction` (`@since 11.0`) es API pública, y decir que " +
    "tiene 'un único implementador' es contarlo mal: `AbstractHashFunction` es el único que la implementa DIRECTAMENTE, pero debajo cuelgan " +
    "`MacHashFunction`, `Crc32cHashFunction`, `AbstractNonStreamingHashFunction`, `Fingerprint2011`, `FarmHashFingerprint64`… " +
    "El detector cuenta implementadores directos sobre una jerarquía profunda."],
  "speculative-abstraction:8uPZh4eLho7aanQC": ["falso", PRE +
    "guava/guava/src/com/google/common/eventbus/SubscriberExceptionHandler.java: `public interface` `@since 16.0`, que el usuario PASA " +
    "por constructor (`EventBus(SubscriberExceptionHandler)`, `AsyncEventBus(Executor, SubscriberExceptionHandler)`). El único implementador del " +
    "repo (`LoggingHandler`) es el DEFECTO; los otros los escribe quien usa la librería. Es una superficie de extensión publicada, no generalidad " +
    "especulativa — misma familia (b) que S2 midió en `unused-symbol`."],
  "speculative-abstraction:KcFviJRWuT2TtPu2": ["falso", PRE +
    "guava/guava/src/com/google/common/base/PatternCompiler.java: el javadoc declara el mecanismo de sustitución en la primera línea — " +
    "'an alternate implementation can be supplied using the java.util.ServiceLoader mechanism'. La abstracción SE USA (Platform la carga por " +
    "ServiceLoader); que en este repo haya un solo proveedor es el caso por defecto, no una generalidad sin uso."],
  "speculative-abstraction:9vqIFrzLN4rc0Zf9": ["falso", PRE +
    "guava/guava/src/com/google/common/util/concurrent/ForwardingExecutorService.java: `public abstract class` `@since 10.0` con " +
    "'/** Constructor for use by subclasses. */ protected ForwardingExecutorService() {}'. La familia `Forwarding*` de guava existe para que la " +
    "SUBCLASEN los usuarios de la librería; contar sólo las subclases internas mide el repo equivocado."],

  // ── sqlalchemy (python). Población INTACTA por el arreglo de S1 (el censo de
  //    python no mueve una sola clave), y nunca medida: es donde vive el ancla
  //    de Prototype.
  "speculative-abstraction:-l4MD266vuoND---": ["falso", PRE +
    "sqlalchemy/lib/sqlalchemy/sql/operators.py:181: `class Operators` es la base documentada de todo el sistema de operadores de SQLAlchemy " +
    "(su propio docstring: 'Usually is used via its most common subclass ColumnOperators'). Tiene un solo hijo DIRECTO " +
    "(`OrderingOperators`) y debajo `ColumnOperators(OrderingOperators)` y toda la jerarquía de expresiones. Mismo error de conteo directo que " +
    "`HashFunction` en java."],
  "speculative-abstraction:2zcgkqgUUeEzZYSP": ["falso", PRE +
    "sqlalchemy/lib/sqlalchemy/dialects/postgresql/psycopg.py:368: `PGDialect_psycopg` NO es una abstracción esperando implementadores — es el " +
    "dialecto SÍNCRONO concreto, registrado y usado tal cual para `postgresql+psycopg`. `PGDialectAsync_psycopg` es la variante async que lo " +
    "extiende. Una clase concreta en uso con una subclase no es generalidad especulativa."],
  "speculative-abstraction:XRWH1vEhAFhWc25t": ["verdadero", PRE +
    "sqlalchemy/lib/sqlalchemy/testing/requirements.py:33 es, ENTERA, `class Requirements:` + `pass`. Su único hijo es `SuiteRequirements`, y el " +
    "grep sobre todo `lib/` no devuelve NINGUNA otra mención del nombre `Requirements` (sólo `SuiteRequirements`/`DefaultRequirements`): no se usa " +
    "como tipo, ni como base de nada más, ni se exporta. El propio módulo le dice al usuario que subclase `SuiteRequirements`, no ésta. " +
    "Es el caso de Fowler sin discusión: una clase base vacía que no aporta nada y se puede borrar."],
  "speculative-abstraction:hAV33ir4oQN7xUDb": ["verdadero", PRE +
    "sqlalchemy/lib/sqlalchemy/orm/state_changes.py:41: el docstring de `_StateChange` DECLARA la generalidad especulativa en sus propias " +
    "palabras — 'The current use case is for the _orm.SessionTransaction class. The _StateChange class itself is agnostic of the " +
    "SessionTransaction class so could in theory be generalized for other systems as well.' Un solo consumidor, y la razón escrita de por qué " +
    "está separada es una hipótesis de reutilización futura. Es exactamente lo que el detector afirma."],
  "speculative-abstraction:AqyXur3CaojDwcKq": ["falso", PRE +
    "sqlalchemy/lib/sqlalchemy/exc.py:255: `CompileError(SQLAlchemyError)` es una excepción pública que se LANZA directamente en todo el " +
    "compilador; `UnsupportedCompilationError` es una especialización con su propio `code`. Una excepción base que se usa tal cual no es una " +
    "abstracción sin implementadores."],

  // ── nest (typescript). Lo que SOBREVIVIÓ al arreglo: los 19 de nest son
  //    todos `class`/`abstract_class` como origen, que es lo que S1 quiso dejar.
  "speculative-abstraction:nMJGKMjWKla82rO8": ["verdadero", PRE +
    "nest/packages/core/router/interfaces/route-params-factory.interface.ts: `IRouteParamsFactory` tiene UNA implementación " +
    "(`RouteParamsFactory`), un solo sitio de consumo (`router-execution-context.ts:68`, `private readonly paramsFactory: IRouteParamsFactory`), " +
    "NO se exporta desde ningún index del paquete (verificado en `packages/core/index.ts` y `packages/core/router/index.ts`) y NO aparece en " +
    "ningún `.spec.ts` (o sea que tampoco se está usando para sustituir en tests). Interfaz interna con un solo implementador y un solo " +
    "consumidor: la indirección no compra nada."],
  "speculative-abstraction:8dJCaRvzocsdcgvk": ["falso", PRE +
    "nest/packages/common/exceptions/intrinsic.exception.ts: `IntrinsicException extends Error {}` está marcada `@publicApi` y su uso NO es " +
    "'ser implementada' sino ser un MARCADOR: tres filtros distintos hacen `!(exception instanceof IntrinsicException)` " +
    "(`base-exception-filter.ts:72`, `base-rpc-exception-filter.ts:34`, `base-ws-exception-filter.ts:112`). Una clase marcador vacía usada por " +
    "`instanceof` está cumpliendo su función."],
  "speculative-abstraction:XhKcHGfoWw50TySH": ["falso", PRE +
    "nest/packages/common/interfaces/hooks/before-application-shutdown.interface.ts: `BeforeApplicationShutdown` se EXPORTA desde " +
    "`packages/common/index.ts:17` — es un hook de ciclo de vida que implementan las clases del USUARIO del framework, y el runtime lo detecta " +
    "estructuralmente (`hasBeforeApplicationShutdownHook`, `before-app-shutdown.hook.ts:16`). El 'único implementador' que el detector encontró " +
    "(`TestInjectable`) es una fixture. Superficie publicada, familia (b)."],

  // ── newtonsoft-json (csharp) y preact (javascript) — para que el desglose por
  //    lenguaje del kind no quede apoyado sólo en java/python/typescript.
  "speculative-abstraction:gtkbjlMJM6bHrosh": ["falso", PRE +
    "newtonsoft-json/Src/Newtonsoft.Json/Serialization/IAttributeProvider.cs: `public interface IAttributeProvider` con una propiedad pública " +
    "SETEABLE que la expone al usuario (`JsonProperty.AttributeProvider { get; set; }`). El único implementador del repo " +
    "(`ReflectionAttributeProvider`) es el defecto; quien usa la librería puede pasar el suyo."],
  "speculative-abstraction:Vt1ubBsW9ghkHUcc": ["falso", PRE +
    "preact/compat/src/internal.d.ts:13: `export interface Component<P, S> extends PreactComponent<P, S>` es una AMPLIACIÓN de tipo del " +
    "`Component` del núcleo con los campos internos que compat necesita (`_childDidSuspend`, `_suspended`, `_temp`, `_container`…). Es un tipo " +
    "estructural interno de un archivo de declaraciones, no una jerarquía de clases: no hay nada que 'implementarla' quiera decir acá, y " +
    "`Suspense` no es su único usuario (Portal usa `_temp`/`_container`)."],
};

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const pendientes = new Set(Object.keys(V));
  const slugs = [
    "click", "cobra", "eslint", "guava", "hugo", "jekyll", "lodash", "nest",
    "newtonsoft-json", "preact", "rubocop", "sqlalchemy", "vueuse", "ck-analyzer",
  ];

  for (const slug of slugs) {
    const file = path.join(DIR, `${slug}.verdicts.csv`);
    const rows = readPrecisionCsv(file);
    let tocadas = 0;
    const nuevas = rows.map((r) => {
      const entrada = V[r.id];
      if (!entrada) return r;
      pendientes.delete(r.id);
      if (r.verdict) {
        console.error(`SALTEADA ${r.id} (${slug}): ya tenía veredicto "${r.verdict}" — no se pisa`);
        return r;
      }
      tocadas++;
      const [verdict, note] = entrada;
      return { ...r, verdict, note };
    });
    if (tocadas > 0) {
      console.log(`${slug}: ${tocadas} veredicto(s)`);
      if (!dry) writePrecisionCsv(file, nuevas);
    }
  }

  if (pendientes.size > 0) {
    console.error(`AVISO: ${pendientes.size} id(s) no se encontraron en ninguna planilla:`);
    for (const id of pendientes) console.error(`  ${id}`);
    process.exitCode = 1;
  }
  console.log(dry ? "(dry run — no se escribió nada)" : "listo");
}

await main();
