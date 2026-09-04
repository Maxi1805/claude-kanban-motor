/**
 * `boolean-flag-param` — parámetro booleano usado como interruptor de
 * comportamiento (Fowler, *Refactoring*, "Remove Flag Argument": un booleano
 * que decide QUÉ hace la función, no simplemente un dato más que recibe, es
 * la función haciendo dos cosas distintas bajo una sola firma).
 *
 * RELACIÓN (sin jerga de AST): un parámetro de la función es booleano — por
 * tipo declarado, por valor por defecto literal, o (en lenguajes dinámicos,
 * sin tipo) porque así se lo usa — Y ese mismo parámetro aparece, solo,
 * negado, o comparado directamente contra `true`/`false`, como la condición
 * COMPLETA de un `if` dentro del cuerpo de la función. No alcanza con que el
 * parámetro EXISTA y sea booleano: tiene que efectivamente gatear una rama.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: la clasificación "es un `if`" se decide
 * por FORMA — `childForFieldName("condition")` resuelve Y (`consequence` O
 * `alternative`) resuelve también — nunca por el nombre de tipo de nodo
 * concreto (`if_statement` en unos, `if`/`unless_modifier` en Ruby, etc.).
 * Confirmado por sonda directa contra las 5 gramáticas usadas en los tests de
 * este módulo: un `while`/`until` resuelve `condition`+`body` pero NUNCA
 * `consequence`/`alternative`, así que un lazo con un flag como condición de
 * corte queda correctamente FUERA de este detector sin necesitar una lista
 * de palabras "while/until" por lenguaje. La identidad del PARÁMETRO (nombre
 * de la variable) se lee del propio código fuente, no de un diccionario.
 *
 * La única superficie léxica que este módulo se permite es un vocabulario
 * MÍNIMO, GENÉRICO, aplicado IDÉNTICAMENTE a todos los lenguajes — mismo
 * criterio que `TERNARY_NAME`/`CONSTRUCTOR_NAMES` de `code-grammar.ts`:
 *   - el nombre de un tipo declarado que dice "esto es booleano"
 *     (`bool`/`boolean`, sin distinguir mayúsculas: Go dice `bool`, Java y
 *     TypeScript dicen `boolean`, Python con anotación dice `bool`);
 *   - el texto de un literal booleano (`true`/`false`, sin distinguir
 *     mayúsculas: Python capitaliza `True`/`False`).
 * Ninguna de las dos depende del lenguaje: son la MISMA regex para los 8.
 *
 * CÓMO SE DECIDE "ES BOOLEANO" SIN TIPO DECLARADO (nota del encargo): si el
 * parámetro tiene un campo `type` que resuelve, ESE tipo manda (debe decir
 * `bool`/`boolean` o no cuenta, aunque se lo use como condición — evita
 * marcar un `String`/`array` usado como chequeo de verdad como si fuera un
 * flag). Si el parámetro NO tiene ningún campo `type` (lenguaje dinámico sin
 * anotación: Python sin hint, Ruby, JS/TS con `// @ts-nocheck` o JS puro), la
 * booleanidad se INFIERE del propio uso — exactamente como pide el encargo:
 * usado solo/negado como condición completa, o comparado contra
 * `true`/`false` — sin necesitar un valor por defecto. Un valor por defecto
 * literal booleano (`flag = false`) es la tercera vía y cuenta como
 * evidencia declarada, igual que un tipo explícito.
 *
 * SIMPLIFICACIÓN DECLARADA: sólo se mira la condición COMPLETA de un `if`
 * (el parámetro solo, negado, o en una comparación directa contra un
 * literal booleano). Un parámetro enterrado dentro de una condición
 * compuesta (`if (isPremium && hasStock)`) no dispara: distinguir ahí "el
 * flag realmente gatea una rama propia" de "es un factor más entre varios"
 * pediría resolver la estructura del operador booleano compuesto, fuera de
 * alcance de esta ola.
 *
 * FALSOS POSITIVOS CONOCIDOS (documentados, no resueltos por el detector):
 *   1. Chequeo de verdad sobre un parámetro NO booleano en un lenguaje SIN
 *      tipo declarado. `def process(customer, extra=None): if extra: ...`
 *      — `extra` no es conceptualmente un flag (es "¿hay datos extra?"), pero
 *      sin anotación de tipo la única señal disponible es "se usa solo como
 *      condición", que es exactamente la misma forma que un flag real. Es el
 *      costado que la propia nota del encargo pide aceptar: inferir
 *      booleanidad del uso en lenguajes dinámicos es, por diseño, más
 *      permisivo que un chequeo de tipos real.
 *   2. Un "Feature Toggle" (Fowler) bien aplicado: el booleano despacha a dos
 *      ramas cortas, cada una delegando a un método privado con nombre claro
 *      (`isPremium ? applyPremiumPricing() : applyStandardPricing()`). Esto
 *      es EXACTAMENTE la forma que este detector busca — Fowler es explícito
 *      en que "Remove Flag Argument" aplica igual aunque las ramas estén
 *      prolijas; el AST no puede distinguir "el flag está bien despachado" de
 *      "el flag mezcla dos responsabilidades adentro de un solo cuerpo", así
 *      que el hallazgo es una invitación a revisar, no una condena directa.
 *
 * OLA N, FRENTE B1a — MEDICIÓN POR LENGUAJE (pedida por el encargo del
 * frente, no un arreglo de código): la propia raíz de este detector es
 * DISTINTA por lenguaje — en los TIPADOS (Go/Java/C#/TypeScript) la
 * booleanidad la confirma el tipo DECLARADO, sin ambigüedad; en los
 * DINÁMICOS sin anotación (Python sin hint, Ruby, JS puro) se INFIERE del
 * uso, que es estructuralmente indistinguible de "argumento opcional
 * chequeado por presencia" (`FALSO POSITIVO CONOCIDO #1` arriba) — así que
 * el detector mide un fenómeno más amplio, con más ruido, en unos lenguajes
 * que en otros por DISEÑO, no por bug. Medido contra
 * `tests/golden/precision/*.verdicts.csv` (los 13 repos del corpus, sin
 * `ck-analyzer`), veredictos YA juzgados a mano — la n por lenguaje es
 * chica (son muestras, no el volumen completo) pero la asimetría es
 * consistente con la hipótesis: go 3/3 (100 %), python 5/7 (71 %),
 * csharp 2/3 (67 %), java 1/2 (50 %), ruby 3/6 (50 %), typescript 2/4
 * (50 %), javascript 0/2 (0 %), vue 0/2 (0 %) — los dos ceros son JS/Vue,
 * EXACTAMENTE los dos sin anotación de tipo obligatoria del grupo; Ruby cae
 * al medio (50 %) en vez de a cero porque sus tres verdaderos
 * (`within_character_class`/`detach`/`after_expression`) SÍ gatean una
 * bifurcación de comportamiento real, no un chequeo de presencia — la
 * ambigüedad de
 * "dinámico sin tipo" no es determinista, es una moneda cargada, no una
 * certeza. No se declaró ningún umbral ni exclusión distinta POR
 * LENGUAJE a partir de esto — el mecanismo (tipo declarado manda; sin tipo,
 * se infiere) ya es el más preciso posible sin inventar una lista de
 * nombres por lenguaje, que violaría la regla de genericidad del proyecto.
 *
 * UN ARREGLO SÍ SALIÓ de esta medición — `hasNonBooleanDefault`/
 * `PARAM_VALUE_FIELDS` ya resuelven el valor por defecto, pero antes de
 * esta ola sólo se USABA para confirmar booleanidad (`hasBooleanDefault`),
 * nunca para DESCARTARLA. Caso real, `FALSO POSITIVO CONOCIDO #1` visto en
 * el corpus (`rubocop/lib/rubocop/cop/layout/space_around_block_parameters.rb:136`,
 * `check_space(space_begin_pos, space_end_pos, range, msg, node = nil)`):
 * `node` tiene un valor por defecto EXPLÍCITO, `nil` — si `node` fuera
 * conceptualmente un flag, el default idiomático sería `false`, no `nil`;
 * un default `nil`/`None`/`null`/cualquier cosa que NO sea `true`/`false`
 * es, en un lenguaje SIN tipo declarado, evidencia estructural EN CONTRA de
 * la booleanidad — la misma clase de señal que `hasBooleanDefault` ya usa a
 * favor, sólo que en la dirección opuesta. `hasNonBooleanDefault` (abajo)
 * SÓLO se consulta cuando `declaredBoolean === null` (nunca contradice un
 * tipo declarado real) y SÓLO cuando el parámetro en cuestión tiene, él
 * mismo, un valor por defecto que se resuelve — no afecta a un parámetro
 * SIN ningún default (`FALSO POSITIVO CONOCIDO #1`, casos "array"/
 * "destPath"/"scope" del corpus, que siguen sin poder distinguirse: sin
 * tipo NI default, la única señal sigue siendo la forma de uso, tal como
 * ya documenta el párrafo de arriba).
 *
 * ── OLA O, FRENTE N6 — TRES ARREGLOS (K, L, M) ──────────────────────────
 *
 * La medición de B1a (arriba) diagnosticó la asimetría por lenguaje y la dejó
 * SIN arreglar: "el mecanismo ya es el más preciso posible sin inventar una
 * lista de nombres por lenguaje". Los tres arreglos de acá atacan esa misma
 * asimetría SIN una sola rama por lenguaje — todos actúan sobre la vía de
 * INFERENCIA (o sobre la accionabilidad del hallazgo), nunca sobre un tipo
 * declarado, así que Go/Java/C#/TS tipados quedan intactos por construcción.
 * Evidencia: los 8 falsos positivos vivos y ya juzgados a mano del kind al
 * abrir la ola (25 veredictos vivos, 67 % de precisión).
 *
 *   K. **EL CUERPO DESMIENTE LA INFERENCIA** (`nonBooleanEvidenceNames`).
 *      `hasNonBooleanDefault` (B1a) ya usaba el VALOR POR DEFECTO como
 *      evidencia en contra; el CUERPO tiene la misma clase de evidencia y era
 *      la única señal disponible cuando no hay default. Un booleano no tiene
 *      miembros, no se indexa y no se invoca: si el mismo nombre aparece como
 *      BASE de un acceso o de una llamada, la inferencia estaba equivocada.
 *      Casos reales del corpus, los dos ya juzgados falsos:
 *      `lodash/fp/_baseConvert.js:44`, `cloneArray(array)` — el `array ? … :
 *      0` dispara la inferencia, pero en la misma expresión está
 *      `array.length`, que en JS no existe para un booleano; y
 *      `rubocop/lib/rubocop/cop/mixin/reparsed_equivalence.rb:116`,
 *      `verification_too_large?(scope)` — `scope ? scope.source_range.size :
 *      …`. Segunda forma, mismo espíritu: el parámetro se REASIGNA con algo
 *      que no es `true`/`false` — `lodash/lib/common/minify.js:24`,
 *      `minify(srcPath, destPath, …)` hace `destPath = undefined` y
 *      `destPath = srcPath.replace(…)`. NO cuenta pasar el nombre como
 *      ARGUMENTO de otra llamada (un flag real se reenvía todo el tiempo):
 *      la base de un nodo de llamada es su callee, nunca sus argumentos.
 *
 *   L. **UNA FUNCIÓN ANÓNIMA NO TIENE FIRMA PUBLICADA** que un llamador deba
 *      decodificar — el fenómeno de Fowler es "quien llama tiene que saber
 *      qué significa `true` acá", y a una lambda inline no la llama alguien
 *      que eligió sus argumentos: se los entrega quien la recibió. Es la
 *      MISMA lectura que `unused-variable.ts` ya aplica desde hace olas a sus
 *      parámetros (`fn.name === null` como aproximación de "callback
 *      posicional"), y este detector era el único de los tres que no la
 *      hacía. Acotado a la vía de INFERENCIA a propósito: una lambda con tipo
 *      declarado (`(waitForScriptLoad: boolean) => …`) o con default booleano
 *      (`async (throwOnFailed = false) => …`, `(data, useBuffer = true) =>
 *      …` — los tres de vueuse, todos flags REALES que un llamador elige)
 *      sigue reportándose. Lo que se retira es exactamente la familia
 *      "parámetro de un callback de suscripción": `watch(focused,
 *      (isFocused) => …)`, `watchIgnorable(playing, (isPlaying) => …)`,
 *      `onConfirm((result) => …)` — el valor actual que llega en cada cambio
 *      de estado, no un modo que alguien pidió. Los dos falsos de Vue de la
 *      muestra juzgada son exactamente eso.
 *
 *   M. **UN TERCER ARREGLO QUE SE PROBÓ, SE MIDIÓ Y SE DESCARTÓ — queda
 *      escrito para que nadie lo vuelva a intentar sin saber qué pasa.** La
 *      idea era: "Remove Flag Argument" se aplica DONDE SE DISEÑA la firma,
 *      así que un `override`/una implementación de interfaz no debería
 *      reportarse (no puede sacarse el booleano sin romper a los demás). Caso
 *      que la motivaba, ya juzgado falso:
 *      `newtonsoft-json/Src/Newtonsoft.Json/Bson/BsonWriter.cs:357`,
 *      `public override void WriteValue(bool value)`.
 *
 *      SE MIDIÓ Y SALE PERDIENDO, por dos razones distintas:
 *
 *      (1) La vía por GRAFO saca verdaderos. El primer intento declaraba
 *      `needsGraph: true` y sumaba `b1b-contrato-grafo.ts#
 *      signatureImposedByContract`. Corrido sobre `corpus/click` y
 *      `corpus/vueuse` con el A/B del frente, eso retiraba TRES verdaderos
 *      positivos ya juzgados a mano — `utils.py:252` `echo(…, err=False, …)`,
 *      `decorators.py:51` `make_pass_decorator(…, ensure=False)`,
 *      `_termui_impl.py:772` `open_url(…, locate=False)` — los tres por el
 *      mecanismo (B) de esa primitiva (`carries`: la función está GUARDADA
 *      como valor en otro lado). Que una función se registre como callback no
 *      dice nada sobre si su parámetro booleano es un modo que un llamador
 *      elige: `carries` responde otra pregunta.
 *
 *      (2) La vía por AST (`override`/`@Override`) tampoco: su premisa —"el
 *      lugar donde el hallazgo SÍ es accionable, la declaración base, se
 *      sigue reportando por su cuenta"— es FALSA en este detector, porque
 *      exige un `if` en el CUERPO y una declaración abstracta o de interfaz
 *      no tiene cuerpo. O sea que el smell no se mueve de lugar: desaparece
 *      del repo. Medido sobre `corpus/guava`: retiraba 20 hallazgos, y entre
 *      ellos `AbstractUndirectedNetworkConnections.java:90`
 *      `addInEdge(E edge, N node, boolean isSelfLoop)` — que es un
 *      **verdadero positivo ya juzgado a mano** en la planilla. Un `@Override`
 *      con un flag real sigue siendo un flag real y el `@Override` está en la
 *      única copia que tiene cuerpo.
 *
 *      Por eso este detector **no** pide el grafo y **no** mira modificadores
 *      de herencia. Si alguna ola futura retoma la idea, lo que le faltaría
 *      es poder reportar el hallazgo en la DECLARACIÓN base (sin cuerpo), no
 *      suprimirlo en la implementación.
 *
 * QUÉ SIGUE SIN ARREGLARSE, medido y dicho: `allowed_combination?(line,
 * uri_range, qualified_name_range)` de rubocop (el `elsif
 * qualified_name_range` dispara la inferencia y el nombre sólo se pasa como
 * argumento — ninguna de las dos evidencias de (K) lo alcanza) y
 * `checkRoundingUnnecessary(boolean condition)` de guava (tipo declarado
 * `boolean` REAL: la booleanidad no está en discusión; lo que pasa es que el
 * booleano ES el dato a verificar, no un interruptor — una familia distinta,
 * la del helper de aserción, que B1a ya había anotado sin arreglar).
 */
