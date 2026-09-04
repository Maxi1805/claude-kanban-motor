/**
 * Extract Method — Ola W, frente W3. Ancla NUEVA sobre `long-function`
 * (2.489 hallazgos, 85 % de precisión con n=20, 17-19 verdaderos medidos —
 * ver `COBERTURA-NIVEL-2.md` §3.B): el mayor volumen sano del catálogo sin
 * conectar a ningún patrón. Cero cambios en `detect/**` — este archivo sólo
 * lee lo que `long-function.ts` ya produce.
 *
 * ── LA INTENCIÓN, EN UNA FRASE ─────────────────────────────────────────────
 * Un cuerpo largo suele mezclar VARIOS pasos que el propio autor ya delimitó
 * visualmente (líneas en blanco entre bloques) — el remedio es aislar cada
 * paso en su propio método con nombre, no "una función con muchas líneas".
 * Extraer método reduce la distancia entre lo que el código HACE (una
 * secuencia de operaciones entrelazadas) y lo que DICE (nombres de método
 * que documentan cada paso) — el motivo que Fowler da para todo el capítulo.
 *
 * ── POR QUÉ NO ANCLAR EN LA LÍNEA CRUDA (evitar el error de la Ola U/V) ────
 * `long-function` YA es un ancla-smell (extensión física por encima de un
 * umbral derivado del corpus) — pero "muchas líneas" por sí solo NO dice
 * nada sobre si el cuerpo es DECOMPONIBLE: una función de 400 líneas puede
 * ser un ÚNICO `switch` mecánico (una tabla de despacho, un solo bloque) o
 * puede genuinamente hacer seis cosas distintas en secuencia. El `required`
 * de este archivo pregunta por la SEGUNDA forma, nunca por la primera —
 * es la diferencia entre anclar en el SMELL (líneas) + una pregunta de
 * INTENCIÓN (¿hay pasos separables?) en vez de en la sola estructura.
 *
 * ── LA PREGUNTA ESTRUCTURAL, CONTESTADA POR LA GRAMÁTICA ───────────────────
 * ¿El cuerpo de la función, mirado por sus HIJOS DIRECTOS (nunca recursivo:
 * un closure anidado cuenta como UN paso, no se abre), se divide en >= 3
 * "párrafos" — grupos separados por >= 1 línea en blanco, cada uno con
 * alguna sentencia real (no sólo comentarios)? Ningún vocabulario de
 * dominio: la señal es la gramática (posición de fila de cada hijo nombrado
 * del bloque), el mismo criterio que ya usa Fowler para decidir DÓNDE cortar
 * ("look for comments... or for blank lines... they often signal a
 * conceptual break").
 *
 * ── VERIFICADO CONTRA LOS VEREDICTOS DEL NIVEL 1 (no adivinado) ────────────
 * Medido abriendo, uno por uno, los `verdadero` y `falso` de
 * `tests/golden/precision/*.verdicts.csv` sobre los 13 repos del corpus
 * (`click/cobra/hugo/jekyll/nest/newtonsoft-json/preact/rubocop/sqlalchemy/
 * vueuse`, 19 `verdadero` medidos). Las TRES formas `falso` que sobreviven a
 * la exclusión de literales multilínea que `long-function.ts` ya hace, las
 * tres SIN excepción tienen < 3 párrafos reales bajo esta regla:
 *   - `newtonsoft-json/.../JsonWriter.cs:1478 WriteValue`: el cuerpo ENTERO
 *     es `while (true) { switch (typeCode) { ...30 casos... } }` — UN solo
 *     hijo directo (el `while`), 0 líneas en blanco entre sentencias top-
 *     level. Tabla de despacho mecánica, no varios pasos.
 *   - `guava/.../AbstractCompositeHashFunction.java:74 fromHashers`: el
 *     cuerpo ENTERO es `return new Hasher() { ...12 overrides... };` — UNA
 *     sola sentencia top-level (la clase anónima es UN valor, no se
 *     recorre). Delegación repetitiva, no varios pasos.
 *   - `guava/.../AggregateFutureState.java:84 getOrInitSeenExceptions`: el
 *     comentario, la declaración, el `if` y el `return` están TODOS pegados
 *     sin una sola línea en blanco entre sí — 1 párrafo, dominado por texto
 *     de comentario (~45 de 58 líneas).
 * Y de los 19 `verdadero` inspeccionados a mano (`click/src/click/core.py:1477
 * main`, `.../decorators.py:421 version_option`, `.../decorators.py:168
 * command`, `.../parser.py:51 _unpack_args`, `nest/.../listeners-
 * controller.ts:61 registerPatternHandlers`, `sqlalchemy/.../base.py:257
 * trans_ctx_manager_fixture`, `vueuse/.../useStyleTag/index.ts:62
 * useStyleTag`, `hugo/.../sort.go:31 Sort`, `newtonsoft-json/.../
 * JsonSchemaModelBuilder.cs:57 AddSchema`, entre otros) NINGUNO tiene menos
 * de 3 párrafos reales — todos mezclan, en secuencia, validación +
 * transformación + efecto, con líneas en blanco entre cada tramo.
 *
 * ── TEMPLATE METHOD, EVALUADO Y DESCARTADO PARA ESTA ANCLA (con criterio,
 *    no por omisión) ────────────────────────────────────────────────────────
 * El encargo de esta ola pedía elegir entre Extract Method y Template Method
 * "si el cuerpo tiene un esqueleto con pasos variables" — que exige una
 * jerarquía real (una base con >=2 subtipos que sobrescriben un gancho que
 * el esqueleto invoca). Verificado, no asumido: de los 19 `verdadero`, CERO
 * viven en un tipo con hermanos de herencia relevantes al propio cuerpo —
 * `CliRunner.invoke`/`_resolve_context` (click) no tienen subtipos;
 * `TreeNode`-style de otros patrones no aplica acá; `Sort`/`defaultUsageFunc`
 * (Go, Cobra) son funciones de paquete sin clase; `useStyleTag` es un
 * composable de Vue sin herencia. Conectar `long-function` a Template Method
 * hoy sería estructura sin smell que lo sostenga — exactamente el error que
 * `COBERTURA-NIVEL-2.md` prohíbe. `template-method.ts` queda SIN TOCAR.
 *
 * ── QUÉ NO CUBRE (declarado, no escondido) ──────────────────────────────────
 * Una función SIN líneas en blanco pero genuinamente decomponible (mal
 * formateada) no dispara — falso negativo aceptado, más seguro que inferir
 * límites de párrafo por otra vía (indentación, longitud) que no tiene
 * respaldo gramatical. Y el `appliedState` de abajo declara `ya-aplicado`
 * cuando TODOS los párrafos reales son de una sola sentencia sin control de
 * flujo (una función que YA es una secuencia de llamadas a pasos con nombre
 * propio: no hay nada más que extraer) — no puede alcanzarlo mientras el
 * `required` exija >= 3 párrafos, así que hoy es una clasificación teórica
 * sobre población fuera de los 19 medidos; queda escrita para cuando la
 * población crezca, con su propio test.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * OLA AH, FRENTE AH3 — SEGUNDA ANCLA: `complexity`, POR UN CAMINO PROPIO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * POR QUÉ. `complexity` es el SILENCIO MÁS GRANDE del catálogo en las DOS
 * poblaciones, medido sobre el volcado del árbol del día de esta ola
 * (`scratchpad-int-ag/dumps13` + `dumpsapp`, 21 repos):
 *
 *     complexity  ·  bibliotecas 1.318 de 1.320 sin NINGUNA hipótesis (99,8 %)
 *                 ·  aplicaciones 2.394 de 2.400 (99,8 %)
 *
 * No es un kind mudo —`chain-of-responsibility.ts` ya lo ancla— y su techo de
 * NIVEL 1 es de los más altos del catálogo: 16/20 = 80,0 % [58,4 %, 91,9 %]
 * en bibliotecas, medido con el filtro de vigencia sobre las 13 planillas. Y
 * el patrón que le corresponde es justamente éste: `Extract Method ·
 * long-function` mide 69/87 = 79,3 % [69,6 %, 86,5 %] en bibliotecas y 3/3 en
 * aplicaciones — la celda mejor medida del catálogo. Es el criterio que la
 * Ola AH usa para decidir dónde construir: *el MISMO patrón rinde mucho mejor
 * en un ancla hermana*.
 *
 * POR QUÉ UN CAMINO PROPIO Y NO ALCANZA CON AGREGAR EL ANCLA AL ARRAY. El
 * único `required` del camino viejo (`variosPasosSeparados`) pregunta por
 * LÍNEAS EN BLANCO entre los HIJOS DIRECTOS del cuerpo: es una prueba de
 * forma para funciones LARGAS Y PLANAS. Una función CORTA Y PROFUNDA —que es
 * exactamente lo que `complexity` detecta— tiene uno o dos hijos directos y
 * falla ese `required` por construcción, aunque lleve adentro un bloque
 * anidado de 26 líneas listo para extraer. Medido: de las 691 funciones de
 * biblioteca que tienen los DOS hallazgos, 151 no reciben hoy ninguna
 * recomendación de Extract Method porque su cuerpo no tiene ni una línea en
 * blanco (`cobra/command.go:1974 defaultUsageFunc`, cognitiva 47, 70 líneas
 * sin una sola línea en blanco y un bloque anidado de 26; toda la familia
 * `guava/.../RegularImmutableMap`, `MoreExecutors`, `AbstractFuture`).
 *
 * LA FUERZA. La situación que Extract Method resuelve no es "muchas líneas"
 * (eso es `long-function`) sino "un fragmento que se puede agrupar y
 * nombrar". En una función marcada por `complexity` el costo MEDIDO viene del
 * ANIDAMIENTO: S3776 cobra +1 por bifurcación y +1 más por cada nivel que la
 * envuelve. Levantar un bloque profundo a su propio método pone ese
 * anidamiento en cero adentro del método nuevo y lo reemplaza, en el sitio de
 * llamada, por UN paso con nombre. Es el mecanismo del patrón aplicado a la
 * causa medida del costo, no a un síntoma correlacionado.
 *
 * LA ESCALA, con su razón escrita ANTES de medir, y las dos mitades tomadas
 * de líneas que YA existen en este repo:
 *   (a) `metrics.maxNesting >= 3` — el propio detector del ancla
 *       (`detect/intra-function/complexity.ts`) usa `fn.maxNesting >= 3 ?
 *       "nesting" : "branchCount"` para nombrar el DRIVER dominante del costo
 *       que mide. Cuando el driver es el CONTEO DE RAMAS (una tabla de
 *       despacho plana) Extract Method no tiene dónde cortar — y ésa es
 *       exactamente la forma que este mismo módulo ya documenta como `falso`
 *       más arriba (`JsonWriter.WriteValue`). Exigir que el driver sea
 *       anidamiento es exigir que el remedio coincida con la causa.
 *   (b) existe un bloque de control con >= 1 envoltura y >= 2 decisiones
 *       PROPIAS. La escala se expresa en la moneda del ancla (decisiones que
 *       la métrica ya contó), no en líneas: extraer ese bloque saca >= 2
 *       decisiones que se estaban cobrando CON recargo de profundidad. Un
 *       bloque con una sola guarda no paga un método nuevo (un nombre, una
 *       llamada y sus parámetros); uno que carga su propia decisión es un
 *       PASO en el sentido de Fowler. Un CONTENEDOR DE SWITCH nunca es
 *       candidato: sus brazos son alternativas de UNA decisión, y el remedio
 *       de esa forma es Strategy/State sobre `repeated-switch`/`type-switch`
 *       — lo que el propio `TO_CONFIRM` de este archivo ya dice.
 *
 * LA RESOLUCIÓN VERIFICADA — NO PROPONER DOS VECES LO MISMO. Medido sobre el
 * volcado del día: de los 16 `complexity` de la lente comparable, 12 están
 * sobre una función que TAMBIÉN tiene un hallazgo `long-function`, y 9 de
 * esos 12 ya llevan una recomendación de Extract Method por el ancla vieja;
 * en la población completa, bibliotecas 691 de 1.320 (540 ya con Extract
 * Method) y aplicaciones 1.385 de 2.400 (1.083). Emitir de nuevo el MISMO
 * remedio sobre la MISMA función, colgado de otro id de hallazgo, no es
 * cobertura nueva: es doble conteo. El tercer `required` de este camino
 * (`noLoProponeYaElAnclaLarga`) se calla cuando el camino viejo YA dispara
 * sobre esa misma función — se reproduce su `required` exacto (>= 3 párrafos
 * reales) sobre el MISMO cuerpo, nunca se adivina. Es una compuerta sobre un
 * camino NUEVO que hoy no emite nada: no puede perder ni una propuesta
 * existente.
 *
 * EL HECHO QUE LA DECIDE, VERIFICADO ANTES DE ESCRIBIR ESTE CÓDIGO (sonda
 * `scripts/ah3-sonda-complexity.mts` sobre los 21 repos):
 *   · el archivo del hallazgo se revive y `file.functions` contiene la función
 *     anclada en la MISMA terna que `complexity.ts` escribe en `locations` —
 *     3.720 de 3.720 hallazgos `complexity` resuelven, sin una sola falla en
 *     ningún repo ni lenguaje;
 *   · `FunctionUnit.metrics.maxNesting` viene poblado en la corrida real;
 *   · `ctx.neighborhood.findingsInFile(...)` trae el gemelo `long-function`
 *     — real en la pasada que PUBLICA (`hypotheses/run.ts#
 *     rebuildHypothesesWithGraph`, que recibe el `neighborhoodIndex` y vuelve
 *     a llamar `build()` con el árbol revivido). En la pasada 1
 *     (`analyzeFile`) el vecindario es `EMPTY_NEIGHBORHOOD` por decisión
 *     arquitectural, así que ahí este `required` no puede ver el gemelo y el
 *     camino emite de más; la pasada 2 lo corrige porque sobreescribe
 *     `finding.hypotheses`. DECLARADO, no escondido: con
 *     `CK_HIPOTESIS_CON_GRAFO=0` o sin grafo, este camino sobre-emite sobre
 *     funciones que el ancla vieja ya cubre.
 *
 * LO QUE ESTE CAMINO **NO** CAMBIA: ni un `required`, ni un discriminador, ni
 * una rama de `appliedState` del camino de `long-function`. Esa celda
 * (79,3 %) tiene que seguir emitiendo exactamente lo mismo, y se cuenta.
 *
 * `ya-aplicado` ES INALCANZABLE DESDE ACÁ, Y SE DICE EN VOZ ALTA (mismo
 * criterio con el que `facade.ts` lo dice del camino de su ancla-fuerza): el
 * `required` (b) exige un bloque anidado con >= 2 decisiones propias sin
 * extraer, y "el patrón ya está aplicado" significa exactamente que ese
 * bloque ya vive en un método con nombre. Son incompatibles por construcción.
 * Que este camino no produzca `ya-aplicado` no es mérito suyo.
 */
