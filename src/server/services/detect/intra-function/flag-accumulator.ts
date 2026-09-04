/**
 * `flag-accumulator` — Ola 10, CONTRATO-F10.md, tarea Decorator: promueve a
 * detector propio la forma AUSENTE que hasta ahora sólo vivía DENTRO de
 * `hypotheses/decorator.ts` (`pickEmbellishmentCandidate`/
 * `REQUIRED_ACCUMULATOR`/`REQUIRED_INDEPENDENT`) y, antes de eso, dentro de
 * `pattern-wrapping.ts#collectEmbellishments` — Kerievsky, *Refactoring to
 * Patterns*, cap. 8, "Move Embellishment to Decorator".
 *
 * RELACIÓN (sin jerga de AST): un acumulador — variable local o campo propio
 * — se REASIGNA bajo ≥3 guardas de nivel superior del cuerpo de una función,
 * cada una con una condición INDEPENDIENTE de las demás (si las ≥3 guardas
 * testearan la MISMA variable serían ramas de un único discriminante —
 * Strategy/State — no capas ortogonales de embellecimiento opcional).
 *
 * POR QUÉ SE PROMUEVE (y no queda sólo dentro de la hipótesis): las tres
 * anclas viejas de Decorator (`boolean-flag-param`, `boolean-complexity`,
 * `long-parameter-list`) anclan en un PARÁMETRO o en una condición booleana
 * compleja — no en el acumulador reasignado mismo — así que en la mayoría de
 * los repos medidos la ubicación de esas anclas no coincide espacialmente
 * con la forma real del acumulador (un `if (isPremium) total = ...` puede no
 * tener NINGÚN parámetro booleano crudo si el flag es una propiedad de otro
 * objeto, `order.isPremium`, que ninguna de las tres anclas viejas mira). Un
 * detector propio, puro AST y sin `needs`, hace que la hipótesis de
 * Decorator tenga con qué anclar directo sobre la forma que en verdad
 * describe.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: "es una guarda de nivel superior" se
 * decide por FORMA (`childForFieldName("condition")` resuelve), nunca por el
 * tipo de nodo concreto ni por el nombre de la variable/campo reasignado. La
 * única lectura de TEXTO es la comparación entre condiciones ("¿son la MISMA
 * variable, o independientes?"), que necesita comparar el ÚLTIMO
 * identificador de cada condición entre sí — no contra ningún vocabulario
 * fijo (mismo criterio que `boolean-flag-param.ts` documenta para su propia
 * única superficie léxica).
 *
 * DUPLICACIÓN DECLARADA: las primitivas de forma (`namedChildren`,
 * `objectOf`, `isSelfFieldAccess`, ...) son una copia deliberada del mismo
 * subconjunto que `hypotheses/decorator.ts` ya trae adaptado a `AstNode` —
 * mismo criterio que ese archivo documenta para `pattern-wrapping.ts`
 * (`capabilities.ts#TERNARY_NAME`): `detect/*` no puede importar de
 * `hypotheses/*` (capas invertidas), así que la alternativa sería promover
 * esto a un módulo compartido de nivel más bajo — fuera de alcance de esta
 * tarea, que es Decorator y nada más.
 *
 * FALSOS POSITIVOS CONOCIDOS (documentados, no resueltos por el detector):
 *   - Una fórmula de negocio con pasos acumulados que en verdad SON un único
 *     cálculo secuencial (descuentos + impuestos + envío, todos parte de la
 *     MISMA regla) tiene la misma forma exacta que capas ortogonales
 *     genuinas — el AST no puede distinguir "capacidades independientes que
 *     se combinan" de "pasos de una fórmula única"; queda como pregunta para
 *     confirmar manualmente (ver `hypotheses/decorator.ts#toConfirm`). SIGUE
 *     ABIERTO — medido real en `cobra/doc/man_docs.go` (formateo de un flag
 *     de ayuda paso a paso, con "[" y "]" explícitamente apareados) y en
 *     `jekyll/servlet.rb#livereload_args` (query string armado por
 *     concatenación secuencial): 2 de 2 falsos en el corpus, sin arreglo
 *     estructural conocido.
 *   - Guardas con corte de flujo (`if (x) return;`) NO son este smell: acá
 *     sólo cuenta una guarda cuyo cuerpo REASIGNA el mismo target, no una
 *     guarda que corta la ejecución — esa es la forma de Chain of
 *     Responsibility (`NEXT_FIELD_WORD` en `pattern-wrapping.ts`), una
 *     relación distinta aunque comparta "≥3 guardas de nivel superior".
 *   - ARREGLO (frente de precisión, esta ola): una variante MÁS específica
 *     de la misma confusión — una guarda que SÍ reasigna el target Y ADEMÁS
 *     termina (`return`/`break`/`continue`/`next`/`throw` como su último
 *     statement) es una RAMA ALTERNATIVA de un árbol de decisión, nunca una
 *     capa que pueda coexistir con las demás en la misma llamada (a
 *     diferencia de Kerievsky, donde 2+ capas SÍ aplican juntas). Antes de
 *     este arreglo, `guardTerminates` no existía y estas ramas contaban
 *     igual que capas reales — medido como falso positivo real en 2
 *     lenguajes del corpus: `ConvertUtils.GetTypeCode` (C#,
 *     newtonsoft-json) y `factsFor` (TypeScript, `src/`, una segunda causa
 *     distinta de la ya documentada más abajo para esta misma función).
 *     `pickCandidate` ahora descarta la guarda ENTERA (nunca cuenta como
 *     capa) cuando termina — ver `guardTerminates`.
 *   - ARREGLO RAÍZ (Ola O) — el Decorator YA APLICADO: el detector marcaba
 *     como olor el remedio que él mismo recomendaría. `cursor = new
 *     FilterCursor(cursor, filter)` bajo una guarda, `cursor = new
 *     SkipCursor(cursor, skip)` bajo otra, `cursor = new LimitCursor(cursor,
 *     count)` bajo una tercera (`eslint/lib/languages/js/source-code/
 *     token-store/cursors.js#createCursor`) es la firma textbook de
 *     Decorator: cada capa ENVUELVE el objeto anterior en un wrapper nuevo.
 *     `pickCandidate` ahora descarta una guarda cuando su lado derecho es
 *     una construcción (`new X(...)`/equivalente) que recibe el valor VIEJO
 *     del propio target como argumento — ver `wrapsSelf`/`isConstructionLike`.
 *   - REDEFINICIÓN DEL CRITERIO (Ola P, frente P6) — TEXTO/DATOS vs.
 *     COMPORTAMIENTO: la premisa del detector (Kerievsky, cap. 8) es que cada
 *     guarda envuelve un OBJETO agregándole una CAPACIDAD nueva (comparable a
 *     Decorator). Construir progresivamente una CADENA (concatenar/formatear
 *     texto de salida) o una LISTA de literales (acumular flags/argumentos
 *     para un comando) tiene la MISMA forma de AST — ≥3 guardas independientes
 *     que reasignan el mismo acumulador — pero es una operación de datos, no
 *     de comportamiento: no hay ningún objeto con métodos que "envolver" en un
 *     Decorator. `pickCandidate` ahora descarta una guarda cuando su lado
 *     derecho contiene, en cualquier profundidad acotada, un nodo de tipo
 *     LITERAL DE CADENA — ver `containsStringLiteral`/`STRING_LITERAL_NODE_TYPE`
 *     — sin leer el CONTENIDO del literal (eso sería vocabulario, prohibido),
 *     sólo si el nodo ES uno (gramática). MEDIDO, no adivinado, sobre los 5
 *     únicos hallazgos vivos y juzgados de este kind en el corpus externo (ver
 *     `tests/golden/precision/{click,cobra×2,hugo,jekyll}.verdicts.csv`,
 *     0/5 verdaderos antes de este arreglo — todos con un literal de cadena en
 *     la reasignación): `click/src/click/core.py#make_metavar` (`var += "!"`,
 *     `var += "..."`), `cobra/completions.go#…` (`directives = append(directives,
 *     "ShellCompDirectiveError")`), `cobra/doc/man_docs.go#manPrintFlags`
 *     (`format = fmt.Sprintf("**-%s**...", ...)`, `format += "["`, `format +=
 *     "=%q"`), `hugo/resources/resource_transformers/cssjs/postcss.go#toArgs`
 *     (`args = append(args, "--no-map")`), `jekyll/lib/jekyll/commands/serve/
 *     servlet.rb#livereload_args` (`src += "&amp;mindelay=#{...}"`). Las notas
 *     ya cargadas en esas planillas (`grep "fórmula secuencial"`/"idioma
 *     universal") diagnosticaban el síntoma caso por caso sin poder nombrar la
 *     causa común porque ninguna leía el tipo de nodo del operando — este
 *     arreglo la nombra una sola vez, estructuralmente, en vez de seguir
 *     acumulando excepciones por caso. NO generaliza a acumulación NUMÉRICA
 *     (`total = total + fee`, sin ningún literal de cadena involucrado):
 *     ese sigue siendo el caso "fórmula secuencial" ya documentado arriba,
 *     sin arreglo estructural conocido — declarado, no escondido. Control
 *     positivo verificado en el test: el acumulador aritmético clásico de
 *     Kerievsky (`total = total * 0.9`, `total = total + 5`, sólo literales
 *     NUMÉRICOS) sigue disparando sin cambios.
 *
 *   - ARREGLO DE ALCANCE (Ola R, frente R5) — `isConstructionLike` NO VEÍA
 *     LA MITAD DE LAS GRAMÁTICAS, y por eso el arreglo de la Ola O sólo
 *     corría en 2 de los 6 lenguajes del catálogo. Ver
 *     `rebuildsFromOldValue`, que lo reemplaza: el reconocimiento de "esto es
 *     una llamada" pasa de un nombre de tipo de nodo (`/call/i`) a la MISMA
 *     forma de campos que usa `graph/references.ts` (`arguments`/
 *     `argument_list` + campo de callee), y deja de exigir que el callee
 *     empiece en mayúscula. MEDIDO en el corpus, caso por caso, sobre los 11
 *     hallazgos vivos del kind — ver el desglose en el informe R5.
 *   - "¿EL ACUMULADOR ES UN PRIMITIVO?" (Ola R, frente R5) — ver
 *     `accumulatorIsWrittenPrimitive`. Es la MISMA pregunta que la
 *     redefinición de la Ola P ("TEXTO/DATOS vs. COMPORTAMIENTO") hecha sobre
 *     el TIPO ESCRITO en vez de sobre la forma del lado derecho: la Ola P
 *     sólo podía ver un literal de CADENA dentro de la reasignación, y no
 *     tenía forma de ver un `ulong`, un `bool` o un `int` que el lenguaje
 *     escribe en la DECLARACIÓN y en ningún otro lado.
 *
 * LÍMITES DECLARADOS POR LENGUAJE: ninguno confirmado — la sonda de este
 * módulo ejercita clase+método, función suelta, campo propio (`this`/`self`/
 * variable de instancia Ruby/receptor Go) y variable local en 6 gramáticas.
 * El chequeo de PRIMITIVO, en cambio, sólo puede hablar donde el lenguaje
 * ESCRIBE el tipo (java, csharp, typescript, tsx, vue, go, y las anotaciones
 * opcionales de python): en ruby y javascript no hay dónde escribirlo, así
 * que ahí la respuesta es `no-fact` y el detector emite exactamente lo mismo
 * que antes de esta ola. Está declarado, no escondido —
 * `CONTRATO-DECLARA-TIPO.md` §6.4.
 */