import { presencia } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "presence";

/** Vocabulario mínimo, genérico, aplicado idénticamente a todos los lenguajes — ver docstring del módulo. */
const BOOL_TYPE_NAME = /\bbool(ean)?\b/i;
const BOOLEAN_LITERAL_TEXT = /^(true|false)$/i;
/** Campos genéricos donde distintas gramáticas exponen el NOMBRE de un parámetro — probado en orden, misma técnica que `SUBJECT_FIELDS` de `repeated-switch.ts`. */
const PARAM_NAME_FIELDS = ["name", "pattern", "left"];
/** Campos genéricos donde distintas gramáticas exponen el VALOR por defecto de un parámetro. */
const PARAM_VALUE_FIELDS = ["value", "right"];

/**
 * Tipos de nodo que envuelven un parámetro RESTO (rest/splat/variadic) — un
 * COLECTIVO de argumentos (tupla, array, hash), nunca un valor escalar —
 * confirmados por sonda directa (`parseRoot`, misma técnica que
 * `PARAMETER_CONTAINER_TYPES` de `unused-variable.ts`) contra las 6
 * gramáticas que los exponen como su propio tipo de nodo: Python
 * `list_splat_pattern`/`dictionary_splat_pattern` (`*args`/`**kwargs`),
 * Ruby `splat_parameter`/`hash_splat_parameter`/`block_parameter`
 * (`*args`/`**kwargs`/`&block`), JS/TS `rest_pattern` (`...rest`, ya sea
 * como hijo directo de la lista de parámetros —JS sin tipo— o como el
 * campo `pattern` de un `required_parameter` que además le agrega la
 * anotación de tipo —TS—), Go `variadic_parameter_declaration` (`...T`).
 * Java (`T... nombre`, `spread_parameter`) queda cubierto por las dos
 * razones a la vez: por este Set Y porque su nombre real vive dentro de un
 * `variable_declarator` anidado que ningún campo genérico de arriba
 * resuelve, así que ninguna de las dos vías puede confundirlo con un
 * parámetro escalar.
 *
 * BUG QUE ESTO ARREGLA (confirmado por sonda directa, no hipotético):
 * `paramInfoFrom`, sin este filtro, cae al respaldo genérico —"el primer
 * hijo NOMBRADO cuyo tipo es literalmente `identifier`"— y ese respaldo NO
 * distingue un identificador que ES el parámetro completo de un
 * identificador que sólo nombra la COLA de un `*args`/`...rest`: en Python
 * `def log(self, msg, *args)`, `list_splat_pattern` envuelve exactamente un
 * `identifier` ("args") sin exponer ningún campo `type`, así que el
 * parámetro completo terminaba tratado como un escalar sin tipo — la MISMA
 * forma que un parámetro dinámico legítimo. `if args:` (Python) / `if args`
 * (Ruby) — el idioma estándar para "¿me pasaron argumentos extra?"— es
 * estructuralmente IDÉNTICO a `if flag:` para la inferencia por uso del
 * docstring de cabecera, y sin este filtro disparaba un falso "args es un
 * parámetro booleano". Verificado con `click/examples/complex/complex/cli.py`
 * (`Environment.log`, `*args` real del corpus) antes y después del filtro.
 * Un colectivo de argumentos no es booleano NUNCA, sin importar cómo se lo
 * use en el cuerpo — la identidad del parámetro (colección, no escalar) lo
 * descarta antes de mirar el uso, no una excepción de un lenguaje puntual.
 */