import { CONSTRUCTOR_NAMES } from "../code-grammar.js";
import type { AstNode, Finding, FileUnit, FunctionUnit } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

const LONG_FUNCTION_KIND = "long-function";

/** Mínimo de "párrafos" reales para que el cuerpo cuente como "varios pasos
 *  separables" — ver el docstring del módulo para la verificación contra los
 *  22 veredictos (19 verdadero + 3 falso) que fijaron este número. */
const MIN_PARAGRAPHS = 3;

/** OLA AH (AH3) — la segunda ancla. Ver el bloque "SEGUNDA ANCLA" del
 *  docstring del módulo. */
const COMPLEXITY_KIND = "complexity";

/** OLA AH (AH3) — el piso de `maxNesting` para que un hallazgo `complexity`
 *  sea material de Extract Method. NO es un número de este archivo: es la
 *  MISMA línea con la que el detector del ancla
 *  (`detect/intra-function/complexity.ts`) nombra `"nesting"` como driver
 *  dominante del costo que mide (`fn.maxNesting >= 3 ? "nesting" :
 *  "branchCount"`). Por debajo de eso el costo lo domina el CONTEO de ramas
 *  —una tabla de despacho plana— y ahí Extract Method no tiene dónde cortar,
 *  que es la forma que este módulo ya documenta como `falso`. */
const MIN_MAX_NESTING = 3;

/** OLA AH (AH3) — envolturas mínimas del bloque candidato: >= 1 estructura de
 *  control por encima. Un bloque de control en el nivel superior del cuerpo
 *  ES el flujo propio de la función; extraerlo no baja el anidamiento de nada
 *  más. La profundidad se cuenta SÓLO con `sets.nestingNodes`, nunca con
 *  llaves ni indentación. */
const MIN_ENVOLTURAS = 1;

/** OLA AH (AH3) — decisiones propias mínimas del bloque candidato, él
 *  incluido. Es la ESCALA en la moneda del ancla: extraer el bloque saca >= 2
 *  decisiones que se estaban cobrando con recargo de profundidad. Con una
 *  sola (una guarda suelta) el método nuevo cuesta más de lo que ahorra. */
const MIN_DECISIONES_DEL_BLOQUE = 2;

/** OLA AH (AH3) — un BLOQUE, por definición estructural, abre en una fila y
 *  cierra en otra. No es un umbral calibrado: un nodo que entra en UNA sola
 *  fila no se puede reemplazar por una llamada a un método con nombre, porque
 *  la llamada ocupa esa misma fila — no hay nada que ganar. Sin este piso, la
 *  gramática mete como "bloque" cosas que no lo son y que sólo comparten la
 *  categoría de anidamiento: el ENCABEZADO `with ... as f:` de Python
 *  (`with_clause`, una fila) y el PARÁMETRO de un `catch` de Java
 *  (`catch_formal_parameter`, una fila) — los dos verificados abriendo el
 *  archivo (`click/src/click/_termui_impl.py:744`,
 *  `guava/.../FuturesGetChecked.java:77`). Se corrige acá, del lado del
 *  consumidor, y NO en `code-grammar.ts`: esos nodos SÍ son anidamiento para
 *  quien mide profundidad; lo que no son es un bloque extraíble. */
const MIN_LINEAS_DEL_BLOQUE = 2;