import { declaredTypeAtSite } from "../primitivas/r5-tipo-del-sitio.js";
import { citado } from "../thresholds.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "layers";

/** `this`/`self` — igual vocabulario mínimo que `hypotheses/decorator.ts`. */
const SELF_WORDS = ["this", "self"];
/** Ruby: una variable de instancia (`@total`) es SIEMPRE un campo propio, sin receptor explícito. */
const RUBY_IVAR_TYPE = "instance_variable";
/**
 * `while`/`for`/`until`/`do-while` — EXCLUIDOS del conteo de guardas, en las
 * 6 gramáticas probadas contra este módulo (JS/TS, Ruby, Go, Python, Java,
 * C#): un `while_statement`/`for_statement` resuelve `condition`+`body`,
 * EXACTAMENTE la misma forma de campos que el `if_modifier` de Ruby
 * (`expr if cond`, sin `consequence`/`alternative`) — así que el
 * `?? body` de abajo (necesario para reconocer el modifier-if de Ruby) los
 * confundiría con una guarda genuina si no se filtran acá. Un lazo NO es una
 * capa de embellecimiento opcional (Kerievsky): reasignar el mismo target
 * dentro de un `while` es normalización/acumulación iterativa, no una
 * decisión "aplicar esta capa sí/no" independiente de las demás — mismo
 * criterio que ya distingue `boolean-flag-param.ts#isIfLike` (`consequence`/
 * `alternative`, nunca `while`/`until`) para las gramáticas donde el `if`
 * SÍ expone ese campo; acá se nombra el tipo de nodo porque Ruby no lo
 * expone y no hay otra señal estructural para separar ambos casos.
 */
