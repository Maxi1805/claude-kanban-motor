/**
 * `unreachable-code` — código inalcanzable (PLAN.md §4.1 "Código inalcanzable
 * | función | gramática").
 *
 * RELACIÓN: dentro de un mismo bloque (los hijos NOMBRADOS de un mismo nodo
 * padre — `if`/`then`, `while`/`do`, el cuerpo de la función, un `case`, lo
 * que sea), una sentencia de salto de control (`return`/`throw`/`raise`/
 * `break`/`continue`) seguida de al menos otra sentencia REAL (ni un
 * comentario ni una directiva inerte del compilador) en ese mismo nivel. El
 * intérprete nunca llega a lo que sigue: el flujo ya salió del bloque antes
 * de esa línea.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: la detección entera es relacional
 * (¿hay un hermano NOMBRADO después de un nodo de salto, bajo el MISMO
 * padre?), sin mirar el contenido de ninguna sentencia. La única superficie
 * de vocabulario es `JUMP_WORD`, una regex GENÉRICA sobre el TIPO de nodo
 * (nunca su texto), aplicada IDÉNTICAMENTE a los nueve lenguajes soportados
 * — mismo estilo que `LOOP_WORD`/`EXCEPTION_WORD`/`SWITCH_WORD` de
 * `code-grammar.ts`: nunca una lista de nombres de nodo por lenguaje.
 * `NON_EXECUTABLE_TYPE`/`CONDITIONAL_DIRECTIVE_TYPE` son la misma clase de
 * excepción mínima (un patrón sobre el TIPO de nodo, no una lista por
 * lenguaje) para no contar un comentario, un `#pragma`/`#region`, o el otro
 * lado de un `#if`/`#else` como "código".
 *
 * SIMPLIFICACIONES DECLARADAS: se reporta UN hallazgo por cada bloque
 * (nivel de hermanos) donde aparece el patrón, deteniéndose en el PRIMER
 * salto de ese bloque que tiene código real después (el resto del bloque ya
 * quedó cubierto por ese mismo hallazgo). Si el tramo inalcanzable contiene,
 * a su vez, un bloque ANIDADO con su propio salto seguido de más código
 * (p.ej. un `if` inalcanzable que en su interior también termina con un
 * `return` seguido de más código), ese bloque anidado genera SU PROPIO
 * hallazgo independiente — no hay deduplicación entre un hallazgo externo y
 * uno interno ya contenido en su rango. Es una duplicación honesta (cada uno
 * señala un punto real y distinto donde el flujo corta), no un error, pero
 * puede sumar más de un hallazgo por tramo genuinamente muerto.
 *
 * LÍMITES DECLARADOS POR LENGUAJE (confirmados por sonda directa — ver el
 * resultado final de la tarea para la sonda completa):
 *   - Ruby: `raise` es una llamada de método común (nodo `call`), no un tipo
 *     de nodo de gramática dedicado como en Python (`raise_statement`) o
 *     JS/Java/C# (`throw_statement`) — así que código después de un `raise`
 *     en Ruby NO se detecta bajo esta regla. `return`/`break`/`next` sí
 *     tienen su propio tipo de nodo en Ruby (`return`/`break`/`next`, sin
 *     sufijo `_statement`) y quedan cubiertos.
 *   - Go: `panic(...)` es igualmente una llamada de función común, sin nodo
 *     de gramática propio — mismo límite que Ruby, mismo motivo. Go no tiene
 *     `throw`; `return`/`break`/`continue` sí tienen nodo dedicado y quedan
 *     cubiertos.
 *   - C#: `tree-sitter` no evalúa el preprocesador -- ver
 *     `CONDITIONAL_DIRECTIVE_TYPE` y el falso positivo de directivas
 *     condicionales más abajo para la mitigación real. Lo que queda SIN
 *     cubrir, deliberadamente, es la otra mitad de la ambigüedad: código
 *     dentro de la MISMA rama de compilación que el salto, sin ningún
 *     `#elif`/`#else`/`#endif` de por medio, sigue contando como
 *     inalcanzable aunque toda la rama dependa de un símbolo no definido en
 *     ESTE build -- no hay forma sintáctica de saber qué símbolos define el
 *     build real sin evaluar el preprocesador, así que esta regla asume
 *     siempre "esta rama se compila", nunca lo contrario.
 *   - C#/JS/TS, ARREGLADO (ola de precisión sobre el corpus de 8 lenguajes):
 *     una FUNCIÓN LOCAL/ANIDADA declarada después de un salto (`return x;
 *     async Task Helper() { … }`, patrón real y frecuente en el corpus
 *     externo -- newtonsoft-json, `JObject.Async.cs#WriteToAsync` Y
 *     `JsonWriter.Async.cs#InternalWriteEndAsync`, dos falsos positivos
 *     confirmados a mano, no uno) YA NO cuenta como código inalcanzable:
 *     `NON_EXECUTABLE_TYPE` excluye `local_function_statement` (C#) y
 *     `function_declaration` (JS/TS/Vue) -- ambos son DECLARACIONES
 *     elevadas (hoisted) por su propia gramática, disponibles en TODO el
 *     método/scope contenedor sin importar su posición textual, así que la
 *     declaración en sí, al "ejecutarse" en ese punto, no hace nada
 *     observable — exactamente la misma categoría que ya cubre un
 *     comentario o una directiva `#pragma`/`#region` inerte. Esto SÍ es una
 *     forma de árbol (el nombre del tipo de nodo que cada gramática usa
 *     para su propia construcción de declaración elevada), no una rama de
 *     código por nombre de lenguaje — mismo criterio ya establecido para
 *     `pragma_directive`/`region_directive` más arriba, que también son
 *     nombres de nodo específicos de una sola gramática. Deliberadamente
 *     NO extendido al `def` anidado de Python (`function_definition`): en
 *     Python un `def` anidado se ejecuta en el punto textual en el que
 *     aparece (liga el nombre en ese instante; no hay hoisting), así que
 *     ahí SÍ sigue siendo código muerto genuino si aparece después de un
 *     salto real.
 *   - JS/TS: `return` seguido de un comentario de bloque EN LA MISMA LÍNEA,
 *     antes de su propia expresión (`return /** @type {X} *\/ (obj);`,
 *     patrón real en el corpus externo -- preact, `debug.js`/`helpers.jsx`),
 *     hace que `tree-sitter-javascript`/`tree-sitter-typescript` partan la
 *     sentencia en un `return` SIN argumento más una sentencia de expresión
 *     separada para `(obj)` -- confirmado por sonda directa comparando
 *     posiciones de nodo. El propio parser diverge ahí de la semántica real
 *     de ASI de JavaScript (un comentario de una sola línea, sin salto de
 *     línea adentro, no debería insertar punto y coma); como este detector
 *     confía en el árbol que el parser entrega, hereda esa divergencia.
 *     Límite del parser, no de esta regla -- declarado, no adivinado.
 *   - TS/Vue, ARREGLADO (Ola O, medido contra el corpus externo -- nest,
 *     `platform-fastify/adapters/middie/fastify-middie.ts#middie`): una
 *     declaración de tipo TypeScript (`interface`/`type Foo = ...`) después
 *     de un salto NO cuenta como código inalcanzable -- ninguna de las dos
 *     tiene NINGUNA representación en tiempo de ejecución, izada o no: TS
 *     las borra por completo al compilar (a diferencia de
 *     `function_declaration`, que si SIGUE generando código, sólo que
 *     elevado). El caso real: `middie` hace `return { use, run }; function
 *     use(...) {...} function run(...) {...} interface HolderInstance {...}
 *     function Holder(...) {...}` -- `function_declaration` ya estaba
 *     exceptuado (ver arriba), pero `interface_declaration` no, así que el
 *     detector reportaba 147 líneas de "código inalcanzable" que en
 *     realidad son 3 funciones izadas + una interfaz que ni siquiera existe
 *     después de compilar. `type_alias_declaration` (`type X = ...`) es la
 *     MISMA categoría por la MISMA razón, agregada junto a `interface_
 *     declaration` aunque el caso real medido sólo ejercite la segunda.
 *   - RANGO REPORTADO, ARREGLADO (Ola O, mismo caso de `middie`): el rango
 *     de líneas de un hallazgo (`startLine`/`endLine`) se calculaba sobre
 *     `after` (TODOS los hermanos que siguen al salto, incluidos los que
 *     `NON_EXECUTABLE_TYPE` excluye de la CUENTA), no sobre `realAfter` (los
 *     que de verdad cuentan como violación). Con código real intercalado
 *     entre declaraciones izadas/borradas, el primer o el último elemento de
 *     `after` podía ser uno de esos elementos excluidos -- el rango
 *     reportado entonces incluía, como si fuera parte de "lo inalcanzable",
 *     una función izada o un tipo borrado que el propio detector ya decidió
 *     que NO cuenta. Medido antes del arreglo de arriba: el único hallazgo
 *     de `middie` reportaba el rango 64-210 (TODO el resto de la función,
 *     3 funciones izadas incluidas) para lo que, una vez arreglada la
 *     exclusión de `interface_declaration`, ya no dispara -- pero el defecto
 *     del rango es independiente y se corrige igual (ver `first`/`last` en
 *     `run`, más abajo) para cualquier caso futuro donde SÍ quede una
 *     violación real después de excluir las declaraciones izadas/borradas.
 *
 * FALSOS POSITIVOS CONOCIDOS (formas legítimas que se confunden con esto, y
 * por qué el criterio relacional --mismo padre-- NO las dispara):
 *   - **Guard clause de una línea sin llaves** (`if (x) return 1;
 *     doStuff();`): `doStuff()` es hermano del `if`, no del `return` --
 *     vive en el bloque exterior y SÍ se ejecuta cuando `x` es falso. No
 *     dispara.
 *   - **`if`/`else` de una sola sentencia sin llaves, con salto en AMBAS
 *     ramas** (`if (a > b) return 1; else return -1;`): encontrado
 *     investigando un hallazgo del corpus externo (newtonsoft-json,
 *     `Issue3080.cs`) que en un principio parecía otra cosa -- confirmado
 *     por sonda directa que, sin llaves, `if_statement` resuelve
 *     `consequence`/`alternative` DIRECTAMENTE al `return` de cada rama (sin
 *     un bloque envolvente de por medio), y ambos son hijos del MISMO
 *     `if_statement`: el `return` de la rama verdadera queda, en el árbol,
 *     como "hermano anterior" del `return` de la rama falsa, aunque nunca
 *     se ejecutan los dos -- son ramas alternativas, no una secuencia.
 *     Mismo mecanismo que el modificador de Ruby, mismo arreglo genérico:
 *     ver `isControlFieldTarget`.
 *   - **`switch`/`case` con cada rama terminada en su propio salto**: cada
 *     `case` es un nodo hijo separado de su contenedor switch; un `return`
 *     al final del `case A` nunca tiene como hermano al `case B` siguiente
 *     -- son ramas distintas, no una secuencia dentro del mismo bloque. No
 *     dispara (patrón bien aplicado, no un falso positivo real).
 *   - **Bloque `finally` que se ejecuta después de un `throw` en el `try`**:
 *     el `finally` es hijo de un nodo hermano DISTINTO (`try_statement`),
 *     nunca hermano directo del `throw` que vive dentro del `try`. No
 *     dispara.
 *   - **Comentario final sin código real** (`return 1; // nota`): sin una
 *     sentencia real después del salto no hay nada ejecutable que sea
 *     inalcanzable -- `NON_EXECUTABLE_TYPE` excluye el comentario de la
 *     cuenta que decide si dispara. (Si el comentario está INTERCALADO entre dos
 *     sentencias reales inalcanzables, sigue disparando por esas dos, y el
 *     comentario simplemente queda dentro del rango reportado -- no es lo
 *     que dispara, pero tampoco se filtra del rango).
 *   - **Modificador de sentencia de Ruby** (`next if cond`, `break unless
 *     cond`, `return while cond`, ...): encontrado corriendo el detector
 *     sobre el corpus externo (jekyll), no adivinado -- confirmado por sonda
 *     directa que `if_modifier`/`unless_modifier`/`while_modifier`/
 *     `until_modifier`/`rescue_modifier` resuelven el salto como su propio
 *     campo `body` y la condición como campo `condition`, AMBOS hijos del
 *     mismo nodo compuesto en orden textual -- la condición queda, en el
 *     árbol, como "hermano siguiente" del salto sin ser código posterior en
 *     absoluto (se evalúa ANTES: `next` sólo ocurre si `cond` es verdadera).
 *     Sin la guarda de `isControlFieldTarget` (ver `run`, más abajo) esto
 *     disparaba en casi cualquier archivo Ruby real que use el idiom --
 *     corregido comparando el candidato contra los campos de control de su
 *     propio padre por RANGO de código fuente (`sameNode`), no por
 *     identidad de objeto (que `web-tree-sitter` no garantiza entre
 *     `child()` y `childForFieldName()` -- confirmado por sonda directa,
 *     ver `sameNode`).
 *   - **Ramas alternativas de compilación condicional en C#** (`#if X
 *     return true; #else if (y) { return true; } return false; #endif`):
 *     encontrado corriendo el detector sobre el corpus externo
 *     (newtonsoft-json), no adivinado -- confirmado por sonda directa que
 *     `tree-sitter-c_sharp` expone `if_directive`/`else_directive`/
 *     `endif_directive` como nodos NOMBRADOS, hermanos de las sentencias
 *     reales que rodean. Sin evaluar el preprocesador, la rama `#else`
 *     aparece, en el árbol, exactamente como si fuera código que sigue
 *     incondicionalmente al `return` de la rama `#if` -- pero nunca
 *     coexisten en el mismo build: es SIEMPRE una u otra. Mitigado
 *     truncando la lista de "código que sigue" en la primera directiva
 *     condicional que aparece (`CONDITIONAL_DIRECTIVE_TYPE`) -- cruzar esa
 *     frontera nunca cuenta, en ninguna dirección, precisamente porque este
 *     detector no sabe (ni puede saber, sin evaluar el preprocesador) qué
 *     símbolo está definido en el build real.
 */