const REST_PARAM_TYPES: ReadonlySet<string> = new Set([
  "list_splat_pattern",
  "dictionary_splat_pattern",
  "splat_parameter",
  "hash_splat_parameter",
  "block_parameter",
  "rest_pattern",
  "variadic_parameter_declaration",
  "spread_parameter",
]);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Primer campo de `fields` que resuelve en `node`, o `null` si ninguno lo hace. */
function firstResolvedField(node: AstNode, fields: readonly string[]): AstNode | null {
  for (const field of fields) {
    const child = node.childForFieldName(field);
    if (child) return child as AstNode;
  }
  return null;
}

interface ParamInfo {
  name: string;
  /** `null` = el parámetro no tiene NINGÚN campo `type` que resuelva (lenguaje dinámico sin anotación). */
  declaredBoolean: boolean | null;
  hasBooleanDefault: boolean;
  /**
   * `true` cuando el parámetro tiene un valor por defecto que SÍ resuelve
   * pero NO es el literal `true`/`false` (`nil`, `None`, `null`, una cadena,
   * un array, otra llamada…) — ver "OLA N, FRENTE B1a" en el docstring del
   * módulo: evidencia estructural EN CONTRA de la booleanidad cuando no hay
   * tipo declarado, el espejo de `hasBooleanDefault` en la otra dirección.
   */
  hasNonBooleanDefault: boolean;
}

