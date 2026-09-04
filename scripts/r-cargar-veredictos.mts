/**
 * Carga los veredictos que el INTEGRADOR de la Ola R juzgó A MANO, leyendo el
 * código citado, uno por uno.
 *
 * POR QUÉ EXISTE. Cuatro frentes (R4, R5, R6) bajaron el volumen de siete
 * kinds entre un 56 % y un 100 %. El re-muestreo de cierre (`--n=15
 * --seed=1805`, la misma semilla de las olas P y Q) dejó a CUATRO de esos
 * kinds por debajo del piso de n=5 de `gate-logic.ts`: `orphan-file` (n=1),
 * `coupling-without-abstraction` (n=1), `feature-envy-inter` (n=4) y
 * `scattered-instantiation` (n=0). Un kind sin base no tiene precisión, y no
 * se le presta la precisión vieja a un detector cuyo CRITERIO cambió — que es
 * exactamente lo que pasó con estos cuatro.
 *
 * Usa el I/O del propio proyecto (`verdicts-io.ts`) en vez de escribir el CSV
 * a mano, igual que `p-cargar-veredictos.mts` y `q-cargar-veredictos.mts`.
 * Nunca pisa un veredicto ya cargado.
 *
 * Todas las notas empiezan con `ola R, integrador:` para que se recuperen con
 * un grep.
 *
 * Uso: npx tsx scripts/r-cargar-veredictos.mts [--dry]
 */
import path from "node:path";