import type { ProbeNode } from "../../code-grammar.js";
import { citado } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "presence";

/**
 * Vocabulario GENÉRICO de sentencias de salto de control, aplicado
 * IDÉNTICAMENTE a los nueve lenguajes soportados -- nunca una lista de
 * nombres de nodo por lenguaje. Cubre tanto la forma con sufijo
 * (`return_statement`, `throw_statement`, `raise_statement`,
 * `break_statement`, `continue_statement` -- JS/TS/Vue/Python/Java/Go/C#)
 * como la forma sin sufijo que usa Ruby (`return`, `break`, `next`; `next`
 * es el nombre que Ruby le da a "continue", `redo` es su reinicio de
 * iteración, incluido por la misma familia estructural aunque ninguna
 * fixture lo ejercite).
 */
const JUMP_WORD = /^(return|throw|raise|break|continue|next|redo)(_statement)?$/;

/**
 * Nodo sin efecto en tiempo de ejecución -- nunca cuenta como "código real"
 * que siga al salto. Un comentario, y las directivas de C# que no gatean
 * NINGÚN build (`#pragma`, `#region`/`#endregion`): a diferencia de
 * `CONDITIONAL_DIRECTIVE_TYPE`, ninguna de éstas decide qué rama se
 * compila -- son inertes, como un comentario, así que el código real que
 * las rodea sigue contando igual (`#region foo … código real … #endregion`
 * después de un `return` SIGUE siendo inalcanzable). `pragma_directive` fue
 * encontrado corriendo el detector sobre el corpus externo
 * (newtonsoft-json), no adivinado: confirmado por sonda directa que
 * `#pragma warning restore …` -- un cierre de directiva de diagnóstico que
 * el compilador nunca "ejecuta" -- se cuela como hermano de un `return` sin
 * ningún código real detrás, y sin este filtro se contaba como si lo fuera.
 *
 * ARREGLO MEDIDO (ola de precisión sobre el corpus de 8 lenguajes):
 * `local_function_statement` (C#) y `function_declaration` (JS/TS/Vue) son
 * DECLARACIONES elevadas (hoisted) por su propia gramática -- el nombre
 * queda vinculado a la función ANTES de que el bloque que la contiene
 * empiece a ejecutarse, así que su posición textual respecto de un `return`
 * anterior no importa: no es "código que corre en secuencia", es una
 * definición que otro punto del mismo cuerpo (ANTES del `return`) ya pudo
 * haber invocado. Encontrado corriendo el detector sobre el corpus externo
 * (newtonsoft-json): `JObject.Async.cs#WriteToAsync` y
 * `JsonWriter.Async.cs#InternalWriteEndAsync` declaran una función local
 * async DESPUÉS del `return` final del método envolvente -- ambas
 * invocadas desde ANTES de ese mismo `return` (`return AwaitProperties(...)`)
 * -- y el detector las contaba como "código inalcanzable", dos falsos
 * positivos confirmados a mano. Nota deliberada: esto NO se extiende a la
 * `def` anidada de Python (`function_definition`, mismo nombre de campo que
 * el resto de la familia `functionNodes` mira) -- en Python un `def`
 * anidado SÍ se ejecuta en el punto textual en el que aparece (liga el
 * nombre en ese instante, sin hoisting), así que un `def` después de un
 * `return` real SIGUE siendo código muerto genuino y debe seguir contando.
 *
 * ARREGLO MEDIDO (Ola O, corpus externo -- nest, `fastify-middie.ts#middie`):
 * `interface_declaration` (TS/C#) y `type_alias_declaration` (TS) son
 * declaraciones de TIPO puro -- van MÁS ALLÁ de "izadas": no tienen NINGUNA
 * representación en tiempo de ejecución, en ninguna posición textual, porque
 * el compilador las borra por completo (a diferencia de una función izada,
 * que SÍ sigue generando código, sólo que disponible antes de su posición
 * textual). El mismo argumento que ya vale para "izada" vale con más fuerza
 * todavía para "borrada": si ni siquiera hoisting hace falta para que algo
 * no tenga efecto observable, un salto antes de esa declaración tampoco deja
 * nada inalcanzable detrás. Caso real: `middie` declara `interface
 * HolderInstance {...}` después de su `return { use, run }` -- sin este
 * arreglo, el detector la contaba como código real y disparaba sobre una
 * declaración que ni siquiera existe después de compilar.
 */