/**
 * Extrae nombre + evidencia de tipo/valor por defecto de un nodo-parámetro.
 * Cubre las formas confirmadas por sonda directa: identificador suelto (sin
 * tipo ni default), `assignment_pattern` (JS: `left`/`right`),
 * `default_parameter`/`typed_parameter`/`typed_default_parameter` (Python:
 * `name`/`type`/`value` — con la particularidad de que `typed_parameter`, sin
 * default, NO expone campo `name`, sólo `type`; el respaldo genérico de abajo
 * cubre ese caso), `optional_parameter` (Ruby: `name`/`value`),
 * `required_parameter` (TS: `pattern`/`type`/`value`), `formal_parameter`
 * (Java: `name`/`type`), `parameter_declaration` (Go: `name`/`type`),
 * `parameter` (C#: `name`/`type`).
 */
function paramInfoFrom(node: AstNode): ParamInfo | null {
  // Colectivo de argumentos (rest/splat/variadic), nunca un escalar — ver
  // el docstring de `REST_PARAM_TYPES`. Se descarta ANTES del respaldo
  // genérico de abajo, que si no lo confundiría con un identificador suelto.
  if (REST_PARAM_TYPES.has(node.type)) return null;

  // Parámetro sin tipo, sin default: un simple `identifier` suelto dentro de
  // la lista de parámetros (JS/TS/Python/Ruby/Go/Java sin anotación).
  if (node.type === "identifier") {
    return { name: node.text, declaredBoolean: null, hasBooleanDefault: false, hasNonBooleanDefault: false };
  }

  let nameNode = firstResolvedField(node, PARAM_NAME_FIELDS);
  // TS: `...rest: T[]` es un `required_parameter` cuyo campo `pattern`
  // resuelve al `rest_pattern` mismo (la anotación de tipo cuelga AL LADO,
  // no adentro) — mismo colectivo que arriba, sólo que envuelto un nivel
  // más adentro. Sin este chequeo, `nameNode.text` sería literalmente
  // `"...rest"` (con los puntos) y el parámetro sobrevivía por accidente
  // —nunca matcheaba ningún uso real en el cuerpo, que nunca escribe los
  // puntos— en vez de por diseño; esto lo hace explícito y a prueba de que
  // el nombre alguna vez matchee de casualidad.
  if (nameNode && REST_PARAM_TYPES.has(nameNode.type)) return null;
  // Respaldo genérico: si ningún campo con nombre conocido resuelve (caso
  // confirmado por sonda: `typed_parameter` de Python, que sólo expone
  // `type`), el nombre es el primer hijo NOMBRADO cuyo tipo es literalmente
  // `"identifier"` — el nombre de nodo más universal en las gramáticas
  // soportadas para un token de identificador plano, no vocabulario propio
  // de un lenguaje.
  if (!nameNode) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child?.isNamed && child.type === "identifier") {
        nameNode = child;
        break;
      }
    }
  }
  if (!nameNode) return null;

  const typeNode = node.childForFieldName("type") as AstNode | null;
  const valueNode = firstResolvedField(node, PARAM_VALUE_FIELDS);
  const hasBooleanDefault = valueNode ? BOOLEAN_LITERAL_TEXT.test(valueNode.text.trim()) : false;

  return {
    name: nameNode.text,
    declaredBoolean: typeNode ? BOOL_TYPE_NAME.test(typeNode.text) : null,
    hasBooleanDefault,
    hasNonBooleanDefault: !!valueNode && !hasBooleanDefault,
  };
}