const LOOP_NODE_TYPE = /^(while|for|until|do)(_statement|_in_statement)?$/;

function isLoopNode(node: AstNode): boolean {
  return LOOP_NODE_TYPE.test(node.type);
}
/** Campos genéricos donde distintas gramáticas exponen el OBJETO de un acceso a miembro (`a.b`/Go `a.b`). */
const OBJECT_FIELDS = ["object", "operand"];

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

/** Primer descendiente (incluido `node`) que cumple `pred`, acotado en profundidad para no recorrer toda la función por cada guarda. */
function findDescendant(node: AstNode, pred: (n: AstNode) => boolean, maxDepth = 8): AstNode | null {
  if (pred(node)) return node;
  if (maxDepth <= 0) return null;
  for (const c of namedChildren(node)) {
    const hit = findDescendant(c, pred, maxDepth - 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * *** "tiene campos `left`/`right`" NO alcanza para "es una asignación" ***
 * (ola de precisión posterior a la Ola D, frente Decorator; MISMO arreglo
 * que `hypotheses/decorator.ts#isAssignmentLike`, ver su docstring para el
 * razonamiento completo verificado por sonda contra 4 gramáticas). Dos capas
 * de falso positivo encontradas: (1) un `for_in_statement` de TS/JS (cubre
 * `for...in`/`for...of`) expone los MISMOS nombres de campo `left`/`right`
 * que una asignación — caso real `graph/edges/warmup.ts#warmUpLanguage`; (2)
 * CUALQUIER operador binario de comparación o lógico (`a > b`, `a && b`) es
 * un `binary_expression`, TAMBIÉN con campos `left`/`right` — caso real
 * `graph/edges/imports.ts#factsFor` (dispatch por `language`, sin ningún
 * acumulador real: `target && target.text.length > 0` se leía como "target"
 * reasignado una vez por rama). El arreglo raíz verifica el TIPO del nodo
 * (`/assign/i`, mismo criterio genérico por substring que ya usa este mismo
 * archivo para "es un lazo") — confirmado por sonda: toda asignación
 * genuina en TS/JS/Python/Go/Ruby tiene "assign" en su nombre de tipo,
 * ningún operador binario ni nodo de lazo lo tiene.
 */
const ASSIGNMENT_NODE_TYPE = /assign/i;

function isAssignmentLike(node: AstNode): boolean {
  return ASSIGNMENT_NODE_TYPE.test(node.type) && hasField(node, "left") && hasField(node, "right") && !isLoopNode(node);
}

function unwrapSingleChild(node: AstNode): AstNode {
  const kids = namedChildren(node);
  return kids.length === 1 ? unwrapSingleChild(kids[0]!) : node;
}

function objectOf(node: AstNode): AstNode | null {
  for (const f of OBJECT_FIELDS) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

function memberNameOf(node: AstNode): string | null {
  const obj = objectOf(node);
  if (!obj) return null;
  for (let i = node.childCount - 1; i >= 0; i--) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && c !== obj) return c.text;
  }
  return null;
}

function isSelfFieldAccess(node: AstNode, selfNames: ReadonlySet<string>): boolean {
  if (node.type === RUBY_IVAR_TYPE) return true;
  const obj = objectOf(node);
  return obj !== null && selfNames.has(obj.text);
}

function fieldKeyOf(node: AstNode): string {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  return memberNameOf(node) ?? node.text;
}

/**
 * El ÚLTIMO identificador del texto de una condición: distingue
 * `order.isPremium` de `order.hasInsurance` (el receptor común `order` no
 * sirve para separarlas; la propiedad final sí).
 *
 * *** BUG DE TOKENIZACIÓN, ENCONTRADO MIDIENDO (Ola R, frente R5) — un
 * LITERAL NUMÉRICO se leía como identificador. *** La regex no exigía
 * ningún borde a la IZQUIERDA, así que dentro de `0xFFFFFFFF00000000`
 * empezaba a matchear en la `x` y devolvía `xFFFFFFFF00000000` como si fuera
 * el nombre de una variable. Consecuencia medida, y no es teórica: las 8
 * guardas de `newtonsoft-json/ConvertUtils.cs#PackDouble` comparan TODAS la
 * MISMA variable (`if ((val & 0xFF00000000000000) == 0)`), o sea que son
 * ramas de un discriminante único y el chequeo de independencia tenía que
 * rechazarlas — pero cada máscara hexadecimal distinta producía un
 * "identificador" distinto, `distinct.size` daba 8 y el hallazgo se emitía.
 * El borde `(?<![\w$])` es el arreglo completo: un identificador de verdad
 * nunca viene pegado a un dígito por la izquierda, y ninguna gramática de
 * este catálogo permite lo contrario.
 */
function trailingIdentifier(text: string): string {
  const m = text.match(/(?<![\w$])[A-Za-z_$][\w$]*/g);
  return m && m.length > 0 ? m[m.length - 1]! : text;
}

/** Go: campo `receiver` de la función ⇒ nombre del parámetro receptor (`d` en `func (d *Decorator) X()`), que también cuenta como acceso a campo propio. */
function goReceiverParamName(fnNode: AstNode): string | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  return (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
}

function selfNamesFor(fn: FunctionUnit): Set<string> {
  const names = new Set<string>(SELF_WORDS);
  const goRecv = goReceiverParamName(fn.node);
  if (goRecv) names.add(goRecv);
  return names;
}

/**
 * ARREGLO RAÍZ (Ola O, medido en el corpus externo — eslint,
 * `token-store/cursors.js#createCursor`) — ¿el lado derecho de la
 * reasignación es una CONSTRUCCIÓN que envuelve el valor VIEJO del propio
 * target (`target = new Wrapper(target, ...)`)? Mismas primitivas de forma
 * que `lazy-init-repetida.ts#isConstructionLike`/`NEW_EXPR_TYPE` — misma
 * DUPLICACIÓN DECLARADA que el resto de este archivo (`detect/*` no puede
 * importar de `hypotheses/*`, y `lazy-init-repetida.ts` es un detector
 * hermano, no una capa más baja de la que importar sin invertir capas).
 *
 * POR QUÉ IMPORTA: `cursor = new FilterCursor(cursor, filter)`, `cursor =
 * new SkipCursor(cursor, skip)`, `cursor = new LimitCursor(cursor, count)`
 * bajo 3 guardas independientes es la firma EXACTA de Decorator YA
 * APLICADO — cada capa envuelve el objeto anterior en un nuevo wrapper, que
 * es LITERALMENTE el remedio ("Move Embellishment to Decorator") que este
 * detector recomendaría. Sin este chequeo, el detector acusaba la
 * solución en vez del problema: medido real en
 * `eslint/lib/languages/js/source-code/token-store/cursors.js`, 3 capas
 * sobre `cursor`, las 3 reasignándolo a `new XCursor(cursor, …)`. Genérico
 * por FORMA (¿el argumento de la construcción es, textualmente, el mismo
 * target que se reasigna?), nunca por nombre de clase concreto — el mismo
 * `FilterCursor`/`SkipCursor`/`LimitCursor` de este caso no aparece en
 * ningún lado de esta lógica.
 */
const NEW_EXPR_TYPE = /^(new_expression|object_creation_expression)$/;

/** Campo de lista de argumentos de una llamada/construcción — mismos dos nombres genéricos
 *  (`arguments`/`argument_list`) que el resto del catálogo ya usa para esto. */
function argumentsOf(node: AstNode): AstNode | null {
  return (node.childForFieldName("arguments") as AstNode | null) ?? (node.childForFieldName("argument_list") as AstNode | null);
}

/**
 * Campo con el que cada gramática nombra al CALLEE de una invocación —
 * copiado, nombre por nombre, de `graph/references.ts#CALLEE_NAME_FIELDS`,
 * que los verificó por sonda contra las 9 gramáticas: `function` (JS, TS,
 * Python, Go, y el `invocation_expression` dedicado de C#), `method` (el
 * `call` de Ruby), `name` (el `method_invocation` de Java).
 *
 * DUPLICACIÓN DECLARADA, misma que el resto de este archivo: `detect/*` no
 * importa de `graph/*` (son capas distintas y ninguna de las dos es la más
 * baja). Si esa lista cambia allá, cambia acá.
 */
const CALLEE_NAME_FIELDS = ["function", "method", "name"] as const;

/**
 * *** ARREGLO DE ALCANCE (Ola R, frente R5) — POR QUÉ ESTO REEMPLAZA A
 * `isConstructionLike` + `wrapsSelf`, Y QUÉ CAMBIA DE DEFINICIÓN. ***
 *
 * La pregunta que el arreglo de la Ola O quería hacer es: **¿esta guarda le
 * devuelve al acumulador un valor CONSTRUIDO A PARTIR DEL VALOR VIEJO del
 * propio acumulador?** Si sí, la guarda no aplica "una capa opcional más"
 * sobre un objeto: reconstruye el acumulador desde sí mismo, que es o bien el
 * Decorator YA APLICADO (`cursor = new FilterCursor(cursor, filter)`) o bien
 * acumulación de datos (`args = append(args, x)`).
 *
 * La implementación de la Ola O contestaba una pregunta MÁS CHICA — "¿el lado
 * derecho es una CONSTRUCCIÓN?" — y la contestaba con dos señales que fallan
 * fuera de JS/TS:
 *
 *   1. **`/call/i` sobre el nombre del tipo de nodo.** Verificado con sonda
 *      de gramática: el `invocation_expression` de C# y el
 *      `method_invocation` de Java NO CONTIENEN la subcadena "call". En esos
 *      dos lenguajes la rama entera era inalcanzable. Caso real medido:
 *      `newtonsoft-json/ExpressionReflectionDelegateFactory.cs#BuildMethodCall`,
 *      `callExpression = EnsureCastExpression(callExpression, type)` en tres
 *      guardas — el mismo `x = f(x, …)` que en JS/TS sí se descartaba.
 *   2. **Inicial MAYÚSCULA del callee** (o sufijo `.new`), que es un proxy
 *      del "esto es un constructor". Deja afuera toda función cuyo nombre no
 *      empieza en mayúscula, y en particular el `append(x, …)` de Go — que es
 *      LA forma de acumular una lista en ese lenguaje. Casos reales medidos:
 *      `hugo/markup/goldmark/convert.go#newMarkdown`,
 *      `hugo/common/loggers/logger.go#New`,
 *      `hugo/publisher/publisher.go#createTransformerChain`, y en JS
 *      `lodash.js#wrapper` (`args = composeArgs(args, …)`).
 *
 * La forma nueva es la de `graph/references.ts`: **un nodo es una invocación
 * cuando resuelve un campo de ARGUMENTOS y un campo de CALLEE** — forma, no
 * nombre de tipo de nodo, y las 9 gramáticas verificadas allá. La
 * construcción sin llamada (`new X()`, `&Tipo{…}`) se conserva tal cual.
 *
 * QUÉ **NO** CAMBIA, y es lo que impide que esto se coma el olor real: el
 * acumulador aritmético clásico de Kerievsky (`total = total * 0.9`,
 * `total = total + 5`) NO es una invocación — es un operador binario, sin
 * campo de argumentos — así que sigue disparando, con su control positivo en
 * el test intacto. Tampoco cambia nada si el valor viejo NO viaja como
 * argumento: `cursor = new FilterCursor(filter)` (sin `cursor` adentro) sigue
 * siendo una capa, con su propio control positivo.
 */
function isCallOrConstruction(node: AstNode): boolean {
  if (NEW_EXPR_TYPE.test(node.type)) return true;
  if (node.type === "composite_literal") return true;
  if (node.type === "unary_expression" && node.text.startsWith("&")) {
    return findDescendant(node, (n) => n.type === "composite_literal", 2) !== null;
  }
  if (argumentsOf(node) === null) return false;
  for (const f of CALLEE_NAME_FIELDS) {
    if (node.childForFieldName(f) !== null) return true;
  }
  return false;
}

/** ¿Alguno de los argumentos de `node` es, TEXTUALMENTE, el mismo target que se está
 *  reasignando? Es la firma de "el valor viejo entra al valor nuevo". */
function passesOldValue(node: AstNode, leftText: string): boolean {
  const args = argumentsOf(node);
  if (!args) return false;
  for (const arg of namedChildren(args)) {
    if (arg.text === leftText) return true;
  }
  return false;
}

/** Ver el docstring de `isCallOrConstruction`: la guarda reconstruye el acumulador desde su propio valor viejo. */
function rebuildsFromOldValue(right: AstNode, leftText: string): boolean {
  return isCallOrConstruction(right) && passesOldValue(right, leftText);
}

/**
 * ARREGLO (medido en 4 lenguajes: Ruby, Python, C#, TypeScript) — ¿la
 * guarda TERMINA la ejecución (`return`/`break`/`continue`/`next`/`throw`
 * como su ÚLTIMO statement)? Genérico por nombre de tipo de nodo (mismo
 * criterio que `LOOP_NODE_TYPE`/`ASSIGNMENT_NODE_TYPE` ya usan en este
 * archivo — gramática del lenguaje, no vocabulario de dominio).
 *
 * POR QUÉ IMPORTA: una guarda que reasigna el target Y TERMINA de inmediato
 * es, por construcción, una RAMA ALTERNATIVA — nunca puede coexistir con
 * otra guarda del mismo target en la MISMA llamada (a diferencia de una capa
 * de embellecimiento real, donde 2+ guardas SÍ pueden aplicar juntas). Sin
 * este chequeo, un árbol de decisión con ramas mutuamente excluyentes
 * (`if (a) { x = ...; return; } else if (b) { x = ...; return; } ...`) se
 * leía igual que 3 capas independientes acumulándose — medido como falso
 * positivo real en los 4 lenguajes: `ConvertUtils.GetTypeCode` (C#,
 * newtonsoft-json), `factsFor` (TypeScript, `src/`), y su forma equivalente
 * en Ruby/Python vista durante el juicio de esta ola.
 */
/**
 * REDEFINICIÓN DEL CRITERIO (Ola P, ver "TEXTO/DATOS vs. COMPORTAMIENTO" en
 * el docstring del módulo) — tipos de nodo de LITERAL DE CADENA en las
 * gramáticas de este catálogo: `string` (JS/TS/Python/Ruby, también
 * `template_string` en JS/TS), `string_literal` (Java/C#),
 * `interpreted_string_literal`/`raw_string_literal` (Go),
 * `interpolated_string_expression` (C#, cadenas interpoladas). Genérico por
 * SUBSTRING del NOMBRE del tipo de nodo — mismo criterio que
 * `ASSIGNMENT_NODE_TYPE`/`LOOP_NODE_TYPE` ya usan en este archivo — nunca lee
 * el CONTENIDO del literal (eso sería vocabulario, prohibido), sólo si el
 * nodo ES uno.
 */
const STRING_LITERAL_NODE_TYPE = /string/i;

/** ¿Hay un literal de cadena en cualquier punto (profundidad acotada) del lado derecho de la reasignación? */
function containsStringLiteral(node: AstNode): boolean {
  return findDescendant(node, (n) => STRING_LITERAL_NODE_TYPE.test(n.type), 6) !== null;
}

function guardTerminates(consequence: AstNode): boolean {
  const stmts = namedChildren(consequence);
  const last = stmts[stmts.length - 1];
  return last !== undefined && /^(return|break|continue|next|throw)/i.test(last.type);
}

/**
 * *** "¿EL ACUMULADOR ES UN PRIMITIVO?" (Ola R, frente R5) — la pregunta que
 * este detector hace literalmente, contestada por fin. ***
 *
 * El remedio que este detector recomienda es Kerievsky cap. 8, "Move
 * Embellishment to Decorator": cada capa opcional se convierte en un OBJETO
 * que ENVUELVE al anterior. Si el acumulador es un `int`, un `bool`, un
 * `double` o un `ulong`, no hay ningún objeto que envolver — el consejo no es
 * "difícil de aplicar", es INAPLICABLE por construcción, igual que
 * `new I(...)` no compila para una interfaz.
 *
 * ES LA MISMA REDEFINICIÓN DE LA OLA P, UN NIVEL MÁS ARRIBA. La Ola P
 * ("TEXTO/DATOS vs. COMPORTAMIENTO") descartó la guarda cuyo lado derecho
 * contiene un literal de CADENA, porque acumular texto es una operación de
 * datos y no de comportamiento. El argumento vale igual para un número o un
 * booleano; lo que faltaba era poder VERLO, y un literal en el lado derecho
 * no alcanza (`val <<= 32` no dice que `val` sea un entero, y
 * `allowNonPublicAccess = true` tampoco dice que sea un booleano y no un
 * objeto con un `true` como valor). El TIPO ESCRITO en la declaración sí lo
 * dice, y es lo que `declares-type` acaba de poner en el grafo.
 *
 * REGLA 2 DE LA OLA, Y ES LA QUE HACE QUE ESTO NO ROMPA NADA: sólo el
 * outcome `"primitive"` decide. `"no-fact"` — el lenguaje no escribe tipos
 * (ruby, javascript), la declaración no lo escribió (python sin anotar), o
 * esta corrida no tiene grafo — **NO es "no es primitivo" ni "es
 * primitivo": es "no pude mirar"**, y el detector emite exactamente lo que
 * emitía antes de esta ola. Por eso el control positivo aritmético clásico de
 * Kerievsky (`total = total * 0.9`, sin una sola anotación de tipo) sigue
 * disparando: nadie escribió que `total` fuera un número.
 *
 * `"composite"` (`Foo[]`, `map[K]V`) queda AFUERA a propósito y está medido
 * como decisión, no como olvido: un `A & B` de TypeScript también sale
 * `composite` y SÍ es un objeto con comportamiento que se puede envolver.
 * Descartar por `composite` mezclaría "una lista" con "una intersección de
 * dos interfaces". Los casos de acumulación en lista que sí importan
 * (`x = append(x, …)`) ya los descarta `rebuildsFromOldValue`, por la razón
 * correcta y sin depender de que haya tipo escrito.
 */
function accumulatorIsWrittenPrimitive(fn: FunctionUnit, candidate: Candidate, ctx: RunContext<ThresholdKey>): boolean {
  const graph = ctx.graph ?? null;
  const index = ctx.graphIndex?.() ?? null;
  // Un campo propio cuelga de la CLASE; una variable local o un parámetro, de
  // la función. `FunctionUnit.symbolPath` es `[className, name]`, así que el
  // contenedor de un campo es su prefijo.
  const container = candidate.isOwnField ? fn.symbolPath.slice(0, -1) : fn.symbolPath;
  return declaredTypeAtSite(graph, index, fn.file, container, candidate.target).outcome === "primitive";
}

interface Layer {
  startLine: number;
  endLine: number;
  conditionText: string;
}

interface Candidate {
  target: string;
  isOwnField: boolean;
  layers: Layer[];
}

/** El target (variable local o campo propio) con MÁS capas condicionales en el cuerpo de `fn` — sin filtrar por independencia todavía (eso corre después, con el umbral ya resuelto). */
function pickCandidate(fn: FunctionUnit, selfNames: ReadonlySet<string>): Candidate | null {
  const body = (fn.node.childForFieldName("body") as AstNode | null) ?? (fn.node.childForFieldName("consequence") as AstNode | null);
  if (!body) return null;

  const byTarget = new Map<string, { isOwnField: boolean; layers: Layer[] }>();
  const guards = namedChildren(body).filter((n) => hasField(n, "condition") && !isLoopNode(n));

  for (const guard of guards) {
    const consequence = (guard.childForFieldName("consequence") as AstNode | null) ?? (guard.childForFieldName("body") as AstNode | null);
    if (!consequence) continue;
    const assign = findDescendant(consequence, isAssignmentLike, 4);
    if (!assign) continue;
    const leftRaw = (assign.childForFieldName("left") as AstNode | null) ?? assign;
    const left = unwrapSingleChild(leftRaw);
    const isOwnField = isSelfFieldAccess(left, selfNames);
    const targetKey = isOwnField ? fieldKeyOf(left) : left.type === "identifier" ? left.text : null;
    if (!targetKey) continue;
    // ARREGLO RAÍZ (Ola O, ensanchado a 6 gramáticas por la Ola R): el lado
    // derecho reconstruye el acumulador A PARTIR DE SU VALOR VIEJO
    // (`target = new Wrapper(target, ...)`, `target = append(target, x)`,
    // `target = f(target)`) — es el Decorator YA APLICADO o acumulación de
    // datos, no el olor que este detector busca. Ver el docstring de
    // `isCallOrConstruction`. Se descarta ACÁ, antes de contarla como capa:
    // nunca participa del candidato ni de su umbral.
    const rightRaw = (assign.childForFieldName("right") as AstNode | null) ?? assign;
    const right = unwrapSingleChild(rightRaw);
    if (rebuildsFromOldValue(right, left.text)) continue;
    // REDEFINICIÓN (Ola P): el lado derecho contiene un literal de CADENA —
    // esto es acumular TEXTO/DATOS (formatear una salida, construir una lista
    // de argumentos), no envolver un objeto con COMPORTAMIENTO nuevo. Ver
    // "TEXTO/DATOS vs. COMPORTAMIENTO" en el docstring del módulo. Se
    // descarta ACÁ, antes de contarla como capa: nunca participa del
    // candidato ni de su umbral.
    if (containsStringLiteral(right)) continue;
    // ARREGLO: una guarda que TERMINA (return/break/continue/next/throw como
    // último statement) es una RAMA ALTERNATIVA, no una capa que se pueda
    // acumular junto a otras — ver el docstring de `guardTerminates`. Se
    // descarta ACÁ, antes de contarla como capa: nunca participa del
    // candidato ni de su umbral.
    if (guardTerminates(consequence)) continue;

    const conditionNode = guard.childForFieldName("condition") as AstNode;
    const entry = byTarget.get(targetKey) ?? { isOwnField, layers: [] };
    entry.layers.push({
      startLine: guard.startPosition.row + 1,
      endLine: guard.endPosition.row + 1,
      conditionText: trailingIdentifier(conditionNode.text),
    });
    byTarget.set(targetKey, entry);
  }

  let best: Candidate | null = null;
  for (const [target, entry] of byTarget) {
    if (!best || entry.layers.length > best.layers.length) best = { target, ...entry };
  }
  return best;
}

export const detector: IntraFunctionDetector<ThresholdKey, "flag-accumulator"> = {
  id: "flag-accumulator",
  kind: "flag-accumulator",
  scope: "intra-function",
  title: "Acumulador con capas condicionales independientes",
  needs: [],
  thresholds: {
    // Presencia estructural, no una magnitud arbitraria: Kerievsky (cap. 8)
    // describe el smell con "3 o más" capas opcionales apiladas — el mismo
    // piso que `hypotheses/decorator.ts#REQUIRED_ACCUMULATOR` exige para su
    // propio required (alineado a propósito: `threshold-alignment.test.ts`
    // corre el `Finding` MÁS CHICO que este detector jamás produciría contra
    // la hipótesis y falla si algún ancla acepta por debajo del piso real).
    // R3: esto YA era una cita real (Kerievsky nombra el número), sólo
    // estaba envuelta en `pisoDeclarado` en vez de `citado` — la única
    // migración de este sitio es de factoría, el valor no cambia.
    layers: citado(3, {
      work: "Kerievsky, Refactoring to Patterns",
      rule: "cap. 8 — \"Move Embellishment to Decorator\" (≥3 capas opcionales apiladas sobre el mismo acumulador)",
    }),
  },
  // Ola R (R5): "¿el acumulador es un PRIMITIVO?" se contesta con
  // `declares-type`, que vive en el grafo. NO es una compuerta (ver
  // `IntraGraphOptIn` en `detect/types.ts`): sin grafo el detector sigue
  // corriendo y emite exactamente lo mismo que antes de esta ola, porque la
  // respuesta pasa a ser `no-fact` y `no-fact` no decide nada — ver
  // `accumulatorIsWrittenPrimitive`.
  needsGraph: true,
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("layers");
    const selfNames = selfNamesFor(fn);
    const candidate = pickCandidate(fn, selfNames);
    if (!candidate || candidate.layers.length < threshold.value) return [];

    // Ver `accumulatorIsWrittenPrimitive`: el remedio de este detector es
    // envolver un OBJETO, y un entero o un booleano no se puede envolver.
    if (accumulatorIsWrittenPrimitive(fn, candidate, ctx)) return [];

    // Independencia: si las guardas repitieran todas la MISMA condición
    // final serían ramas de un único discriminante (Strategy/State), no
    // capas ortogonales de Decorator — mismo criterio que
    // `hypotheses/decorator.ts#REQUIRED_INDEPENDENT`.
    const distinct = new Set(candidate.layers.map((l) => l.conditionText));
    const need = Math.min(threshold.value, candidate.layers.length);
    if (distinct.size < need) return [];

    const layers = candidate.layers;
    const restLocations: RoleLocation[] = layers.slice(1).map((l, i) => ({
      file: fn.file,
      startLine: l.startLine,
      endLine: l.endLine,
      symbol: fn.name ?? undefined,
      role: `capa opcional ${i + 2} de ${layers.length}`,
    }));
    const locations: readonly [RoleLocation, ...RoleLocation[]] = [
      {
        file: fn.file,
        startLine: layers[0]!.startLine,
        endLine: layers[layers.length - 1]!.endLine,
        symbol: fn.name ?? undefined,
        role: `acumulador \`${candidate.target}\` (${candidate.isOwnField ? "campo propio" : "variable local"}) — capa opcional 1 de ${layers.length}`,
      },
      ...restLocations,
    ];

    return [
      {
        title: `"${candidate.target}" acumula ${layers.length} capas condicionales independientes en "${fn.name ?? "función anónima"}"`,
        detail:
          "Un acumulador reasignado bajo varias guardas independientes, cada una agregando una modificación opcional, es el " +
          '"embellecimiento anidado" que Kerievsky describe: cada combinación nueva de capas exige leer y modificar la misma ' +
          "función entera, en vez de poder componer objetos que se agregan uno a la vez.",
        trigger: [{ label: "capas condicionales independientes", value: layers.length, threshold }],
        evidence: [{ label: "condiciones distintas", value: distinct.size }],
        locations,
        severity: Math.min(100, 40 + layers.length * 12),
        advice: {
          primary: {
            name: "Move Embellishment to Decorator",
            kind: "refactorizacion",
            why: "Separar cada capa opcional en su propio objeto que envuelve al anterior permite agregar, quitar o reordenar modificaciones sin volver a tocar la función que las acumula, y cada capa se puede probar por separado.",
            source: "https://github.com/JoshuaKerievsky/RefactoringToPatterns",
          },
        },
      },
    ];
  },
};