const NON_EXECUTABLE_TYPE =
  /comment|^(pragma|region|endregion)_directive$|^local_function_statement$|^function_declaration$|^interface_declaration$|^type_alias_declaration$/i;

/**
 * Directivas de compilación CONDICIONAL (`#if`/`#elif`/`#else`/`#endif` --
 * gramática de C#, la única de las nueve soportadas con preprocesador
 * textual). Encontrado corriendo el detector sobre el corpus externo
 * (newtonsoft-json), no adivinado: confirmado por sonda directa que
 * `tree-sitter-c_sharp` SÍ expone estas directivas como nodos NOMBRADOS,
 * intercalados como hermanos de las sentencias reales -- `tree-sitter` no
 * evalúa el preprocesador, así que ambas ramas de un `#if`/`#else` aparecen,
 * en el árbol, como si fueran secuenciales. Cruzar una de estas fronteras
 * es DELIBERADAMENTE tratado como "no sé", no como "sigue igual": qué rama
 * se compila depende de un símbolo definido en tiempo de build que este
 * detector no evalúa, así que nunca es correcto afirmar que el código del
 * otro lado se ejecuta o no se ejecuta. Deliberadamente NO incluye
 * `region_directive`/`endregion_directive`/`pragma_directive`: esas no
 * excluyen código de ningún build, son marcadores puramente organizativos
 * del editor -- código real antes/después de un `#region` sigue siendo
 * código real y sigue debiendo contar.
 */