/** Todo parámetro nombrado de la función, en orden — `[]` si no tiene ninguno. */
function functionParams(fn: FunctionUnit): ParamInfo[] {
  const paramList = fn.node.childForFieldName("parameters") as AstNode | null;
  if (!paramList) return [];
  const params: ParamInfo[] = [];
  for (let i = 0; i < paramList.childCount; i++) {
    const child = paramList.child(i) as AstNode | null;
    if (!child?.isNamed) continue;
    const info = paramInfoFrom(child);
    if (info) params.push(info);
  }
  return params;
}

/** `true` cuando `node` es un `if` estructural: resuelve `condition` Y (`consequence` O `alternative`) — nunca por nombre de tipo de nodo. Ver docstring del módulo sobre por qué esto excluye lazos. */
function isIfLike(node: AstNode): boolean {
  return node.childForFieldName("condition") !== null && (node.childForFieldName("consequence") !== null || node.childForFieldName("alternative") !== null);
}

type Usage = "sole" | "comparedToBoolean" | "none";

/** Cómo aparece `paramName` en el texto (sin paréntesis) de una condición de `if`. */
function usageOf(conditionText: string, paramName: string): Usage {
  const escaped = escapeRegExp(paramName);
  if (new RegExp(`^(!|not\\s+)?${escaped}$`).test(conditionText)) return "sole";
  if (
    new RegExp(`^${escaped}\\s*(===|==|!==|!=)\\s*(true|false)$`, "i").test(conditionText) ||
    new RegExp(`^(true|false)\\s*(===|==|!==|!=)\\s*${escaped}$`, "i").test(conditionText)
  ) {
    return "comparedToBoolean";
  }
  return "none";
}

