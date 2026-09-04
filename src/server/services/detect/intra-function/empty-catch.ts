/**
 * `empty-catch` — excepción tragada (F1: uno de los tres `CodeFindingKind`
 * declarados en `types.ts` y en la UI que nadie emitía nunca, CONTRATOS.md/
 * PLAN.md §4.1 "Excepción tragada | función | gramática (llena `empty-catch`)").
 *
 * Primer usuario real del registro de detectores (`detect/registry.ts`):
 * valida el contrato de CONTRATO 1 antes de que más detectores construyan
 * encima — ver el resultado final de la tarea para cómo le fue.
 *
 * Relación: un nodo de manejo de excepciones (`fn.sets.exceptionNodes` —
 * genérico, derivado de la gramática, nunca un nombre de nodo por lenguaje)
 * cuyo cuerpo NO HACE NADA — ni registra, ni relanza, ni actúa sobre la
 * excepción capturada. Estructural, no léxico: "no hace nada" se lee como
 * "el campo `body` no resuelve, o resuelve a un nodo sin NINGÚN hijo
 * nombrado" — nunca por vocabulario de "log"/"raise"/"handle" (eso sería
 * exactamente la lista de palabras por lenguaje que la regla 4 prohíbe).
 *
 * Límite declarado, encontrado escribiendo el propio test de este detector:
 * Python's `except_clause` no resuelve NINGÚN campo para su bloque —
 * confirmado por sonda directa contra `body`/`consequence`/`block`/`handler`,
 * ninguno resuelve, tenga contenido real o no (a diferencia de Ruby, cuyo
 * `rescue` resuelve `body` sólo cuando NO está vacío, que es la señal que
 * este detector usa). Sin un campo que consultar, la ausencia no distingue
 * "vacío" de "con contenido" para Python — así que Python queda,
 * explícitamente, SIN detección bajo esta regla, no con una adivinanza. La
 * única vía honesta para cubrirlo exigiría nombrar `pass_statement`/`block`
 * por tipo, exactamente la lista de nombres de nodo por lenguaje que la
 * regla 4 prohíbe — mismo espíritu que los gaps ya documentados en
 * `code-grammar.ts` (Ruby `and`/`or`, `case/in`).
 *
 * JUICIO DE PRECISIÓN (frente de nivel 1, agosto 2026), BUG DE
 * IMPLEMENTACIÓN ENCONTRADO Y ARREGLADO: el mecanismo exacto que
 * `config_loader_resolver.rb:307` (corpus externo, `rubocop`) señaló —
 * "el rescue tiene 4 líneas de comentario que el AST no ve". Confirmado por
 * sonda directa (`scratchpad/precision-front/probe-ruby-rescue-field.mjs`):
 * un comentario dentro de un `rescue` SIN sentencias es un hijo NOMBRADO
 * DIRECTO del propio nodo `rescue` — hermano del campo `body`, nunca anidado
 * DENTRO de él (`then`/`body` sólo resuelve cuando hay una sentencia real).
 * La versión anterior de `isEmptyHandler` sólo miraba `namedChildCount(body)`
 * cuando `body` resolvía, y para Ruby con `body` sin resolver asumía "vacío"
 * incondicionalmente (`return language === "ruby"`) — exactamente el mismo
 * código para "rescue sin nada" y para "rescue con sólo un comentario
 * documentando la decisión", porque en AMBOS casos `body` no resuelve. Cinco
 * de los seis falsos positivos de Ruby de la muestra juzgada
 * (`tests/golden/precision/rubocop.verdicts.csv`) son exactamente esto:
 * `config_loader_resolver.rb:307`, `node_pattern_groups.rb:223`, `cop.rb:179`
 * (`suppress_clobbering`, doblemente documentado por nombre de método Y
 * comentario), `plugin.rb:29`, `corrections_proxy.rb:37` — los cinco tienen
 * un comentario como ÚNICO contenido del `rescue`. El propio texto de
 * `advice.primary.why` de este detector, más abajo, YA decía que documentar
 * la decisión alcanza ("como mínimo hay que registrar la excepción o
 * documentar explícitamente por qué se ignora a propósito") — el chequeo de
 * vacío simplemente no podía verlo para Ruby. `isEmptyHandler` (abajo) ahora,
 * para Ruby con `body` sin resolver, cuenta CUALQUIER hijo nombrado del
 * propio `rescue` que no sea el tipo de excepción (`exceptions`) ni la
 * variable capturada (`variable`, `rescue X => e`) — confirmado por sonda
 * directa que esos son los ÚNICOS dos campos que un `rescue` sin cuerpo
 * puede tener aparte de un comentario suelto, con o sin variable ligada, con
 * uno o varios tipos de excepción (`rescue A, B => e`).
 *
 * Lo que esto NO arregla, con evidencia de que se investigó (no descartado
 * sin mirar): el resto de la muestra falsa de `empty-catch` (9 de 14 casos
 * juzgados) cae en dos categorías estructuralmente indistinguibles de un
 * catch vacío real sin leer intención humana o vocabulario de dominio —
 * ninguna arreglada, las dos con intento y motivo escrito:
 *   1. **Convención por NOMBRE de variable** (`catch (X tolerated) {}` en
 *      `guava-testlib`, 6 de 14): el cuerpo está genuinamente vacío, cero
 *      nodos con o sin comentario — la única señal es que la variable de
 *      excepción se llama "tolerated" en vez de "e"/"ex". Usar el NOMBRE de
 *      una variable como señal es exactamente el vocabulario de dominio que
 *      la regla 4 prohíbe (sería una constante tipo `TOLERATED_WORD`, misma
 *      familia que las prohibidas en `pattern-*.ts`), así que no se
 *      implementó.
 *   2. **Idioma de detección de capacidad / defensivo, sin comentario ni
 *      variable con nombre** (`lodash.js:1523`, `preact/src/diff/props.js:126`,
 *      `hugo` `livereload.js:3501`, 3 de 14): probado un candidato
 *      estructural ("el `try` termina en `return`/`break`" — cierto en 2 de
 *      3) y otro ("hay un comentario INMEDIATAMENTE ANTES del `try`" — cierto
 *      en 1 de 3, distinto caso); ningún candidato cubre los tres, y
 *      cualquiera de los dos exigiría mirar el HERMANO anterior del nodo
 *      `try` (o su padre) — `ProbeNode` no expone `.parent()`/hermanos
 *      (`code-grammar.ts:153-159`) y escribir un recorrido propio para
 *      conseguirlo está prohibido (`tree-walk.ts`, ver el mismo límite
 *      documentado en `argument-mutation.ts`). Confirma, con intento
 *      concreto y no sólo por lectura, la misma conclusión a la que ya había
 *      llegado la nota original de este módulo.
 *
 * OLA O, FRENTE N10 — "CÓDIGO QUE NO ES PRODUCTO". La categoría 1 de arriba
 * ("convención por NOMBRE de variable", `catch (X tolerated) {}` en
 * `guava-testlib`, 6 de 14 falsos juzgados) queda RESUELTA, pero por otro
 * lado: no por el nombre de la variable —que sigue prohibido, y por eso la
 * nota de arriba se conserva tal cual— sino porque la FUNCIÓN que contiene
 * ese `catch` es un método que un runner reflexivo descubre por su propio
 * nombre y ejecuta sin argumentos (`testRemove_wrongType()`), o sea un ARNÉS
 * DE TEST y no comportamiento de producto. El criterio, su justificación
 * completa y su límite viven en `detect/primitivas/n10-no-es-producto.ts`.
 * MEDIDO sobre el corpus (ver `claude-kanban-docs/ola-o/informes/N10.md`):
 * 86 de los 96 hallazgos de guava caen por esto, los 6 falsos juzgados de la
 * planilla entre ellos, y el ÚNICO hallazgo juzgado VERDADERO del kind en
 * todo el corpus (`lodash/perf/perf.js:51`, función anónima) NO cae.
 */