const CONDITIONAL_DIRECTIVE_TYPE = /^(if|elif|else|endif)_directive$/;

/**
 * ARREGLO MEDIDO (Ola AW · AW6, corpus externo — `redmine`, TRES falsos
 * confirmados a mano). Una CLÁUSULA DE MANEJO DE EXCEPCIONES es hermana del
 * salto en el árbol, pero NO es "lo que sigue": se ejecuta por otro camino.
 *
 *   · `ensure`/`finally` corre SIEMPRE, incluso DESPUÉS del `return` — es
 *     literalmente su razón de ser. Caso: `redmine/app/models/webhook.rb:67`,
 *     donde el `ensure` que cierra la conexión HTTP se reportaba como
 *     inalcanzable detrás del `return http.request(request)`.
 *   · `rescue`/`catch`/`except` corre cuando el cuerpo LEVANTA, así que un
 *     `return` en el cuerpo no lo hace inalcanzable. Casos:
 *     `redmine/app/controllers/application_controller.rb:727` (`parse_qvalues`)
 *     y `redmine/app/jobs/destroy_project_job.rb:49` (`delete_project`), los
 *     dos con la forma idiomática de Ruby `def … return x rescue … end`.
 *
 * Vocabulario de GRAMÁTICA, uniforme para las seis (Ruby `rescue`/`ensure`,
 * Python `except_clause`/`finally_clause`/`else_clause`, JS/TS/Java/C#
 * `catch_clause`/`finally_clause`) — la misma clase de lista genérica que
 * `JUMP_WORD` de este mismo archivo, no una lista por lenguaje.
 */