/**
 * Vocabulario GENÉRICO de "esto se apoya sobre algo": acceso a miembro/
 * índice/atributo, o invocación. Los mismos tokens, partidos por "_" del
 * nombre de tipo de nodo, que `argument-mutation.ts` ya usa para lo mismo —
 * confirmados por sonda directa contra las 7 gramáticas en ese módulo. Nunca
 * una lista de nombres de nodo por lenguaje.
 */
const STRUCTURED_USE_TOKENS = new Set(["member", "subscript", "attribute", "field", "selector", "element", "array", "index", "call", "invocation"]);

function isStructuredUse(node: AstNode): boolean {
  return node.type.split("_").some((t) => STRUCTURED_USE_TOKENS.has(t));
}

function firstNamedChild(node: AstNode): AstNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child?.isNamed) return child;
  }
  return null;
}

/**
 * Los nombres del cuerpo de `fn` sobre los que se hace algo que un BOOLEANO
 * no admite — ver "OLA O, FRENTE N6" (K) en el docstring del módulo. Dos
 * formas, las dos por FORMA de nodo:
 *
 *   1. El nombre es la BASE de un acceso a miembro/índice o de una
 *      invocación (`scope.source_range`, `array.length`, `items[0]`,
 *      `handler()`): un `true`/`false` no tiene miembros, no se indexa y no
 *      se invoca en ninguno de los 7 lenguajes soportados. La base es el
 *      PRIMER hijo nombrado, la misma convención que `resolveBase` de
 *      `argument-mutation.ts` — y por eso pasar el nombre COMO ARGUMENTO
 *      (`allowed_position?(line, range)`) NO cuenta: ahí el primer hijo
 *      nombrado es el callee, no el argumento.
 *   2. El nombre se REASIGNA dentro del cuerpo con un valor que no es el
 *      literal `true`/`false` (`destPath = srcPath.replace(...)`,
 *      `destPath = undefined`): la misma evidencia que `hasNonBooleanDefault`
 *      ya usa sobre el valor por defecto, un paso más adentro.
 *
 * Se calcula UNA vez por función, no una vez por parámetro.
 */