import type { ProbeNode } from "../../code-grammar.js";
import { arnesPorNombreDeDescubrimiento } from "../primitivas/n10-no-es-producto.js";
import { presencia } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "presence";

/** Todo hijo NOMBRADO del nodo — punteo/palabras clave no cuentan como contenido real. */
function namedChildCount(node: ProbeNode): number {
  let count = 0;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.isNamed) count++;
  }
  return count;
}

/**
 * Campos DECLARATIVOS de un `rescue` de Ruby sin cuerpo — el tipo de
 * excepción y la variable ligada, nunca contenido del manejador. Confirmado
 * por sonda directa (`scratchpad/precision-front/probe-ruby-rescue-var.mjs`):
 * `rescue A, B => e` wrappea AMBOS tipos dentro de un único hijo con campo
 * `exceptions`, así que un solo chequeo de presencia alcanza sin importar
 * cuántos tipos liste.
 */
const RUBY_RESCUE_DECLARATION_FIELDS = ["exceptions", "variable"] as const;

/**
 * `true` cuando el manejador no tiene NINGÚN contenido. Dos formas
 * confirmadas por sonda directa (ver el docstring del módulo):
 *   - el campo `body` RESUELVE (Ruby cuando no está vacío, y SIEMPRE en
 *     JS/TS/Vue/Java/C#/Go): el vacío se lee de sus hijos nombrados —
 *     genérico, sin conocimiento por lenguaje. Un comentario cuenta como
 *     contenido acá porque, en TODOS estos lenguajes, un `comment`/
 *     `line_comment` DENTRO de `body` es un hijo NOMBRADO más (confirmado
 *     por sonda directa, `scratchpad/precision-front/probe-comment-in-catch.mjs`) —
 *     nunca se pierde, así que un catch documentado con un comentario ya
 *     quedaba bien clasificado en estos lenguajes ANTES de este arreglo.
 *   - el campo NO resuelve: en Ruby eso pasa tanto para un `rescue`
 *     genuinamente vacío como para uno con SÓLO un comentario (el comentario
 *     es hermano de `body`, nunca anidado dentro — ver el docstring del
 *     módulo, JUICIO DE PRECISIÓN). Distinguirlos exige mirar los hijos del
 *     `rescue` MISMO: si hay alguno que no sea el tipo de excepción ni la
 *     variable ligada (`RUBY_RESCUE_DECLARATION_FIELDS`), hay contenido —
 *     casi siempre un comentario, pero el chequeo no nombra "comment": para
 *     cualquier campo NO declarativo cuenta como no vacío por construcción,
 *     nunca por vocabulario. En Python el campo NUNCA resuelve, con o sin
 *     contenido, así que la ausencia no prueba nada ahí — ver el límite
 *     declarado en el docstring del módulo. `language` es la ÚNICA
 *     distinción por nombre de este detector, y es sobre el LENGUAJE (ya un
 *     dato de primera clase en `FunctionUnit`), no sobre un nombre de nodo —
 *     mismo tipo de excepción mínima y documentada que
 *     `extraCloneNodes`/`functionExclusions` en `code-grammar.ts`.
 */