const EXCEPTION_CLAUSE_TYPE = /^(rescue|ensure|catch|finally|except|else)(_clause)?$/;

/** El nombre de la palabra de salto (grupo 1 de `JUMP_WORD`), para el título. */
function jumpKeyword(nodeType: string): string {
  return JUMP_WORD.exec(nodeType)?.[1] ?? nodeType;
}

/**
 * Mismo nodo por RANGO (tipo + posición de inicio/fin), no por identidad de
 * objeto: `childForFieldName(...)` y `child(i)` devuelven, para el MISMO
 * nodo subyacente, dos wrappers JS distintos en `web-tree-sitter` (`===` da
 * `false` incluso cuando ambos apuntan al mismo nodo real -- confirmado por
 * sonda directa) — así que la única comparación estable con la superficie
 * que este módulo tiene disponible (`AstNode`, sin `.id`/`.equals`
 * declarados) es su rango de código fuente.
 */
function sameNode(a: AstNode, b: AstNode): boolean {
  return (
    a.type === b.type &&
    a.startPosition.row === b.startPosition.row &&
    a.startPosition.column === b.startPosition.column &&
    a.endPosition.row === b.endPosition.row &&
    a.endPosition.column === b.endPosition.column
  );
}

/**
 * Los mismos cuatro nombres de campo GENÉRICOS que `code-grammar.ts` ya usa
 * para reconocer if/clase por FORMA (`isIfLike`/`isClassLike`: `condition`+
 * `alternative`, `body`+`name`) -- nunca vocabulario de dominio, sólo
 * nombres de campo que las gramáticas soportadas comparten.
 */
