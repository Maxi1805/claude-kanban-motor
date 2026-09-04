/**
 * Carga los veredictos que el INTEGRADOR de la Ola Q juzgó A MANO, leyendo el
 * código citado, uno por uno.
 *
 * POR QUÉ EXISTE. El re-muestreo de cierre dejó `speculative-abstraction` con
 * n=4, por debajo del piso de n=5 de `gate-logic.ts` — le murió justamente el
 * caso de hugo (`modules/module.go#Module`) que F1 sacó con la regla
 * asimétrica. Un kind sin base no tiene precisión, y no se le presta la
 * precisión vieja a un detector cuyo criterio cambió. Estos veredictos reponen
 * la base y, sobre todo, la EXTIENDEN a los ocho lenguajes/repos con volumen:
 * con n=4 el intervalo de Wilson del 0 % llega al 49 %; con n=14 llega al 22 %.
 *
 * Usa el I/O del propio proyecto (`verdicts-io.ts`) en vez de escribir el CSV
 * a mano, igual que `p-cargar-veredictos.mts`. Nunca pisa un veredicto ya
 * cargado.
 *
 * Todas las notas empiezan con `ola Q, integrador:` para que se recuperen con
 * un grep.
 *
 * Uso: npx tsx scripts/q-cargar-veredictos.mts [--dry]
 */
import path from "node:path";