function nonBooleanEvidenceNames(fn: FunctionUnit): ReadonlySet<string> {
  const names = new Set<string>();
  walkTree(fn.node, (raw) => {
    if (!raw.isNamed) return;
    const node = raw as AstNode;
    if (isStructuredUse(node)) {
      const base = firstNamedChild(node);
      if (base && base.type === "identifier") names.add(base.text);
      return;
    }
    if (!node.type.split("_").includes("assignment")) return;
    const target = (node.childForFieldName("left") ?? node.childForFieldName("target")) as AstNode | null;
    if (!target || target.type !== "identifier") return;
    const value = firstResolvedField(node, PARAM_VALUE_FIELDS);
    if (value && !BOOLEAN_LITERAL_TEXT.test(value.text.trim())) names.add(target.text);
  });
  return names;
}

/** El primer uso de `paramName` como condición COMPLETA de un `if` dentro de `root`, o `"none"`. */
function usageInBody(root: AstNode, paramName: string): Usage {
  let found: Usage = "none";
  walkTree(root, (node) => {
    if (found !== "none" || !node.isNamed) return;
    const real = node as AstNode;
    if (!isIfLike(real)) return;
    const condition = real.childForFieldName("condition") as AstNode | null;
    if (!condition) return;
    const text = condition.text.replace(/[()]/g, "").trim();
    const usage = usageOf(text, paramName);
    if (usage !== "none") found = usage;
  });
  return found;
}