const CONTROL_FIELDS = ["condition", "consequence", "alternative", "body"] as const;

/**
 * `true` cuando `candidate` ES uno de los campos de control de su propio
 * `parent` -- ver "FALSOS POSITIVOS CONOCIDOS" en el docstring del módulo,
 * "if/else de una sola sentencia sin llaves". Cuando eso pasa, `parent` no
 * es una secuencia de sentencias: es un constructo compuesto (if/while/
 * modificador de Ruby/…) cuyos hijos codifican ESTRUCTURA (cuál es la
 * condición, cuál la rama verdadera, cuál la falsa), no ORDEN DE EJECUCIÓN
 * -- así que ningún hermano de `candidate` bajo `parent` es "código que
 * sigue" en el sentido que esta regla necesita, sea cual sea ese hermano.
 */
function isControlFieldTarget(parent: ProbeNode, candidate: AstNode): boolean {
  for (const field of CONTROL_FIELDS) {
    const target = parent.childForFieldName(field) as AstNode | null;
    if (target && sameNode(target, candidate)) return true;
  }
  return false;
}

export const detector: IntraFunctionDetector<ThresholdKey, "unreachable-code"> = {
  id: "unreachable-code",
  kind: "unreachable-code",
  scope: "intra-function",
  title: "Código inalcanzable",
  needs: [],
  thresholds: {
    presence: citado(1, {
      work: "SonarSource",
      rule: "S1763",
      url: "https://rules.sonarsource.com/javascript/RSPEC-1763/",
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("presence");
    const findings: RawFinding[] = [];

    walkTree(fn.node, (node) => {
      const named: AstNode[] = [];
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        // `ProbeNode`'s inherited `child()` (what `walkTree` iterates)
        // returns `ProbeNode`, not `AstNode` -- a real tree's children ARE
        // `AstNode`-shaped at runtime (same parser, same node kind); every
        // consumer of a real tree either casts or only reads the
        // `ProbeNode` surface while walking and casts ONCE, at the leaf,
        // only where `.text`/position is actually needed -- here, as soon
        // as a child is collected into the sibling list this function
        // reasons about.
        if (child && child.isNamed) named.push(child as AstNode);
      }

      for (let i = 0; i < named.length; i++) {
        const candidate = named[i]!;
        if (!JUMP_WORD.test(candidate.type)) continue;
        // Ver "FALSOS POSITIVOS CONOCIDOS" en el docstring del módulo y
        // `isControlFieldTarget`: si el propio salto ES un campo de control
        // de su padre (Ruby `if_modifier`'s `body`; un `if`/`else` de una
        // sola sentencia sin llaves, donde `consequence`/`alternative` son
        // el salto DIRECTAMENTE, sin bloque envolvente), ese padre no es una
        // secuencia de sentencias -- es un único constructo compuesto, y
        // ninguno de sus otros hijos es "código que sigue" en el sentido que
        // esta regla necesita.
        if (isControlFieldTarget(node, candidate)) continue;

        // Ver `CONDITIONAL_DIRECTIVE_TYPE`: cruzar un `#if`/`#elif`/`#else`/
        // `#endif` corta la lista ACÁ -- lo que está del otro lado depende
        // de un símbolo de build que este detector no evalúa, así que nunca
        // se cuenta como "código que sigue" en ningún sentido.
        const rawAfter = named.slice(i + 1);
        const directiveBoundary = rawAfter.findIndex((n) => CONDITIONAL_DIRECTIVE_TYPE.test(n.type));
        const after = directiveBoundary === -1 ? rawAfter : rawAfter.slice(0, directiveBoundary);
        const realAfter = after.filter((n) => !NON_EXECUTABLE_TYPE.test(n.type) && !EXCEPTION_CLAUSE_TYPE.test(n.type));
        if (realAfter.length === 0) continue; // sólo nodos inertes (o nada, o cruza a otra rama de compilación) después: no hay código inalcanzable que reportar

        // ARREGLO MEDIDO (Ola AW · AW6) — ARTEFACTO DE ASI. El salto NO TIENE
        // ARGUMENTO y entre él y lo que sigue hay un COMENTARIO. Eso no es
        // código detrás de un salto: es la inserción automática de punto y coma
        // de JS/TS, que `tree-sitter` aplica cuando un comentario de bloque se
        // mete entre `return` y su expresión. Casos reales, los dos juzgados
        // FALSOS: `preact/debug/src/debug.js:53`
        // (`return /** @type {string} */ (parent.type);`) y
        // `preact/compat/src/hooks.js:77` (`return /** @type {T} */ ( function
        // () {…} );`). Un `return` de verdad sin valor casi nunca lleva un
        // comentario pegado antes de la sentencia siguiente, y un salto CON
        // argumento no puede ser este artefacto — por eso van las dos
        // condiciones juntas y no la de "misma línea", que dejaba afuera el
        // caso de `hooks.js` (el comentario está en la línea del `return` pero
        // la expresión arranca en la siguiente).
        //
        // Comprobación NEGATIVA, para que se vea que la regla no come lo bueno:
        // `hugo/internal/warpc/js/common.js:33` (`throw new Error(...)` seguido
        // de un `break`) — el `throw` SÍ tiene argumento, la regla no dispara, y
        // ése es el ÚNICO verdadero de este detector en el corpus.
        const jumpHasArgument = (() => {
          for (let k = 0; k < candidate.childCount; k++) {
            const ch = candidate.child(k);
            if (ch && ch.isNamed && !/comment/i.test(ch.type)) return true;
          }
          return false;
        })();
        const commentBeforeFirstReal = after.some(
          (n) => /comment/i.test(n.type) && n.startPosition.row <= realAfter[0]!.startPosition.row,
        );
        if (!jumpHasArgument && commentBeforeFirstReal) continue;

        // ARREGLO (Ola O, ver "RANGO REPORTADO" en el docstring del módulo): el rango
        // se calcula sobre `realAfter` (lo que de verdad cuenta como violación), no
        // sobre `after` (que incluye código izado/borrado ya excluido de la cuenta) --
        // si una declaración izada/borrada queda al principio o al final de `after`,
        // el rango YA NO la incluye como si fuera parte de "lo inalcanzable".
        const first = realAfter[0]!;
        const last = realAfter[realAfter.length - 1]!;
        const startLine = first.startPosition.row + 1;
        const endLine = last.endPosition.row + 1;
        const keyword = jumpKeyword(candidate.type);

        findings.push({
          title:
            realAfter.length === 1
              ? `Código inalcanzable después de "${keyword}" en "${fn.name ?? "función anónima"}"`
              : `${realAfter.length} sentencias inalcanzables después de "${keyword}" en "${fn.name ?? "función anónima"}"`,
          detail:
            `El flujo de control ya salió del bloque en "${keyword}": lo que sigue en el mismo bloque nunca se ` +
            "ejecuta. Suele ser el resto de una refactorización a medias o lógica que quien lee el código cree " +
            "viva, pero que el intérprete jamás alcanza -- cambiarla no tiene ningún efecto observable.",
          trigger: [{ label: "sentencias inalcanzables", value: realAfter.length, threshold }],
          locations: [
            {
              file: fn.file,
              startLine,
              endLine,
              symbol: fn.name ?? undefined,
              role: "código inalcanzable",
            },
          ],
          severity: Math.min(100, 55 + (realAfter.length - 1) * 10),
          advice: {
            primary: {
              name: "Eliminar código muerto",
              kind: "refactorizacion",
              why: "Código que el intérprete nunca alcanza no aporta nada y confunde a quien lee el archivo: ningún test lo va a cubrir jamás, porque no hay forma de llegar a esa línea en tiempo de ejecución.",
              source: "https://refactoring.guru/es/smells/dead-code",
            },
          },
        });

        // Se detiene en el primer salto de ESTE bloque con código real
        // detrás: el resto del bloque ya quedó cubierto por este mismo
        // hallazgo (ver "SIMPLIFICACIONES DECLARADAS" en el docstring).
        break;
      }
    });

    return findings;
  },
};