import type { PrecisionVerdictOrPending } from "../src/server/services/detect/precision/types.js";
import { readPrecisionCsv, writePrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";

const DIR = path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");
const PRE = "ola R, integrador: ";

/** id -> [veredicto, nota]. El slug se descubre solo. */
const V: Record<string, readonly [PrecisionVerdictOrPending, string]> = {
  // ── orphan-file. R4 le sacó el filtro `confidentEdges`: 64 -> 21. El criterio
  //    cambió, así que la base vieja no vale y hay que reponerla sobre la
  //    poblacion nueva.
  "orphan-file:JHtHqbFGkRYyiYVs": ["falso", PRE +
    "newtonsoft-json/Src/Newtonsoft.Json/FormatterAssemblyStyle.cs declara `public enum FormatterAssemblyStyle`, y el repo SÍ lo referencia: " +
    "`JsonSerializerSettings.cs:202` (`public FormatterAssemblyStyle TypeNameAssemblyFormat`) y `JsonSerializer.cs:202` lo usan como TIPO declarado de " +
    "una propiedad pública, con un cast `(FormatterAssemblyStyle)TypeNameAssemblyFormatHandling` en el getter. La afirmación del hallazgo ('no tiene " +
    "ninguna arista con el resto del repo') es literalmente falsa. La causa es que un `enum` no produce un nodo `class-like` que la cascada pueda " +
    "resolver: es el mismo hueco de `SymbolFamily` que la Ola Q dejó pedido (CONTRATO/IMPLEMENTACIÓN) visto desde otro consumidor."],
  "orphan-file:EXLg8kdR75I7UmSN": ["falso", PRE +
    "newtonsoft-json/Src/Newtonsoft.Json/Utilities/UnconditionalSuppressMessageAttribute.cs se USA en al menos tres archivos del repo " +
    "(`Linq/JToken.cs`, `Utilities/EnumUtils.cs`, `Utilities/ConvertUtils.cs`), como ATRIBUTO (`[UnconditionalSuppressMessage(...)]`). " +
    "Un atributo en posición de anotación no produce arista de referencia — el mismo hueco que `inappropriate-intimacy` tiene con " +
    "`if TYPE_CHECKING:` y con `import type`, en un cuarto lenguaje. El archivo no es huérfano."],
  "orphan-file:_DuQZZkanZJpc3RF": ["falso", PRE +
    "ck-analyzer/server/services/graph/__fixtures__/symbols.go es una FIXTURE de test que `graph/symbols.test.ts` carga POR RUTA " +
    "(`fixture(\"symbols.go\")`, líneas 369/387/438) y parsea con `parseRoot(\"tree-sitter-go.wasm\", ...)`. No hay ni puede haber una arista de código " +
    "hacia ella —es un archivo Go dentro de un proyecto TypeScript— y borrarla rompería tres tests. Estructuralmente el hallazgo dice la verdad; " +
    "como recomendación es falso, que es lo que mide esta planilla."],
  "orphan-file:1Yqs9CAJk8jLHAQq": ["verdadero", PRE +
    "nest/integration/inspector/src/dogs/entities/dog.entity.ts es, entero, `export class Dog {}`, y `Dog` no aparece NI UNA vez en ningún otro archivo " +
    "de `integration/inspector` ni del repo (verificado por grep sobre todas las extensiones, no sólo `.ts`): `dogs.module.ts` importa " +
    "`DogsService`/`DogsController` y nada más. Es un archivo muerto de una app de integración; borrarlo es seguro y un revisor sin conocimiento del " +
    "dominio estaría de acuerdo. Es el primer `verdadero` juzgado de este kind en todo el corpus."],

  // ── coupling-without-abstraction. R4 le agregó el hecho TODO-Y-PARTE: 36 -> 11 hallazgos.
  "coupling-without-abstraction:EPK0IXBz6YLGGZ9K": ["falso", PRE +
    "hugo: los dos archivos del par (`resources/page/pagemeta/page_frontmatter.go` y `resources/page/pagemeta/pagemeta.go`) son del MISMO paquete Go " +
    "(`package pagemeta`, mismo directorio). Dos archivos de un mismo paquete no son dos piezas intercambiables a las que les falte una abstracción " +
    "compartida: el paquete YA es la unidad de encapsulamiento, y partirlo en archivos es organización, no acoplamiento. Es la misma pregunta que R4 " +
    "sí cableó en `feature-envy-inter` esta ola (`dirnameOf(a) === dirnameOf(b)`) y que este kind todavía no hace."],
  "coupling-without-abstraction:d40CdtLYhGady4zL": ["falso", PRE +
    "hugo `output/outputFormat.go` + `resources/page/pagemeta/page_outputformat.go`: son dos vocabularios de configuración distintos (formatos de " +
    "salida y metadatos de página) que los constructores de página usan JUNTOS porque el dominio los usa juntos. No hay una operación común que " +
    "abstraer: quien depende de los dos lo hace para leer dos cosas distintas. Misma familia que los 25 de 36 que la Ola Q midió como " +
    "'comparten exactamente un nombre de operación, y el nombre es protocolo del lenguaje'."],
  "coupling-without-abstraction:WgWQmjCIb-N5gSw3": ["falso", PRE +
    "hugo `markup/tableofcontents/tableofcontents.go` + `resources/page/pagemeta/page_markup.go`: idéntico al anterior. El TOC y la configuración de " +
    "markup de la página son dos datos que el renderizador necesita a la vez; ninguna abstracción común los reemplazaría sin inventar un tipo que no " +
    "corresponde a nada del dominio."],
  "coupling-without-abstraction:pYsLk2Ixle1k41Bh": ["falso", PRE +
    "guava `escape/Escaper.java` (`public abstract class Escaper`, 94 líneas) + `escape/Escapers.java` (`public final class Escapers`, 191 líneas, " +
    "utilidad estática con `builder()`, `nullEscaper()`, etc.). Es el par canónico CLASE ABSTRACTA + FÁBRICA ESTÁTICA COMPAÑERA: la abstracción que " +
    "el hallazgo pide que exista ES `Escaper`, y `Escapers` es su fábrica. Que tres archivos dependan de los dos es exactamente lo que el diseño " +
    "quiere. El detector sigue sin distinguir 'dos piezas acopladas sin abstracción' de 'una abstracción y su fábrica'."],

  // ── feature-envy-inter. R4 excluyó el mismo directorio: 36 -> 16.
  "feature-envy-inter:KP7F9yvpFKSkLXrt": ["falso", PRE +
    "rubocop `lib/rubocop/server/client_command/base.rb` es la CLASE BASE ABSTRACTA de los comandos de cliente del servidor ('Abstract base class for " +
    "server client command', `@api private`): su cuerpo entero son dos helpers (`send_request`, `check_running_server`) cuyo trabajo es hablar con " +
    "`RuboCop::Server::Cache` y `RuboCop::Server` — que viven en el directorio PADRE, así que la exclusión de mismo-directorio de R4 no la alcanza. " +
    "Referenciar más símbolos del módulo que se está encapsulando que de uno mismo es lo que una fachada hace por definición; mover el método al " +
    "'proveedor' rompería la abstracción. Es la generalización que a R4 le faltó: el criterio correcto no es el directorio EXACTO sino el subárbol."],

  // ── scattered-instantiation. R6 le agregó la cadena de identidad: 36 -> 2. Los DOS
  //    sobrevivientes, verificados por mí contra el fuente (R6 los verificó también;
  //    los rehice, no los cité).
  "scattered-instantiation:ev-hamgTR6MqY_pX": ["falso", PRE +
    "hugo `common/herrors/errors.go#FeatureNotAvailableError`: los cuatro sitios de construcción que el hallazgo señala " +
    "(`resource_transformers/cssjs/tailwindcss.go:114,149`, `cssjs/postcss.go:207,243`, `babel/babel.go:178,196`) construyen cada uno " +
    "`&herrors.FeatureNotAvailableError{Cause: err}` con SU PROPIO `Cause`, para devolverlo como error en su propio punto de fallo. Es el idioma de " +
    "excepción de Go, que el propio docstring del módulo declara como CASO 1 de 'no es este olor'. La `stores` que lo mantuvo vivo sale del centinela " +
    "`var ErrFeatureNotAvailable = &FeatureNotAvailableError{...}` que `errors.Is` usa para comparar — una identidad REAL, pero que no compite con los " +
    "sitios dispersos. Límite medido del criterio nuevo: contesta '¿T tiene identidad en ALGÚN punto del repo?', no '¿los sitios de ESTE hallazgo " +
    "compiten con esa identidad?'."],
  "scattered-instantiation:M3VQXpzjRHn_U8dj": ["falso", PRE +
    "rubocop `lib/rubocop/config.rb#Config`: los sitios de `Config.new` son código de CARGA de configuración " +
    "(`config_loader.rb:173,205`, `config_loader_resolver.rb:111`, `config_obsoletion.rb:27`, `version.rb:118`, `cops_documentation_generator.rb:54`), " +
    "y `Config` es un OBJETO VALOR inmutable envolviendo un hash. Construir un objeto valor en cada punto donde se arma una configuración distinta es " +
    "correcto; no hay una identidad compartida que la dispersión esté duplicando mal. Sobrevive al criterio nuevo por un artefacto de resolución " +
    "ajeno que R6 rastreó (`graph/resolve.ts`, narrowing por homónimo único: los ~87 'lectores' son los accessors `config` de cada cop, atados por " +
    "coincidencia de nombre a una variable local de `lib/rubocop/rspec/shared_contexts.rb`)."],
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