import type { PrecisionVerdictOrPending } from "../src/server/services/detect/precision/types.js";
import { readPrecisionCsv, writePrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";

const DIR = path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");
const PRE = "ola Q, integrador: ";

/** id -> [veredicto, nota]. El slug se descubre solo. */
const V: Record<string, readonly [PrecisionVerdictOrPending, string]> = {
  // ── FAMILIA A: el "único implementador" ES OTRA INTERFAZ, no una implementación.
  //    85 de los 286 hallazgos vivos del kind (30 %), medido por gramática en los 13 repos:
  //    vueuse 40/40, hugo 21/22, eslint 4/4, preact 5/6, nest 7/26, guava 8/100.
  "speculative-abstraction:5pxdKXq4kp3_TmS-": ["falso", PRE +
    "vueuse/packages/core/useMouse/index.ts:55 declara `export interface UseMouseReturn { x; y; sourceType }` y su supuesto ÚNICO IMPLEMENTADOR es " +
    "`export interface UseMouseInElementReturn extends UseMouseReturn` (useMouseInElement/index.ts:37) — OTRA INTERFAZ, no una implementación. " +
    "La afirmación del hallazgo es falsa en sus propios términos: `UseMouseReturn` no tiene NINGÚN implementador nominal; lo que la satisface es el objeto " +
    "literal que devuelve `useMouse(options): UseMouseReturn` (línea 77), que el grafo no puede ver. " +
    "DEFECTO NOMBRABLE, y es el residuo #1 del kind después del arreglo de F1: `SymbolFamily` sólo conoce `class-like` y NO distingue " +
    "CONTRATO de IMPLEMENTACIÓN, así que `interface B extends A` entre dos interfaces entra a `implementersByTarget` como si B implementara A. " +
    "El hecho existe en la gramática (`SymbolFacts.nodeType`, 'grammar node type, verbatim') y NO viaja a `CodeGraphNode` — exactamente la misma " +
    "forma del hueco que P2 midió para `memberOfClassLike` y que F3 cerró en esta ola."],
  "speculative-abstraction:E_qiJktkzpox3Ey8": ["falso", PRE +
    "Misma familia, otro lenguaje/forma: eslint/lib/types/index.d.ts:1502 declara `interface ValidTestCase extends Omit<Linter.Config, ...>` y su " +
    "'único implementador' es `interface InvalidTestCase extends ValidTestCase` (línea 1528) — las DOS son interfaces de un archivo de declaraciones " +
    "`.d.ts`, o sea que ahí no hay ni una implementación que pudiera existir. Los 4 hallazgos de eslint del kind son esta misma forma."],
  "speculative-abstraction:6qF1A2FA1he1hjSt": ["falso", PRE +
    "Misma familia, en Go y por EMBEDDING: hugo/markup/converter/hooks/hooks.go:145 declara `type CodeBlockRenderer interface { RenderCodeblock(...) }`, " +
    "y el 'único implementador' `Highlighter` es `type Highlighter interface { Highlight(...); HighlightCodeBlock(...); hooks.CodeBlockRenderer; ... }` " +
    "(markup/highlight/highlight.go:61) — una INTERFAZ que EMBEBE a la otra. Es el mismo mecanismo que P3 (Ola P) ya había arreglado para " +
    "`concrete-over-abstraction` en Go ('el implements de Go que produce interfaz-declarada.ts es el embedding de una interfaz dentro de otra'): " +
    "el arreglo se hizo en UN detector y el otro consumidor de la misma arista quedó con el mismo defecto. " +
    "Y además el hallazgo es falso por un segundo motivo independiente: `CodeBlockRenderer` es un PUNTO DE EXTENSIÓN publicado, consumido por " +
    "aserción de tipo en `markup/goldmark/codeblocks/render.go:103` (`cr := renderer.(hooks.CodeBlockRenderer)`) sobre un registro de renderers."],

  // ── FAMILIA B: superficie PÚBLICA PUBLICADA — el implementador de más vive fuera del repo.
  //    Es el mecanismo 2 que T1 nombró en su triaje; lo confirmo en tres lenguajes más.
  "speculative-abstraction:0AnvPZ44Meme7PkN": ["falso", PRE +
    "guava-testlib/src/com/google/common/testing/TearDownAccepter.java:29 es `public interface TearDownAccepter` anotada `@DoNotMock(\"Implement with a lambda\")` " +
    "y `@since 10.0`: el propio código DICE que se implementa desde afuera, con una lambda. Su 'único implementador en este árbol' (`TearDownStack`) es " +
    "la implementación de conveniencia que la librería publica junto al contrato. Es la familia 'API publicada cuyos implementadores viven en el código " +
    "del consumidor' que T1 nombró como el hecho faltante del mecanismo 2. Nota de conteo: el hallazgo aparece DOS veces (guava-testlib/ y " +
    "android/guava-testlib/), como todo guava, por el árbol espejo."],
  "speculative-abstraction:H3780ETzvK9TlSOt": ["falso", PRE +
    "Misma familia en C#: Src/Newtonsoft.Json/Serialization/IContractResolver.cs:37 es `public interface IContractResolver` con un bloque `<example>` " +
    "en su propio XML-doc que muestra al USUARIO implementándola (dos `<code source=...>` apuntando a los tests de documentación). " +
    "`DefaultContractResolver` es la implementación por defecto que se publica con el contrato, no el único implementador posible."],
  "speculative-abstraction:MoDDjPW6kK7b2hKP": ["falso", PRE +
    "Misma familia en TypeScript: packages/common/interfaces/nest-microservice.interface.ts:14 declara `export interface INestMicroservice extends " +
    "INestApplicationContext` marcada `@publicApi` en su propio docstring, re-exportada desde `packages/common/index.ts:34` y usada como tipo de retorno " +
    "de la API pública (`nest-application.interface.ts:99`). Su implementador (`NestMicroservice`) es la implementación que el framework publica. " +
    "Inline-arla borraría el tipo público del paquete."],

  // ── FAMILIA C: el objetivo NO ES UNA ABSTRACCIÓN — es una clase concreta que funciona sola.
  "speculative-abstraction:ONyqVC4xuDzdJxwd": ["falso", PRE +
    "rubocop/lib/rubocop/cop/metrics/cyclomatic_complexity.rb:35 es `class CyclomaticComplexity < Base` — un COP CONCRETO, registrado y funcionando " +
    "(tiene `MSG`, `COUNTED_NODES`, corre sobre el código del usuario). Que `PerceivedComplexity < CyclomaticComplexity` reuse su recorrido no lo " +
    "convierte en una abstracción, y menos en una hipotética: es herencia de implementación entre dos cops que existen los dos. " +
    "El detector no distingue 'clase base abstracta con un solo subtipo' de 'clase concreta que además tiene un subtipo'."],
  "speculative-abstraction:-g0odjGT_e856mmX": ["falso", PRE +
    "sqlalchemy/lib/sqlalchemy/orm/context.py:341 es `class _AutoflushOnlyORMCompileState(_AbstractORMCompileState)` con docstring propio " +
    "('ORM compile state that is a passthrough, except for autoflush') — una clase concreta usada como MIXIN en herencia múltiple: " +
    "`class _CompoundSelectCompileState(_AutoflushOnlyORMCompileState, CompoundSelectState)` (línea 1083). Un mixin con un solo consumidor no es " +
    "una abstracción especulativa. " +
    "IMPORTANTE PARA LA ATRIBUCIÓN: este hallazgo NO EXISTÍA antes de esta ola — es una de las 5 claves de censo NUEVAS que aparecen por el cambio de " +
    "procedencia de F1. `implementersByTarget` se arma desde `confidentEdges(graph)` (speculative-abstraction.ts:459), que excluye `ambiguous`, así que " +
    "las 1.360 aristas `satisfies` que F1 pasó a `ambiguous` dejaron de CONTAR como implementador y bajaron a algunos objetivos de 2 a 1. " +
    "F1 escribió que con la regla asimétrica 'ese efecto es cero'; medido sobre el censo real es chico pero NO es cero (5 claves nuevas + 4 que suben, " +
    "todas en hugo y sqlalchemy)."],
  "speculative-abstraction:1fHueJygS8DQkqsC": ["falso", PRE +
    "sqlalchemy/lib/sqlalchemy/sql/base.py:1092 `class ExecutableOption(HasCopyInternals)` es la COSTURA PÚBLICA de las opciones de ejecución: es el tipo " +
    "declarado del parámetro de la API pública `.options(*options: ExecutableOption)` (sql/base.py:1399 y orm/query.py:1657) y el objetivo de un " +
    "`isinstance(element, ExecutableOption)` de despacho (sql/coercions.py:747). Su 'único implementador' `ORMOption` (orm/interfaces.py:1272) es la raíz " +
    "de toda la familia de opciones del ORM, o sea que debajo hay una jerarquía entera. Tener un solo subtipo DIRECTO no la vuelve hipotética."],
  "speculative-abstraction:Yupqdad4ZTQBgeO7": ["falso", PRE +
    "jekyll/lib/jekyll/plugin.rb:4 `class Plugin` es la base del sistema de plugins de Jekyll, con `self.inherited`/`catch_inheritance` registrando a " +
    "sus hijos EN RUNTIME. El detector le ve UN implementador (`Converter`) porque el otro se declara con `Generator = Class.new(Plugin)` " +
    "(lib/jekyll/generator.rb:4) — creación DINÁMICA de clase, que ninguna arista `extends` puede capturar por sintaxis. " +
    "DEFECTO NOMBRABLE, tercer mecanismo distinto: en Ruby el conteo de implementadores está SUB-contado por `Class.new(Base)`, y este detector " +
    "afirma unicidad sobre un conteo que sabe incompleto. Además `Plugin` es la superficie que los plugins de terceros extienden."],
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