function hijosNombrados(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

/** Igual criterio que `unreachable-code.ts#COMMENT_LIKE`/`empty-catch.ts`:
 *  un `comment`/`line_comment` es un hijo NOMBRADO más del bloque, en las 9
 *  gramáticas de este proyecto — se reconoce por FORMA de nombre de nodo
 *  (`/comment/i`), nunca por lista de nombres por lenguaje. */
const COMMENT_NODE = /comment/i;

/** Un miembro function-like (mismo criterio que `composite.ts#esConstructor`,
 *  duplicado a propósito — ver el docstring del módulo de ese archivo para
 *  la misma "duplicación deliberada entre capas"): el nodo dedicado de la
 *  gramática, o el nombre que el LENGUAJE impone (`constructor`/`initialize`/
 *  `__init__`, o el nombre de la clase en Java/C#). Se usa sólo para que un
 *  constructor de una clase HERMANA (nunca de ésta: `long-function` ancla
 *  funciones sueltas o métodos, no constructores completos por su cuenta)
 *  no cuente como "operación con lógica" al clasificar un párrafo — un
 *  constructor que sólo asigna campos es la MISMA forma que
 *  `builder.ts#ensamblaConLogica` ya excluye para otro patrón.
 */
function esConstructor(file: FileUnit, fn: AstNode): boolean {
  if (file.sets.constructorNodes.has(fn.type)) return true;
  const nombre = (fn.childForFieldName("name") as AstNode | null)?.text;
  return nombre !== null && nombre !== undefined && CONSTRUCTOR_NAMES.has(nombre.toLowerCase());
}

interface Parrafo {
  /** Todos los hijos directos del párrafo, incluidos comentarios — para
   *  poder decidir el límite (línea en blanco) mirando exactamente lo que el
   *  autor escribió. */
  readonly todos: readonly AstNode[];
  /** Sólo los que NO son comentario — lo que cuenta como "código real". */
  readonly codigo: readonly AstNode[];
}

/**
 * Agrupa los hijos directos de un bloque por línea en blanco: dos hijos
 * consecutivos quedan en el MISMO párrafo si no hay ninguna fila vacía entre
 * el fin de uno y el comienzo del otro (`siguiente.startRow - anterior.endRow
 * >= 2` ⇒ hay >= 1 fila en blanco). Los comentarios SE CUENTAN para decidir
 * el límite (ocupan filas reales) pero no para decidir si el párrafo tiene
 * código — ver `esParrafoReal`.
 */
function agruparPorLineasEnBlanco(hijos: readonly AstNode[]): Parrafo[] {
  if (hijos.length === 0) return [];
  const grupos: AstNode[][] = [[hijos[0]!]];
  for (let i = 1; i < hijos.length; i++) {
    const anterior = hijos[i - 1]!;
    const actual = hijos[i]!;
    const hayLineaEnBlanco = actual.startPosition.row - anterior.endPosition.row >= 2;
    if (hayLineaEnBlanco) grupos.push([actual]);
    else grupos[grupos.length - 1]!.push(actual);
  }
  return grupos.map((todos) => ({ todos, codigo: todos.filter((n) => !COMMENT_NODE.test(n.type)) }));
}

function esParrafoReal(p: Parrafo): boolean {
  return p.codigo.length > 0;
}

/** ¿Este párrafo tiene lógica real — no una secuencia plana de
 *  declaraciones/asignaciones sin ninguna decisión ni recorrido? Cualquiera
 *  de dos señales, ambas de GRAMÁTICA (nunca de nombre): agrupa >= 2
 *  sentencias de código (un closure con su propio cuerpo cuenta como una
 *  unidad — no se abre), o alguna de sus sentencias ES una estructura de
 *  control (`sets.branchNodes`: if/for/while/switch/ternario) o de manejo de
 *  excepciones (`sets.exceptionNodes`: try/catch/rescue). */
function tieneLogicaReal(p: Parrafo, sets: FunctionUnit["sets"]): boolean {
  if (p.codigo.length >= 2) return true;
  const unico = p.codigo[0];
  if (!unico) return false;
  return sets.branchNodes.has(unico.type) || sets.exceptionNodes.has(unico.type);
}

interface FormaDeLaFuncion {
  readonly nombre: string;
  readonly sets: FunctionUnit["sets"];
  /** Sólo los párrafos con >= 1 sentencia de código (comentarios-solos ya
   *  filtrados) — lo que `variosPasosSeparados` cuenta. */
  readonly parrafosReales: readonly Parrafo[];
}

/** La función anclada, ubicada por la MISMA terna que `long-function.ts`
 *  usa para construir su `Finding` (`fn.startLine`/`fn.endLine`, de
 *  `FunctionUnit` directo — nunca reconstruida caminando el árbol, a
 *  diferencia de `composite.ts#claseDelAncla`, que sí necesita caminar
 *  porque busca una CLASE por nombre+rango; acá `file.functions` ya trae la
 *  lista exacta que el propio detector recorrió). */
function funcionDelAncla(file: FileUnit, startLine: number, endLine: number): FunctionUnit | null {
  return file.functions.find((fn) => fn.startLine === startLine && fn.endLine === endLine) ?? null;
}

/**
 * La forma de la función anclada, leída del árbol vivo — `null` cuando no
 * hay árbol vivo, el hallazgo no trae ubicación, o la función no se pudo
 * ubicar. `null` NUNCA se lee como "cumple" (mismo contrato que
 * `composite.ts#analizarFormaDelAncla`): los checks de abajo lo tratan como
 * "no evaluado ⇒ no candidata".
 *
 * EXPORTADA por el mismo motivo que su análogo de `composite.ts`: para que
 * el medidor de este frente pueda contar el embudo sin reimplementar la
 * clasificación por su cuenta.
 */
export function analizarFormaDeLaFuncion(problem: Finding, ctx: HypothesisContext): FormaDeLaFuncion | null {
  const file = ctx.file;
  const primera = problem.locations[0];
  if (!file || !primera) return null;
  if (file.path !== primera.file) return null;
  const fn = funcionDelAncla(file, primera.startLine, primera.endLine);
  if (!fn) return null;
  const body = (fn.node.childForFieldName("body") as AstNode | null) ?? fn.node;
  const parrafosReales = agruparPorLineasEnBlanco(hijosNombrados(body)).filter(esParrafoReal);
  return { nombre: fn.name ?? "(anónima)", sets: fn.sets, parrafosReales };
}

interface ExtractMethodProblem {
  finding: Finding;
  forma: FormaDeLaFuncion | null;
}

const APPLIED_LABEL =
  "¿Todos los párrafos reales del cuerpo son de una sola sentencia y ninguno tiene control de flujo — el cuerpo YA " +
  "es una secuencia plana de pasos con nombre propio, sin lógica entrelazada que extraer?";

/**
 * REQUIRED — la única puerta: >= `MIN_PARAGRAPHS` párrafos reales. Ver el
 * docstring del módulo para la verificación contra los 22 veredictos
 * (19 verdadero + 3 falso) que fijaron este número — las tres formas falsas
 * medidas (tabla de despacho mecánica, delegación repetitiva de una clase
 * anónima, cuerpo dominado por comentario) tienen las TRES menos de 3
 * párrafos bajo esta regla, y ninguno de los 19 verdaderos tiene menos.
 */
const variosPasosSeparados: Check<ExtractMethodProblem, CodeGraph | null> = {
  id: "varios-pasos-separados-por-blancos",
  describe:
    `El cuerpo se divide en >= ${MIN_PARAGRAPHS} bloques separados por líneas en blanco (los límites que el propio ` +
    "autor ya marcó) — sin esa división visible el cuerpo es una sola pieza (una tabla de despacho, una expresión " +
    "larga, una clase anónima con overrides repetitivos) y Extract Method no tiene dónde cortar.",
  run(problem) {
    const forma = problem.forma;
    if (!forma) {
      return {
        holds: false,
        evidence: "Sin árbol vivo del archivo, o no se pudo ubicar la función anclada en `file.functions`: sin evaluar, no candidata.",
      };
    }
    const n = forma.parrafosReales.length;
    if (n < MIN_PARAGRAPHS) {
      return {
        holds: false,
        evidence:
          `"${forma.nombre}" tiene sólo ${n} bloque(s) separados por líneas en blanco: no hay una división visible ` +
          "en pasos — el cuerpo es más compatible con una sola pieza (despacho mecánico, expresión larga, clase " +
          "anónima repetitiva) que con varios pasos que extraer por separado.",
      };
    }
    return {
      holds: true,
      evidence: `"${forma.nombre}" se divide en ${n} bloques separados por líneas en blanco: el propio autor ya marcó los límites entre pasos candidatos a extraer.`,
    };
  },
};

/**
 * DISCRIMINADOR — cuántos de esos párrafos tienen lógica real (no sólo
 * declaraciones planas). Más párrafos con decisión/recorrido propio es más
 * evidencia de que el cuerpo mezcla varias responsabilidades, no una sola
 * secuencia de inicialización.
 */
const variosPasosConLogica: Check<ExtractMethodProblem, CodeGraph | null> = {
  id: "varios-pasos-con-logica-real",
  describe: "Al menos 2 de los bloques tienen control de flujo propio o agrupan >= 2 sentencias — no sólo un bloque hace algo, varios lo hacen.",
  run(problem) {
    const forma = problem.forma;
    if (!forma) return { holds: false, evidence: "Sin forma clasificable: no evaluado." };
    const conLogica = forma.parrafosReales.filter((p) => tieneLogicaReal(p, forma.sets));
    const holds = conLogica.length >= 2;
    return {
      holds,
      evidence: holds
        ? `${conLogica.length} de ${forma.parrafosReales.length} bloques de "${forma.nombre}" tienen control de flujo propio o agrupan varias sentencias.`
        : `Sólo ${conLogica.length} de ${forma.parrafosReales.length} bloques de "${forma.nombre}" tiene lógica propia — el resto son declaraciones/asignaciones planas.`,
    };
  },
};

/** DISCRIMINADOR — un cuerpo con más división visible es más evidencia de
 *  pasos separables (nunca decisivo: el `required` ya fija el piso). */
const masDeCincoPasos: Check<ExtractMethodProblem, CodeGraph | null> = {
  id: "mas-de-cinco-pasos",
  describe: `El cuerpo se divide en >= ${MIN_PARAGRAPHS + 2} bloques (más que el mínimo que ya exige el required) — cuantos más pasos visibles, más claro el corte.`,
  run(problem) {
    const forma = problem.forma;
    const n = forma?.parrafosReales.length ?? 0;
    const holds = n >= MIN_PARAGRAPHS + 2;
    return {
      holds,
      evidence: forma
        ? `"${forma.nombre}" tiene ${n} bloques (${holds ? ">=" : "<"} ${MIN_PARAGRAPHS + 2}).`
        : "Sin forma clasificable: no evaluado.",
    };
  },
};

/** DISCRIMINADOR — baja densidad de comentario dentro de los párrafos
 *  reales (comparado con el total de filas que ocupan): un cuerpo donde el
 *  comentario domina es más "documentación de una idea simple" que "varios
 *  pasos de lógica" — ver `AggregateFutureState.java:84` en el docstring del
 *  módulo, ya excluido por el `required`, pero esta señal generaliza el
 *  mismo criterio a cuerpos que sí pasan el piso de párrafos. */
const bajaDensidadDeComentario: Check<ExtractMethodProblem, CodeGraph | null> = {
  id: "baja-densidad-de-comentario",
  describe: "Menos de la mitad de las filas de los bloques reales son comentario — el cuerpo es mayormente lógica, no documentación.",
  run(problem) {
    const forma = problem.forma;
    if (!forma || forma.parrafosReales.length === 0) return { holds: false, evidence: "Sin forma clasificable: no evaluado." };
    let filasTotal = 0;
    let filasComentario = 0;
    for (const p of forma.parrafosReales) {
      for (const n of p.todos) {
        const filas = n.endPosition.row - n.startPosition.row + 1;
        filasTotal += filas;
        if (COMMENT_NODE.test(n.type)) filasComentario += filas;
      }
    }
    const proporcion = filasTotal > 0 ? filasComentario / filasTotal : 0;
    const holds = proporcion < 0.5;
    return {
      holds,
      evidence: `${filasComentario} de ${filasTotal} filas de los bloques reales son comentario (${Math.round(proporcion * 100)} %).`,
    };
  },
};

/**
 * `appliedState` — ver el docstring del módulo, sección "QUÉ NO CUBRE": con
 * el `required` de arriba puesto, un candidato siempre tiene >= 1 párrafo
 * con lógica real (si no, tendría 0 párrafos "con lógica" pero eso no
 * bloquea `required`, que sólo cuenta párrafos REALES, no con-lógica) — así
 * que esta función SÍ puede alcanzar `ya-aplicado` genuinamente: cuando
 * TODOS los párrafos reales resultan ser de una sola sentencia sin control
 * de flujo (una secuencia plana de llamadas a pasos ya extraídos), no hay
 * nada más que extraer y decirlo así es más honesto que forzar `ausente`.
 */
function appliedState(problem: ExtractMethodProblem): AppliedStateResult {
  const forma = problem.forma;
  if (!forma) {
    return {
      state: "ausente",
      checks: [{ label: APPLIED_LABEL, passed: false, why: "Sin forma clasificable: no evaluado. Se resuelve `ausente` por falta de evidencia.", role: "applied" }],
    };
  }
  const conLogica = forma.parrafosReales.filter((p) => tieneLogicaReal(p, forma.sets));
  if (conLogica.length === 0) {
    return {
      state: "ya-aplicado",
      checks: [
        {
          label: APPLIED_LABEL,
          passed: true,
          why:
            `Los ${forma.parrafosReales.length} bloques de "${forma.nombre}" son todos de una sola sentencia, sin ` +
            "control de flujo propio: el cuerpo ya es una secuencia plana de pasos con nombre (llamadas a helpers " +
            "ya extraídos) — no hay lógica entrelazada que separar más.",
          role: "applied",
        },
      ],
    };
  }
  return {
    state: "ausente",
    checks: [
      {
        label: APPLIED_LABEL,
        passed: false,
        why:
          `${conLogica.length} de ${forma.parrafosReales.length} bloques de "${forma.nombre}" tienen lógica propia ` +
          "(control de flujo o varias sentencias): el cuerpo mezcla pasos con lógica real, sin extraer.",
        role: "applied",
      },
    ],
  };
}

const SOURCE =
  "refactoring.guru/extract-method — \"Problem: You have a code fragment that can be grouped together. Solution: " +
  "Move this code to a separate new method...\"; Fowler, Refactoring (2nd ed.), cap. 6, \"Extract Function\": " +
  "\"whenever you feel the need to comment something, write a function instead\".";

const TO_CONFIRM: readonly string[] = [
  "Confirmar que los pasos no comparten TANTO estado local que extraerlos exigiría pasar la mayoría de las " +
    "variables de la función como parámetros — si eso pasa, el corte real puede ser otro (Extract Class, no " +
    "Extract Method).",
  "La agrupación es visual (líneas en blanco que el propio autor ya escribió) — confirmar a mano que cada bloque " +
    "es de verdad un paso autocontenido, no sólo un salto de línea por preferencia de formato.",
  "Si la clase que contiene esta función tiene >= 2 hermanas de herencia y alguno de estos pasos corresponde a un " +
    "gancho que las hermanas ya sobrescriben, el remedio correcto es Template Method, no Extract Method — ver el " +
    "docstring del módulo, sección evaluada y descartada para la población medida de esta ola.",
  "Un bloque dominado por un único `switch`/tabla de despacho, aunque conviva con otros pasos, puede pedir " +
    "Strategy/State sobre ESE bloque específico (anclas `conditional-chain`/`repeated-switch`) — Extract Method " +
    "es un remedio parcial ahí, no el único.",
];

/* ────────────────────────────────────────────────────────────────────────
 * OLA AH (AH3) — EL CAMINO DEL ANCLA `complexity`. Enteramente aparte: no
 * comparte ni un `required`, ni un discriminador, ni una rama de
 * `appliedState` con el camino de `long-function` de arriba. Ver el bloque
 * "SEGUNDA ANCLA" del docstring del módulo para la fuerza, la escala, la
 * resolución y el hecho verificado que lo decide.
 * ──────────────────────────────────────────────────────────────────────── */

/** Un bloque de control que se puede levantar a un método con nombre. */
interface BloqueExtraible {
  /** El tipo de nodo tal cual lo nombra la gramática — nunca traducido a vocabulario de dominio. */
  readonly tipo: string;
  readonly startLine: number;
  readonly lineas: number;
  /** Nodos de anidamiento en su subárbol, él incluido: cada uno es UNA decisión (un `switch` entero cuenta 1, no uno por brazo). */
  readonly decisiones: number;
  /** Cuántas estructuras de control lo envuelven dentro de la función. */
  readonly envolturas: number;
}

interface FormaAnidada {
  readonly nombre: string;
  readonly maxNesting: number;
  readonly bloques: readonly BloqueExtraible[];
  /** `id` del hallazgo `long-function` sobre la MISMA función cuyo `required` del camino viejo YA se cumple — `null` si no hay. */
  readonly gemeloLargoQueYaPropone: string | null;
}

interface ProblemaAnidado {
  finding: Finding;
  forma: FormaAnidada | null;
}

/**
 * Recorre el cuerpo UNA vez y, de abajo hacia arriba, deja en `out` cada
 * bloque candidato. Devuelve cuántas decisiones tiene el subárbol de `node`
 * (él incluido) para que el padre no tenga que volver a recorrerlo — O(n)
 * sobre el cuerpo, nunca O(n · profundidad).
 *
 * "Decisión" = un nodo de `sets.nestingNodes` (if-like, loop-like,
 * excepción, contenedor de switch). Un `switch` cuenta UNA, no una por brazo:
 * sus brazos son alternativas de la MISMA decisión — por eso los `switchArms`
 * de `branchNodes` no entran acá.
 */
function recolectarBloques(node: AstNode, sets: FunctionUnit["sets"], envolturas: number, out: BloqueExtraible[]): number {
  const esAnidamiento = sets.nestingNodes.has(node.type);
  let decisiones = esAnidamiento ? 1 : 0;
  const dentro = esAnidamiento ? envolturas + 1 : envolturas;
  for (const hijo of hijosNombrados(node)) decisiones += recolectarBloques(hijo, sets, dentro, out);
  const lineas = node.endPosition.row - node.startPosition.row + 1;
  if (
    esAnidamiento &&
    !sets.switchContainerNodes.has(node.type) &&
    envolturas >= MIN_ENVOLTURAS &&
    decisiones >= MIN_DECISIONES_DEL_BLOQUE &&
    lineas >= MIN_LINEAS_DEL_BLOQUE
  ) {
    out.push({
      tipo: node.type,
      startLine: node.startPosition.row + 1,
      lineas,
      decisiones,
      envolturas,
    });
  }
  return decisiones;
}

/**
 * ¿El camino viejo (`long-function`) YA propone Extract Method sobre esta
 * MISMA función? Dos condiciones, las dos verificadas, ninguna adivinada:
 * existe un `Finding` `long-function` cuya ubicación es EXACTAMENTE el rango
 * de esta función, y el único `required` de ese camino (>= `MIN_PARAGRAPHS`
 * párrafos reales) se cumple sobre este mismo cuerpo — se reevalúa acá con la
 * misma función (`agruparPorLineasEnBlanco`), nunca se supone.
 *
 * `ctx.neighborhood` es `EMPTY_NEIGHBORHOOD` en la primera pasada
 * (`analyzeFile`) por decisión arquitectural de `hypotheses/run.ts`; ahí esto
 * devuelve `null` y el camino emite de más. La pasada que PUBLICA
 * (`rebuildHypothesesWithGraph`) sí trae el vecindario real y sobreescribe.
 * Declarado en el docstring del módulo.
 */
function gemeloLargoQueYaPropone(fn: FunctionUnit, body: AstNode, ctx: HypothesisContext): string | null {
  const parrafosReales = agruparPorLineasEnBlanco(hijosNombrados(body)).filter(esParrafoReal).length;
  if (parrafosReales < MIN_PARAGRAPHS) return null;
  for (const otro of ctx.neighborhood.findingsInFile(fn.file)) {
    if (otro.kind !== LONG_FUNCTION_KIND) continue;
    const l = otro.locations[0];
    if (!l) continue;
    if (l.file === fn.file && l.startLine === fn.startLine && l.endLine === fn.endLine) return otro.id;
  }
  return null;
}

/**
 * La forma ANIDADA de la función anclada, leída del árbol vivo. `null` cuando
 * no hay árbol, el hallazgo no trae ubicación o la función no se pudo ubicar
 * — mismo contrato que `analizarFormaDeLaFuncion`: `null` NUNCA se lee como
 * "cumple".
 *
 * EXPORTADA por el mismo motivo que su hermana: para que el medidor del
 * frente pueda contar el embudo sin reimplementar la clasificación.
 */
export function analizarFormaAnidada(problem: Finding, ctx: HypothesisContext): FormaAnidada | null {
  const file = ctx.file;
  const primera = problem.locations[0];
  if (!file || !primera) return null;
  if (file.path !== primera.file) return null;
  const fn = funcionDelAncla(file, primera.startLine, primera.endLine);
  if (!fn) return null;
  const body = (fn.node.childForFieldName("body") as AstNode | null) ?? fn.node;
  const bloques: BloqueExtraible[] = [];
  recolectarBloques(body, fn.sets, 0, bloques);
  return {
    nombre: fn.name ?? "(anónima)",
    maxNesting: fn.metrics.maxNesting,
    bloques,
    gemeloLargoQueYaPropone: gemeloLargoQueYaPropone(fn, body, ctx),
  };
}

/**
 * REQUIRED 1 — el ANIDAMIENTO es el driver del costo que el ancla midió.
 * QUÉ INTENCIÓN VERIFICA: que el remedio coincida con la CAUSA medida. Un
 * cuerpo cuya complejidad viene del conteo de ramas (un `switch` de 30 brazos,
 * una tabla de despacho) no tiene dónde cortar, y este módulo ya documenta
 * esa forma como `falso` entre sus veredictos de nivel 1.
 */
const anidamientoEsElDriver: Check<ProblemaAnidado, CodeGraph | null> = {
  id: "el-anidamiento-es-el-driver-del-costo",
  describe:
    `La función alcanza >= ${MIN_MAX_NESTING} niveles de anidamiento — la MISMA línea con la que el detector del ancla ` +
    "(`detect/intra-function/complexity.ts`) nombra `nesting` (y no `branchCount`) como driver dominante del costo que " +
    "mide. Con el conteo de ramas como driver, el cuerpo es una tabla de despacho y Extract Method no tiene dónde cortar.",
  run(problem) {
    const forma = problem.forma;
    if (!forma) {
      return {
        holds: false,
        evidence: "Sin árbol vivo del archivo, o no se pudo ubicar la función anclada en `file.functions`: sin evaluar, no candidata.",
      };
    }
    const holds = forma.maxNesting >= MIN_MAX_NESTING;
    return {
      holds,
      evidence: holds
        ? `"${forma.nombre}" alcanza ${forma.maxNesting} niveles de anidamiento (>= ${MIN_MAX_NESTING}): el costo lo domina la profundidad, que es lo que un método extraído pone en cero.`
        : `"${forma.nombre}" alcanza ${forma.maxNesting} nivel(es) de anidamiento (< ${MIN_MAX_NESTING}): el costo lo domina el CONTEO de ramas, no la profundidad — más compatible con una tabla de despacho que con pasos anidados que extraer.`,
    };
  },
};

/**
 * REQUIRED 2 — la ESCALA. QUÉ INTENCIÓN VERIFICA: que la extracción PAGUE.
 * Existe al menos un bloque de control envuelto por otro que carga >= 2
 * decisiones propias: levantarlo saca esas decisiones Y su recargo de
 * profundidad de la función original. Un contenedor de switch nunca es
 * candidato (sus brazos son alternativas de UNA decisión: eso es
 * Strategy/State, no Extract Method).
 */
const bloqueAnidadoConDecisionPropia: Check<ProblemaAnidado, CodeGraph | null> = {
  id: "bloque-anidado-con-decision-propia",
  describe:
    `Existe un bloque de control (nunca un contenedor de switch) que abre y cierra en filas distintas (>= ${MIN_LINEAS_DEL_BLOQUE}), ` +
    `con >= ${MIN_ENVOLTURAS} estructura(s) de control por encima y >= ${MIN_DECISIONES_DEL_BLOQUE} decisiones propias — un paso ` +
    "anidado con lógica adentro, no una guarda suelta ni el encabezado de una construcción.",
  run(problem) {
    const forma = problem.forma;
    if (!forma) return { holds: false, evidence: "Sin forma clasificable: no evaluado, no candidata." };
    const mejor = forma.bloques.reduce<BloqueExtraible | null>(
      (a, b) => (a === null || b.decisiones > a.decisiones || (b.decisiones === a.decisiones && b.lineas > a.lineas) ? b : a),
      null,
    );
    if (!mejor) {
      return {
        holds: false,
        evidence:
          `Ningún bloque de "${forma.nombre}" reúne >= ${MIN_LINEAS_DEL_BLOQUE} filas, >= ${MIN_ENVOLTURAS} envoltura(s) y >= ${MIN_DECISIONES_DEL_BLOQUE} decisiones propias: ` +
          "la profundidad no se concentra en un bloque que valga un método con nombre.",
      };
    }
    return {
      holds: true,
      evidence:
        `"${forma.nombre}": bloque \`${mejor.tipo}\` en la línea ${mejor.startLine} (${mejor.lineas} líneas), con ${mejor.envolturas} ` +
        `estructura(s) de control por encima y ${mejor.decisiones} decisiones propias. Extraerlo saca esas decisiones y su recargo de profundidad del cuerpo original.`,
    };
  },
};

/**
 * REQUIRED 3 — NO PROPONER DOS VECES LO MISMO SOBRE LA MISMA FUNCIÓN.
 * QUÉ INTENCIÓN VERIFICA: que la recomendación sea COBERTURA NUEVA. Si el
 * ancla `long-function` ya cuelga Extract Method de esta misma función,
 * repetirlo desde otro id de hallazgo no descubre nada: infla el conteo. No
 * quita nada: es una compuerta sobre un camino nuevo.
 */
const noLoProponeYaElAnclaLarga: Check<ProblemaAnidado, CodeGraph | null> = {
  id: "no-lo-propone-ya-el-ancla-long-function",
  describe:
    "Extract Method no se propone ya sobre esta MISMA función desde su hallazgo `long-function` — proponer dos veces el " +
    "mismo remedio sobre la misma unidad no es cobertura nueva.",
  run(problem) {
    const forma = problem.forma;
    if (!forma) return { holds: false, evidence: "Sin forma clasificable: no evaluado, no candidata." };
    const gemelo = forma.gemeloLargoQueYaPropone;
    return {
      holds: gemelo === null,
      evidence:
        gemelo === null
          ? `Ningún hallazgo \`${LONG_FUNCTION_KIND}\` sobre el rango exacto de "${forma.nombre}" cuyo required (>= ${MIN_PARAGRAPHS} párrafos reales) se cumpla: si esta recomendación sale, es la primera sobre esta función.`
          : `El hallazgo \`${gemelo}\` (${LONG_FUNCTION_KIND}) cubre el rango exacto de "${forma.nombre}" y su cuerpo tiene >= ${MIN_PARAGRAPHS} párrafos reales: el camino viejo YA propone Extract Method acá.`,
    };
  },
};

/** DISCRIMINADOR — más de un bloque extraíble: el cuerpo mezcla varios pasos
 *  anidados, no uno solo. */
const variosBloquesAnidados: Check<ProblemaAnidado, CodeGraph | null> = {
  id: "varios-bloques-anidados-extraibles",
  describe: "Hay >= 2 bloques anidados distintos que reúnen la condición — el cuerpo mezcla varios pasos, no uno.",
  run(problem) {
    const n = problem.forma?.bloques.length ?? 0;
    return { holds: n >= 2, evidence: problem.forma ? `${n} bloque(s) anidado(s) candidatos.` : "Sin forma clasificable: no evaluado." };
  },
};

/** DISCRIMINADOR — el bloque más cargado tiene >= 3 decisiones propias (una
 *  más que el piso del `required`): cuanto más lógica encierra, más claro es
 *  que es un paso con nombre propio y no una rama del flujo principal. */
const bloqueMuyCargado: Check<ProblemaAnidado, CodeGraph | null> = {
  id: "bloque-anidado-muy-cargado",
  describe: `El bloque más cargado tiene >= ${MIN_DECISIONES_DEL_BLOQUE + 1} decisiones propias (una más que el piso del required).`,
  run(problem) {
    const max = problem.forma?.bloques.reduce((a, b) => Math.max(a, b.decisiones), 0) ?? 0;
    return {
      holds: max >= MIN_DECISIONES_DEL_BLOQUE + 1,
      evidence: problem.forma ? `El bloque más cargado tiene ${max} decisiones propias.` : "Sin forma clasificable: no evaluado.",
    };
  },
};

/** DISCRIMINADOR — anidamiento MUY profundo (>= `MIN_MAX_NESTING + 2`): más
 *  allá del piso, cada nivel extra es carga que un método extraído se lleva
 *  entera. Nunca decisivo: el `required` ya fija el piso. */
const anidamientoMuyProfundo: Check<ProblemaAnidado, CodeGraph | null> = {
  id: "anidamiento-muy-profundo",
  describe: `La función alcanza >= ${MIN_MAX_NESTING + 2} niveles de anidamiento (más que el piso que ya exige el required).`,
  run(problem) {
    const n = problem.forma?.maxNesting ?? 0;
    return {
      holds: n >= MIN_MAX_NESTING + 2,
      evidence: problem.forma ? `${n} niveles de anidamiento (${n >= MIN_MAX_NESTING + 2 ? ">=" : "<"} ${MIN_MAX_NESTING + 2}).` : "Sin forma clasificable: no evaluado.",
    };
  },
};

const APPLIED_LABEL_ANIDADO =
  "¿El bloque anidado con lógica propia ya vive en un método con nombre — el patrón YA aplicado sobre esta función?";

/**
 * `appliedState` del camino de `complexity`. `ya-aplicado` es INALCANZABLE
 * desde acá y se dice en voz alta: el `required` de escala exige un bloque
 * anidado con >= 2 decisiones propias SIN extraer, y "ya aplicado" significa
 * exactamente que ese bloque ya vive en un método con nombre. Son
 * incompatibles por construcción — decirlo es más honesto que fabricar una
 * rama que nunca se alcanza. `parcial` tampoco: este camino no sabe de
 * "varias extracciones a medio hacer", sólo de una función con un paso
 * anidado sin extraer.
 */
function appliedStateAnidado(problem: ProblemaAnidado): AppliedStateResult {
  const forma = problem.forma;
  const n = forma?.bloques.length ?? 0;
  return {
    state: "ausente",
    checks: [
      {
        label: APPLIED_LABEL_ANIDADO,
        passed: false,
        why: forma
          ? `${n} bloque(s) anidado(s) de "${forma.nombre}" cargan >= ${MIN_DECISIONES_DEL_BLOQUE} decisiones propias y siguen en línea dentro del cuerpo: no hay método con nombre que los contenga.`
          : "Sin forma clasificable: no evaluado. Se resuelve `ausente` por falta de evidencia.",
        role: "applied",
      },
    ],
  };
}

const TO_CONFIRM_ANIDADO: readonly string[] = [
  "Confirmar que el bloque anidado no depende de TANTAS variables locales de la función que extraerlo exija pasarlas casi " +
    "todas como parámetros — si eso pasa, el corte real puede ser otro (Extract Class, no Extract Method).",
  "Si el bloque es el núcleo de un algoritmo (una matriz de programación dinámica, una máquina de estados escrita a mano), " +
    "la profundidad ES el algoritmo y extraer sólo lo esconde — verificar a mano que el bloque es un PASO y no el cálculo.",
  "En lenguajes donde un `return`/`break` dentro del bloque sale de la función que lo contiene (Go, Java, C#, Python), " +
    "confirmar que el método extraído puede reproducir esa salida con un valor de retorno — si no, el corte es otro.",
  "Si el bloque está dominado por un único `switch`/tabla de despacho, el remedio puede ser Strategy/State sobre ESE bloque " +
    "(anclas `conditional-chain`/`repeated-switch`/`type-switch`), no Extract Method.",
];

function buildSpecAnidado(problem: ProblemaAnidado): HypothesisSpec<ProblemaAnidado, CodeGraph | null> {
  return {
    pattern: "Extract Method",
    ceiling: "media",
    needs: [],
    required: [anidamientoEsElDriver, bloqueAnidadoConDecisionPropia, noLoProponeYaElAnclaLarga],
    discriminators: [variosBloquesAnidados, bloqueMuyCargado, anidamientoMuyProfundo],
    appliedState: () => appliedStateAnidado(problem),
    toConfirm: TO_CONFIRM_ANIDADO,
    source: SOURCE,
  };
}

function buildDesdeComplejidad(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const anidado: ProblemaAnidado = { finding: problem, forma: analizarFormaAnidada(problem, ctx) };
  const spec = buildSpecAnidado(anidado);
  const outcome = runEngine(spec, ctx.capabilities, anidado, graph);
  if (!outcome) return null;
  return toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: problem.locations,
    cost:
      "Un método nuevo por bloque anidado, con nombre que documente el paso — se paga una vez por extracción; el " +
      "anidamiento que quedaba adentro arranca de cero en el método nuevo y el cuerpo original lo llama en una línea.",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA AI (AI5) — TERCER CAMINO DEL ANCLA `long-function`: LA FRONTERA QUE
 * DIBUJA LA GRAMÁTICA, PARA LOS CUERPOS EN LOS QUE EL `required` VIEJO ES
 * IMPOSIBLE.
 *
 * EL DEFECTO QUE CIERRA, leído en el código y no medido (§1 de
 * `scratchpad-ai5/CRITERIO.md`). `variosPasosSeparados` cuenta
 * `agruparPorLineasEnBlanco(hijosNombrados(body))`, y de ahí salen DOS
 * propiedades que nada tienen que ver con el problema que `long-function`
 * detecta (la LONGITUD) y todo con el FORMATO:
 *
 *   1. La agrupación mira SÓLO hijos DIRECTOS del cuerpo, y un párrafo no
 *      puede tener menos de un hijo. Entonces
 *      `parrafosReales.length <= (hijos directos de código)`: **toda función
 *      cuyo cuerpo tenga <= 2 hijos directos de código falla el `required`
 *      POR CONSTRUCCIÓN**, escriba el autor las líneas en blanco que escriba.
 *      Medido sobre click/cobra/eslint/guava: **132 de las 330 funciones
 *      largas que mueren en esa compuerta caen en ese subconjunto.**
 *   2. La única frontera que la regla reconoce es la línea EN BLANCO. Un
 *      cuerpo denso —varias estructuras de control seguidas, sin una sola
 *      fila vacía— tiene 1 párrafo aunque la gramática marque las fronteras
 *      sola: **un bloque de control abre en una fila y cierra en otra.**
 *
 * Es el mismo defecto que AH3 nombró para el otro subconjunto ("una función
 * corta y profunda no puede pasar nunca"), un nivel más arriba: la compuerta
 * pide algo que la gramática del caso hace imposible.
 *
 * LA FUERZA NO CAMBIA — SE LEE EN LA OTRA NOTACIÓN. La fuerza de Extract
 * Method es "un fragmento que se puede agrupar y nombrar". El camino viejo la
 * lee por la marca del AUTOR (la línea en blanco); éste la lee por la marca
 * de la GRAMÁTICA (una estructura de control con principio y fin). Donde el
 * autor separó con blancos las dos notaciones coinciden: medido, **306 de las
 * 609 funciones largas que HOY pasan el `required` viejo también cumplirían
 * la forma de este camino** — no es una fuerza nueva, es la misma noción de
 * "paso" con otra frontera.
 *
 * NO QUITA NADA. Los dos caminos anteriores quedan byte a byte iguales, y
 * este camino tiene DOS `required` que garantizan por construcción que nunca
 * se superpone con ellos: `el-camino-de-parrafos-no-lo-cubre` (re-evalúa la
 * regla vieja sobre el MISMO cuerpo, con la MISMA función) y
 * `no-lo-propone-ya-el-ancla-complexity` (la compuerta simétrica de la que
 * AH3 escribió para la dirección contraria).
 *
 * QUÉ NO ALCANZA, dicho acá y no en un apéndice: el subconjunto (1) —cuerpo
 * de <= 2 hijos directos— NO se recupera con esta forma salvo que esos hijos
 * sean, ellos mismos, >= 3 grupos, que por definición no pueden ser. **Se
 * midió una variante que bajaba al cuerpo de la única estructura de control
 * que ocupa el cuerpo entero, y se MIDIÓ y se DESCARTÓ: alcanza 13 casos en
 * los cuatro repos abiertos, 9 de ellos contenedores de `switch` (tabla de
 * despacho, la forma que este módulo documenta como `falso`) y 4 de ellos la
 * misma función de hash duplicada en `guava/` y `android/guava/`.** El número
 * queda publicado en el informe de AI5 y el camino no se aterriza.
 * ──────────────────────────────────────────────────────────────────────── */

/** OLA AI (AI5) — cuántos de los grupos delimitados por la gramática tienen
 *  que ser una estructura de control multi-fila que NO sea un contenedor de
 *  `switch`. DOS, y las dos mitades de la razón están escritas antes de
 *  medir: con menos de dos bloques la "división" es una lista plana de
 *  sentencias y ahí el camino viejo tiene razón en callarse (no hay fragmento
 *  con principio y fin que nombrar); y el contenedor de `switch` no cuenta
 *  porque sus brazos son alternativas de UNA decisión — el `TO_CONFIRM` de
 *  este mismo módulo ya dice que ahí el remedio es Strategy/State, y el
 *  camino de AH3 lo excluye con el mismo argumento. Un `switch` sigue
 *  DELIMITANDO grupos (es un paso); lo que no hace es contar para este piso. */
const MIN_BLOQUES_DELIMITADORES = 2;

/** Un grupo delimitado por la gramática. Misma forma que `Parrafo` (para
 *  poder reusar `tieneLogicaReal` sin copiarla) más la marca de si el grupo
 *  ES un bloque de control multi-fila que no es contenedor de `switch`. */
interface GrupoFrontera extends Parrafo {
  readonly esBloqueDelimitador: boolean;
}

/**
 * ¿Este hijo directo del cuerpo ES un bloque de control con principio y fin?
 *
 * DOS FORMAS, y la segunda NO es una concesión: es un hecho de gramática que
 * un test de este archivo destapó antes de medir ninguna precisión. En las
 * gramáticas de este proyecto el nodo que `deriveNodeSets` clasifica como
 * anidamiento para un `try` NO es el `try_statement` sino su
 * `catch_clause`/`except_clause` — verificado volcando los conjuntos
 * derivados de TypeScript y Python. Mirar sólo el tipo del hijo directo
 * dejaba TODO `try` de TODO lenguaje fuera de la frontera, que es
 * exactamente la clase de ceguera por notación que este camino vino a
 * cerrar. Por eso un hijo también cuenta cuando alguno de sus hijos
 * DIRECTOS es un nodo de anidamiento: es el envoltorio sintáctico del mismo
 * bloque, no otra cosa. Nunca recursivo más allá de ese nivel — si hiciera
 * falta bajar más, ya no es "este hijo ES un bloque".
 *
 * `esSwitch` viaja aparte porque un contenedor de `switch` DELIMITA un grupo
 * (es un paso) pero no cuenta para el piso de bloques del `required` — ver
 * `MIN_BLOQUES_DELIMITADORES`.
 */
function bloqueDeControlInmediato(h: AstNode, sets: FunctionUnit["sets"]): { esBloque: boolean; esSwitch: boolean } {
  if (h.endPosition.row - h.startPosition.row + 1 < MIN_LINEAS_DEL_BLOQUE) return { esBloque: false, esSwitch: false };
  if (sets.nestingNodes.has(h.type)) return { esBloque: true, esSwitch: sets.switchContainerNodes.has(h.type) };
  const anidados = hijosNombrados(h).filter((c) => sets.nestingNodes.has(c.type));
  if (anidados.length === 0) return { esBloque: false, esSwitch: false };
  return { esBloque: true, esSwitch: anidados.every((c) => sets.switchContainerNodes.has(c.type)) };
}

/**
 * Agrupa los hijos DIRECTOS del cuerpo por FRONTERA DE BLOQUE: un bloque de
 * control que abre y cierra en filas distintas (`MIN_LINEAS_DEL_BLOQUE`, la
 * misma definición que ya usa el camino de AH3, y `bloqueDeControlInmediato`
 * para el "qué es un bloque") es un grupo por sí solo; las sentencias que no lo son se acumulan en un
 * grupo hasta que aparece la próxima estructura. Los comentarios se pegan al
 * grupo que SIGUE — el mismo criterio con el que Fowler dice dónde cortar
 * ("look for comments... they often signal a conceptual break"), y el mismo
 * que el camino viejo aplica al dejarlos dentro del párrafo que delimitan.
 *
 * NUNCA es recursiva: igual que `agruparPorLineasEnBlanco`, mira un solo
 * nivel. Un closure anidado cuenta como UN paso, no se abre.
 */
function agruparPorFronteraDeBloque(hijos: readonly AstNode[], sets: FunctionUnit["sets"]): GrupoFrontera[] {
  const grupos: GrupoFrontera[] = [];
  let corrida: AstNode[] | null = null;
  let pendientes: AstNode[] = [];
  const cerrar = (todos: AstNode[], esBloqueDelimitador: boolean): void => {
    grupos.push({ todos, codigo: todos.filter((n) => !COMMENT_NODE.test(n.type)), esBloqueDelimitador });
  };
  for (const h of hijos) {
    if (COMMENT_NODE.test(h.type)) {
      pendientes.push(h);
      continue;
    }
    const bloque = bloqueDeControlInmediato(h, sets);
    if (bloque.esBloque) {
      corrida = null;
      cerrar([...pendientes, h], !bloque.esSwitch);
      pendientes = [];
      continue;
    }
    if (corrida) {
      corrida.push(...pendientes, h);
    } else {
      corrida = [...pendientes, h];
      cerrar(corrida, false);
    }
    pendientes = [];
  }
  return grupos;
}

interface FormaPorFrontera {
  readonly nombre: string;
  readonly sets: FunctionUnit["sets"];
  /** Sólo los grupos con >= 1 sentencia de código. */
  readonly gruposReales: readonly GrupoFrontera[];
  /** Cuántos de esos grupos son un bloque de control multi-fila no-`switch`. */
  readonly bloquesDelimitadores: number;
  /** Cuántos párrafos cuenta la regla VIEJA sobre este MISMO cuerpo — se
   *  re-evalúa con `agruparPorLineasEnBlanco`, nunca se supone. */
  readonly parrafosDeLaReglaVieja: number;
  /** `id` del hallazgo `complexity` sobre el rango EXACTO de esta función
   *  cuyas DOS condiciones estructurales del camino de AH3 se cumplen —
   *  `null` si no hay. */
  readonly gemeloComplejoQueYaPropone: string | null;
}

/**
 * ¿El camino del ancla `complexity` (AH3) YA propone Extract Method sobre
 * esta MISMA función? Se evalúan sus DOS condiciones ESTRUCTURALES sobre el
 * MISMO cuerpo, con las MISMAS funciones (`fn.metrics.maxNesting` y
 * `recolectarBloques`), nunca se adivinan.
 *
 * NO ES CIRCULAR, y por eso se evalúan dos y no tres: el tercer `required` de
 * aquel camino (`no-lo-propone-ya-el-ancla-long-function`) reproduce la regla
 * VIEJA de párrafos, que acá ya se sabe que FALLA (es el `required`
 * `el-camino-de-parrafos-no-lo-cubre`, evaluado sobre el mismo cuerpo). Es
 * decir: cuando las dos estructurales se cumplen, aquel camino emite seguro.
 */
function gemeloComplejoQueYaPropone(fn: FunctionUnit, body: AstNode, ctx: HypothesisContext): string | null {
  if (fn.metrics.maxNesting < MIN_MAX_NESTING) return null;
  const bloques: BloqueExtraible[] = [];
  recolectarBloques(body, fn.sets, 0, bloques);
  if (bloques.length === 0) return null;
  for (const otro of ctx.neighborhood.findingsInFile(fn.file)) {
    if (otro.kind !== COMPLEXITY_KIND) continue;
    const l = otro.locations[0];
    if (!l) continue;
    if (l.file === fn.file && l.startLine === fn.startLine && l.endLine === fn.endLine) return otro.id;
  }
  return null;
}

/**
 * La forma por frontera de bloque de la función anclada. `null` con el MISMO
 * contrato que sus dos hermanas (`analizarFormaDeLaFuncion`,
 * `analizarFormaAnidada`): sin árbol vivo, sin ubicación o sin poder ubicar
 * la función, `null` — y `null` NUNCA se lee como "cumple".
 *
 * EXPORTADA por el mismo motivo que las otras dos: para que el medidor del
 * frente pueda contar el embudo sin reimplementar la clasificación.
 */
export function analizarFormaPorFrontera(problem: Finding, ctx: HypothesisContext): FormaPorFrontera | null {
  const file = ctx.file;
  const primera = problem.locations[0];
  if (!file || !primera) return null;
  if (file.path !== primera.file) return null;
  const fn = funcionDelAncla(file, primera.startLine, primera.endLine);
  if (!fn) return null;
  const body = (fn.node.childForFieldName("body") as AstNode | null) ?? fn.node;
  const hijos = hijosNombrados(body);
  const gruposReales = agruparPorFronteraDeBloque(hijos, fn.sets).filter(esParrafoReal);
  return {
    nombre: fn.name ?? "(anónima)",
    sets: fn.sets,
    gruposReales,
    bloquesDelimitadores: gruposReales.filter((g) => g.esBloqueDelimitador).length,
    parrafosDeLaReglaVieja: agruparPorLineasEnBlanco(hijos).filter(esParrafoReal).length,
    gemeloComplejoQueYaPropone: gemeloComplejoQueYaPropone(fn, body, ctx),
  };
}

interface ProblemaPorFrontera {
  finding: Finding;
  forma: FormaPorFrontera | null;
}

/**
 * REQUIRED 1 — LA FUERZA Y LA ESCALA.
 * QUÉ INTENCIÓN VERIFICA: *"¿el cuerpo se divide en varios fragmentos que se
 * pueden agrupar y nombrar?"* — la misma pregunta del camino viejo, con la
 * frontera dibujada por la gramática en vez de por el formato.
 */
const variosPasosDelimitadosPorLaGramatica: Check<ProblemaPorFrontera, CodeGraph | null> = {
  id: "varios-pasos-delimitados-por-la-gramatica",
  describe:
    `El cuerpo se divide en >= ${MIN_PARAGRAPHS} grupos delimitados por la gramática (una estructura de control que abre y ` +
    `cierra en filas distintas es un grupo; las sentencias que no lo son se acumulan en uno), y >= ${MIN_BLOQUES_DELIMITADORES} ` +
    "de esos grupos son un bloque de control multi-fila que no es un contenedor de `switch` — sin dos bloques con principio y " +
    "fin la división es una lista plana de sentencias y no hay fragmento que nombrar.",
  run(problem) {
    const forma = problem.forma;
    if (!forma) {
      return {
        holds: false,
        evidence: "Sin árbol vivo del archivo, o la función anclada no está en `file.functions`: no evaluado, no candidata.",
      };
    }
    const n = forma.gruposReales.length;
    if (n < MIN_PARAGRAPHS || forma.bloquesDelimitadores < MIN_BLOQUES_DELIMITADORES) {
      return {
        holds: false,
        evidence:
          `"${forma.nombre}" se divide en ${n} grupo(s) delimitados por la gramática, ${forma.bloquesDelimitadores} de ellos ` +
          `bloque(s) de control multi-fila no-\`switch\` (hacen falta ${MIN_PARAGRAPHS} y ${MIN_BLOQUES_DELIMITADORES}): la gramática ` +
          "tampoco marca varios pasos acá.",
      };
    }
    return {
      holds: true,
      evidence:
        `"${forma.nombre}" se divide en ${n} grupos delimitados por la gramática, de los cuales ${forma.bloquesDelimitadores} son ` +
        "bloques de control que abren y cierran en filas distintas: cada uno es un fragmento con principio y fin que un método con nombre se lleva entero.",
    };
  },
};

/**
 * REQUIRED 2 — QUE SEA COBERTURA NUEVA FRENTE AL CAMINO VIEJO.
 * QUÉ INTENCIÓN VERIFICA: *"¿este cuerpo es de los que la regla de párrafos
 * NO puede alcanzar?"* Se re-evalúa la regla vieja sobre el MISMO cuerpo con
 * la MISMA función; nunca se supone. Por construcción, entonces, un hallazgo
 * `long-function` no puede recibir dos hipótesis de Extract Method.
 */
const elCaminoDeParrafosNoLoCubre: Check<ProblemaPorFrontera, CodeGraph | null> = {
  id: "el-camino-de-parrafos-no-lo-cubre",
  describe:
    `La regla de párrafos por líneas en blanco cuenta < ${MIN_PARAGRAPHS} sobre este MISMO cuerpo — es decir, el camino viejo de ` +
    "este ancla no emite acá. Si emitiera, repetir el mismo remedio sobre la misma función desde el mismo hallazgo no sería cobertura nueva.",
  run(problem) {
    const forma = problem.forma;
    if (!forma) return { holds: false, evidence: "Sin forma clasificable: no evaluado, no candidata." };
    const n = forma.parrafosDeLaReglaVieja;
    return {
      holds: n < MIN_PARAGRAPHS,
      evidence:
        n < MIN_PARAGRAPHS
          ? `La regla de líneas en blanco cuenta ${n} párrafo(s) real(es) en "${forma.nombre}" (< ${MIN_PARAGRAPHS}): el camino viejo se calla acá, esta recomendación es la primera sobre esta función desde este hallazgo.`
          : `La regla de líneas en blanco cuenta ${n} párrafo(s) real(es) en "${forma.nombre}" (>= ${MIN_PARAGRAPHS}): el camino viejo YA emite sobre este mismo hallazgo.`,
    };
  },
};

/**
 * REQUIRED 3 — QUE SEA COBERTURA NUEVA FRENTE AL CAMINO DE `complexity`.
 * QUÉ INTENCIÓN VERIFICA: lo mismo que el `required` que AH3 escribió para la
 * dirección contraria, en esta dirección: si el ancla `complexity` ya cuelga
 * Extract Method de esta misma función, proponerlo otra vez desde el hallazgo
 * `long-function` infla el conteo sin descubrir nada.
 */
const noLoProponeYaElAnclaCompleja: Check<ProblemaPorFrontera, CodeGraph | null> = {
  id: "no-lo-propone-ya-el-ancla-complexity",
  describe:
    "Extract Method no se propone ya sobre esta MISMA función desde un hallazgo `complexity` — se evalúan las dos condiciones " +
    "estructurales de ese camino (anidamiento >= 3 y un bloque anidado con decisión propia) sobre el mismo cuerpo, no se suponen.",
  run(problem) {
    const forma = problem.forma;
    if (!forma) return { holds: false, evidence: "Sin forma clasificable: no evaluado, no candidata." };
    const gemelo = forma.gemeloComplejoQueYaPropone;
    return {
      holds: gemelo === null,
      evidence:
        gemelo === null
          ? `Ningún hallazgo \`${COMPLEXITY_KIND}\` sobre el rango exacto de "${forma.nombre}" cumple las dos condiciones estructurales del camino de anidamiento: si esta recomendación sale, es la única sobre esta función.`
          : `El hallazgo \`${gemelo}\` (${COMPLEXITY_KIND}) cubre el rango exacto de "${forma.nombre}" y cumple las dos condiciones estructurales de ese camino: ahí YA se propone Extract Method.`,
    };
  },
};

/** DISCRIMINADOR — varios grupos con lógica propia. MISMA función
 *  (`tieneLogicaReal`) y misma intención que el discriminador homónimo del
 *  camino viejo, sobre los grupos de esta frontera. */
const variosGruposConLogica: Check<ProblemaPorFrontera, CodeGraph | null> = {
  id: "varios-grupos-con-logica-real",
  describe: "Al menos 2 de los grupos tienen control de flujo propio o agrupan >= 2 sentencias — no sólo un grupo hace algo, varios lo hacen.",
  run(problem) {
    const forma = problem.forma;
    if (!forma) return { holds: false, evidence: "Sin forma clasificable: no evaluado." };
    const conLogica = forma.gruposReales.filter((g) => tieneLogicaReal(g, forma.sets));
    const holds = conLogica.length >= 2;
    return {
      holds,
      evidence: `${conLogica.length} de ${forma.gruposReales.length} grupos de "${forma.nombre}" tienen control de flujo propio o agrupan varias sentencias.`,
    };
  },
};

/** DISCRIMINADOR — más grupos que el piso del `required` (mismo salto de +2
 *  que `masDeCincoPasos` del camino viejo): cuantos más pasos visibles, más
 *  claro el corte. */
const masGruposQueElPiso: Check<ProblemaPorFrontera, CodeGraph | null> = {
  id: "mas-grupos-que-el-piso",
  describe: `El cuerpo se divide en >= ${MIN_PARAGRAPHS + 2} grupos delimitados por la gramática (más que el mínimo que ya exige el required).`,
  run(problem) {
    const n = problem.forma?.gruposReales.length ?? 0;
    return {
      holds: n >= MIN_PARAGRAPHS + 2,
      evidence: problem.forma ? `${n} grupos (${n >= MIN_PARAGRAPHS + 2 ? ">=" : "<"} ${MIN_PARAGRAPHS + 2}).` : "Sin forma clasificable: no evaluado.",
    };
  },
};

/** DISCRIMINADOR — más bloques delimitadores que el piso: cada bloque de
 *  control con principio y fin es un método con nombre que se lleva su span
 *  entero, que es la moneda en la que el ancla mide (LÍNEAS). */
const masBloquesQueElPiso: Check<ProblemaPorFrontera, CodeGraph | null> = {
  id: "mas-bloques-delimitadores-que-el-piso",
  describe: `>= ${MIN_BLOQUES_DELIMITADORES + 1} bloques de control multi-fila no-\`switch\` en el nivel superior del cuerpo (uno más que el piso del required).`,
  run(problem) {
    const n = problem.forma?.bloquesDelimitadores ?? 0;
    return {
      holds: n >= MIN_BLOQUES_DELIMITADORES + 1,
      evidence: problem.forma ? `${n} bloque(s) delimitador(es).` : "Sin forma clasificable: no evaluado.",
    };
  },
};

const APPLIED_LABEL_FRONTERA =
  "¿Todos los grupos delimitados por la gramática son de una sola sentencia y ninguno tiene control de flujo — el cuerpo YA " +
  "es una secuencia plana de pasos con nombre propio?";

/**
 * `appliedState` del camino por frontera. MISMO criterio y MISMA función
 * (`tieneLogicaReal`) que el `appliedState` del camino viejo, sobre los
 * grupos de esta frontera.
 *
 * *** LOS DOS LÍMITES, DICHOS EN VOZ ALTA EN VEZ DE FINGIDOS ***
 *   - `ya-aplicado` es, en la práctica, CASI INALCANZABLE desde acá: el
 *     `required` exige >= 2 bloques de control multi-fila, y un nodo de
 *     anidamiento que además sea rama (`sets.branchNodes`) o excepción
 *     (`sets.exceptionNodes`) cuenta como "grupo con lógica propia" — o sea,
 *     casi siempre. Sólo queda alcanzable en el borde en que los dos bloques
 *     delimitadores son nodos de anidamiento que la gramática NO clasifica ni
 *     como rama ni como excepción (el `with_clause` multi-fila de Python es el
 *     caso real que este módulo ya documenta). La rama se deja porque el
 *     criterio es el mismo del camino viejo y porque ese borde existe, no
 *     porque se espere que dispare.
 *   - `parcial` NO es alcanzable: este camino no distingue "algunas
 *     extracciones ya hechas y otras no" — mismo límite declarado que el
 *     camino viejo, que tampoco lo alcanza.
 */
function appliedStatePorFrontera(problem: ProblemaPorFrontera): AppliedStateResult {
  const forma = problem.forma;
  if (!forma) {
    return {
      state: "ausente",
      checks: [{ label: APPLIED_LABEL_FRONTERA, passed: false, why: "Sin forma clasificable: no evaluado. Se resuelve `ausente` por falta de evidencia.", role: "applied" }],
    };
  }
  const conLogica = forma.gruposReales.filter((g) => tieneLogicaReal(g, forma.sets));
  if (conLogica.length === 0) {
    return {
      state: "ya-aplicado",
      checks: [
        {
          label: APPLIED_LABEL_FRONTERA,
          passed: true,
          why:
            `Los ${forma.gruposReales.length} grupos de "${forma.nombre}" son todos de una sola sentencia, sin control de flujo propio: ` +
            "el cuerpo ya es una secuencia plana de pasos con nombre — no hay lógica entrelazada que separar más.",
          role: "applied",
        },
      ],
    };
  }
  return {
    state: "ausente",
    checks: [
      {
        label: APPLIED_LABEL_FRONTERA,
        passed: false,
        why:
          `${conLogica.length} de ${forma.gruposReales.length} grupos de "${forma.nombre}" tienen lógica propia (control de flujo o varias ` +
          "sentencias) y siguen en línea dentro del cuerpo: no hay método con nombre que los contenga.",
        role: "applied",
      },
    ],
  };
}

const TO_CONFIRM_FRONTERA: readonly string[] = [
  ...TO_CONFIRM,
  "La frontera acá la dibuja la GRAMÁTICA (un bloque de control que abre y cierra), no el autor: confirmar a mano que cada bloque " +
    "es un paso con intención propia y no una parte inseparable del flujo que lo rodea.",
  "Si la profundidad de alguno de esos bloques ES el algoritmo (una tabla de programación dinámica, un decodificador de bits, un " +
    "bucle de reintento), extraer sólo lo esconde — la longitud es del cálculo, no de varios pasos.",
];

function buildSpecPorFrontera(problem: ProblemaPorFrontera): HypothesisSpec<ProblemaPorFrontera, CodeGraph | null> {
  return {
    pattern: "Extract Method",
    ceiling: "media",
    needs: [],
    required: [variosPasosDelimitadosPorLaGramatica, elCaminoDeParrafosNoLoCubre, noLoProponeYaElAnclaCompleja],
    discriminators: [variosGruposConLogica, masGruposQueElPiso, masBloquesQueElPiso],
    appliedState: () => appliedStatePorFrontera(problem),
    toConfirm: TO_CONFIRM_FRONTERA,
    source: SOURCE,
  };
}

function buildDesdeFrontera(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const porFrontera: ProblemaPorFrontera = { finding: problem, forma: analizarFormaPorFrontera(problem, ctx) };
  const spec = buildSpecPorFrontera(porFrontera);
  const outcome = runEngine(spec, ctx.capabilities, porFrontera, graph);
  if (!outcome) return null;
  return toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: problem.locations,
    cost:
      "Un método nuevo por bloque de control, con nombre que documente el paso — el cuerpo original pierde el span entero de cada " +
      "bloque extraído y queda una llamada en su lugar, que es la moneda en la que este ancla mide.",
  });
}

function buildSpec(problem: ExtractMethodProblem): HypothesisSpec<ExtractMethodProblem, CodeGraph | null> {
  return {
    pattern: "Extract Method",
    ceiling: "media",
    needs: [],
    required: [variosPasosSeparados],
    discriminators: [variosPasosConLogica, masDeCincoPasos, bajaDensidadDeComentario],
    appliedState: () => appliedState(problem),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

export const hypothesis: HypothesisBuilder = {
  id: "extract-method",
  pattern: "Extract Method",
  layer: "refactorizacion",
  anchors: [LONG_FUNCTION_KIND, COMPLEXITY_KIND],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext) {
    // OLA AH (AH3) — el camino del ancla `complexity` sale ANTES de tocar
    // nada del camino viejo: no comparte required, discriminador ni rama de
    // `appliedState`. Ver el bloque "SEGUNDA ANCLA" del docstring del módulo.
    if (problem.kind === COMPLEXITY_KIND) return buildDesdeComplejidad(problem, graph, ctx);

    const extractMethodProblem: ExtractMethodProblem = {
      finding: problem,
      forma: analizarFormaDeLaFuncion(problem, ctx),
    };
    const spec = buildSpec(extractMethodProblem);
    const outcome = runEngine(spec, ctx.capabilities, extractMethodProblem, graph);
    // OLA AI (AI5) — el TERCER camino sale SÓLO acá, cuando el camino viejo ya
    // dijo `null` (es decir: su único `required` no se cumplió). No comparte
    // required, discriminador ni rama de `appliedState` con él, y el camino
    // viejo queda byte a byte igual. Ver el bloque "TERCER CAMINO" de más
    // arriba para el defecto que cierra y las cuatro condiciones de la receta.
    if (!outcome) return buildDesdeFrontera(problem, graph, ctx);
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: problem.locations,
      cost:
        "Un método nuevo por paso, con nombre que documente su intención — se paga una vez por extracción; el " +
        "cuerpo original queda como una secuencia de llamadas a esos métodos.",
    });
  },
};