export const detector: IntraFunctionDetector<ThresholdKey, "boolean-flag-param"> = {
  id: "boolean-flag-param",
  kind: "boolean-flag-param",
  scope: "intra-function",
  title: "Parámetro booleano como interruptor",
  needs: [],
  thresholds: {
    // Presencia, no magnitud: un solo parámetro booleano usado como
    // condición ya es el hallazgo completo — mismo criterio que
    // `empty-catch.ts#presence`.
    presence: presencia({
      rationale: "un parámetro booleano que gatea una rama del cuerpo ya es el hallazgo completo: no hay una magnitud que umbralizar, es presencia/ausencia de esta forma de acoplamiento (Fowler, Remove Flag Argument).",
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("presence");
    const findings: RawFinding[] = [];
    // OLA O, FRENTE N6 (K): nombres sobre los que el cuerpo hace algo que un
    // booleano no admite. Se calcula una vez por función y sólo se consulta
    // por la vía de INFERENCIA — un tipo declarado sigue mandando.
    const refuted = nonBooleanEvidenceNames(fn);

    for (const param of functionParams(fn)) {
      const isBooleanish = param.declaredBoolean === true || param.hasBooleanDefault;
      // Sin campo `type` resuelto: lenguaje dinámico sin anotación — la
      // booleanidad se infiere del propio uso (ver docstring del módulo).
      // EXCEPTO cuando el propio parámetro ya trae un default que CONTRADICE
      // la booleanidad (`node = nil`, `extra = None`) — ver "OLA N, FRENTE
      // B1a" / `hasNonBooleanDefault` en el docstring del módulo — cuando el
      // CUERPO lo desmiente (OLA O, FRENTE N6 (K)), o cuando la función es
      // ANÓNIMA (OLA O, FRENTE N6 (L)): ahí no hay firma publicada que un
      // llamador tenga que decodificar, así que la evidencia más débil de
      // todas no alcanza.
      const inferBooleanFromUsage =
        param.declaredBoolean === null && !param.hasNonBooleanDefault && !refuted.has(param.name) && fn.name !== null;

      const usage = usageInBody(fn.node, param.name);
      // Las dos formas de uso ("solo" y "comparado contra `true`/`false`")
      // tienen que pasar por el MISMO portón de booleanidad — ver el
      // docstring de cabecera, "CÓMO SE DECIDE ES BOOLEANO SIN TIPO
      // DECLARADO": un tipo declarado que NO dice bool/boolean manda,
      // aunque el cuerpo lo compare textualmente contra un literal
      // booleano. BUG ARREGLADO (confirmado por sonda directa, no
      // hipotético): antes `comparedToBoolean` disparaba SIEMPRE, sin
      // pasar por `isBooleanish`/`inferBooleanFromUsage` — en TypeScript,
      // `function resolveNestedOptions<T>(options: T | true): T { if
      // (options === true) return {} as T; return options; }` (idioma real
      // de vueuse, duplicado en `useWebSocket`/`useEventSource`) tiene un
      // tipo declarado que SÍ resuelve (`T | true`) y NO dice "bool" —
      // `declaredBoolean` da `false`, no `null`— así que ni `isBooleanish`
      // ni `inferBooleanFromUsage` valen, pero el `===true` igual disparaba
      // el hallazgo por el atajo de esta rama. `options` es un sentinela de
      // "usar la config por defecto", no un flag que elige entre dos
      // comportamientos — el propio criterio del módulo ya lo excluía para
      // el uso "solo"; esto lo hace consistente para el uso comparado.
      const triggers = usage !== "none" && (isBooleanish || inferBooleanFromUsage);
      if (!triggers) continue;

      const startLine = fn.node.startPosition.row + 1;
      const endLine = fn.node.endPosition.row + 1;

      findings.push({
        title: `"${param.name}" es un parámetro booleano que decide el comportamiento de "${fn.name ?? "función anónima"}"`,
        detail:
          "Un parámetro booleano que gatea una rama entera del cuerpo es la función haciendo dos cosas " +
          "distintas bajo una sola firma: quien llama tiene que saber qué significa `true`/`false` en este " +
          "contexto, y cada llamada nueva agrega otra combinación de casos a probar.",
        trigger: [{ label: "parámetros booleanos usados como condición", value: 1, threshold }],
        locations: [
          {
            file: fn.file,
            startLine,
            endLine,
            symbol: fn.name ?? undefined,
            role: "parámetro booleano usado como interruptor de comportamiento",
          },
        ],
        severity: 45,
        advice: {
          primary: {
            name: "Remove Flag Argument",
            kind: "refactorizacion",
            why: "Separar en dos funciones con nombres explícitos (o despachar a estrategias) hace que cada camino se pueda leer, llamar y probar sin decodificar qué significa el booleano en este contexto.",
            source: "https://refactoring.com/catalog/removeFlagArgument.html",
          },
        },
      });
    }

    return findings;
  },
};