function isEmptyHandler(node: ProbeNode, language: string): boolean {
  const body = node.childForFieldName("body");
  if (body) return namedChildCount(body) === 0;
  if (language !== "ruby") return false;
  const declaredFieldCount = RUBY_RESCUE_DECLARATION_FIELDS.filter((field) => node.childForFieldName(field) !== null).length;
  return namedChildCount(node) <= declaredFieldCount;
}

export const detector: IntraFunctionDetector<ThresholdKey, "empty-catch"> = {
  id: "empty-catch",
  kind: "empty-catch",
  scope: "intra-function",
  title: "Excepción tragada",
  needs: ["excepciones"],
  // Ruby, declarado: `isEmptyHandler` (arriba) ahora distingue un `rescue`
  // genuinamente vacío de uno documentado con un comentario, y verificado a
  // mano contra `rubocop/lib` completo (corpus externo, no el repo del
  // usuario) NO queda ni un `rescue` genuinamente vacío una vez descontados
  // los documentados — el detector corre, tiene la capacidad (`needs:
  // ["excepciones"]` se cumple, `exceptionNodes` de Ruby no está vacío), y
  // da 0 porque el código real no tiene el defecto, no porque el detector
  // esté ciego. Sin esta entrada, `language-coverage.ts#verdictFor` lee la
  // celda como "corrió y dio cero sin razón" (caso 4, `mudo-sin-razon`) — un
  // hueco de cobertura que no es tal: es el criterio "empty" funcionando
  // correctamente sobre un lenguaje donde, medido, no hay instancias reales
  // del smell en el corpus. Ver el docstring del módulo, "JUICIO DE
  // PRECISIÓN", para el detalle del arreglo que produjo este silencio.
  silentIn: {
    ruby: "verificado a mano contra rubocop/lib completo (corpus externo): 0 rescue genuinamente vacíos una vez que isEmptyHandler distingue 'sin cuerpo' de 'documentado con un comentario' — el silencio es del CÓDIGO, no del detector.",
  },
  thresholds: {
    // No es un umbral de MAGNITUD (no hay "cuántos es demasiados"): la sola
    // presencia de un manejador vacío ya es el hallazgo. `presencia(…)` (R3
    // — antes `pisoDeclarado(1, …)`) es la forma honesta de decir eso dentro
    // del contrato — cada Measurement exige un Threshold con fuente, y acá
    // la "fuente" es la propia definición del hallazgo, no una cita externa
    // ni un percentil, ni un piso elegido dentro de un rango posible.
    presence: presencia({
      rationale: "cualquier manejador de excepción vacío ya es el hallazgo completo: no hay una magnitud que umbralizar, es presencia/ausencia.",
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    // Ola O / N10 — ver el docstring del módulo. En un método de arnés el
    // manejador vacío no es un error tragado: alcanzarlo ES la aserción que
    // el arnés hace ("esta operación no está soportada y tira"). No hay nada
    // que refactorizar, así que no hay hallazgo.
    if (arnesPorNombreDeDescubrimiento(fn)) return [];

    const findings: RawFinding[] = [];
    const threshold = ctx.threshold("presence");

    walkTree(fn.node, (node) => {
      if (!node.isNamed || !fn.sets.exceptionNodes.has(node.type)) return;
      if (!isEmptyHandler(node, fn.language)) return;

      // `AstNode`'s inherited `child()`/`childForFieldName()` (from
      // `ProbeNode`, what `walkTree` iterates) return `ProbeNode`, not
      // `AstNode` — a real tree's children are ALSO `AstNode`-shaped at
      // runtime (same parser, same node kind), but the contract's own typing
      // does not say so; every consumer of a real tree either casts or, like
      // `walkTree`, only reads the `ProbeNode` surface while walking and
      // casts ONCE, at the leaf, only where `.text`/position is actually
      // needed.
      const real = node as AstNode;
      const startLine = real.startPosition.row + 1;
      const endLine = real.endPosition.row + 1;
      findings.push({
        title: `Excepción capturada y descartada en "${fn.name ?? "función anónima"}"`,
        detail:
          "El bloque que maneja la excepción no hace nada: ni la registra, ni la relanza, ni actúa sobre ella. " +
          "El error desaparece en silencio y quien llama nunca se entera de que algo falló.",
        trigger: [{ label: "manejadores vacíos", value: 1, threshold }],
        locations: [
          {
            file: fn.file,
            startLine,
            endLine,
            symbol: fn.name ?? undefined,
            role: "manejador de excepción vacío",
          },
        ],
        severity: 55,
        advice: {
          primary: {
            name: "Introduce Special Case / registrar la excepción",
            kind: "refactorizacion",
            why: "Un manejador vacío oculta el fallo; como mínimo hay que registrar la excepción o documentar explícitamente por qué se ignora a propósito.",
            source: "https://refactoring.guru/es/smells/dead-code",
          },
        },
      });
    });

    return findings;
  },
};
