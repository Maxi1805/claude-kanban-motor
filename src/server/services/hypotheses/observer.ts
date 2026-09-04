/**
 * `observer` — Ola 10, CONTRATO-F10.md. La hipótesis que faltaba: hasta esta
 * ola `hypotheses/registry.ts` documentaba a Observer como "16/17, ausente,
 * sin detector-ancla real". Ancla en `manual-notification`
 * (`detect/intra-file/manual-notification.ts`, esta misma ola): un objeto
 * que, tras mutar su propio estado, notifica a sus colaboradores llamándolos
 * UNO POR UNO por nombre de campo, con el mismo (nombre, aridad), repetido
 * en >=2 miembros distintos — Observer implementado a mano, sin el objeto
 * Observer.
 *
 * ─── LAS TRES FORMAS (requisito de la tarea) ───────────────────────────────
 *
 * COMPLETA (⇒ `ya-aplicado`, NUNCA una sugerencia — requisito 1): dentro de
 * la MISMA clase que ancla el hallazgo, existe un PAR de miembros sobre el
 * MISMO campo `F`:
 *   - un miembro "suscriptor": reenvía, SIN transformar, uno de sus propios
 *     parámetros como argumento de una llamada `this.F.<método>(...)` — la
 *     forma de `attach(observer) { this.observers.push(observer) }`,
 *     detectada por identidad textual del argumento contra los parámetros
 *     propios del miembro (estructural: qué IDENTIFICADOR es, nunca qué
 *     nombre tiene el campo o el método).
 *   - un miembro "notificador": contiene un nodo de ITERACIÓN (derivado de
 *     `DerivedNodeSets`, ver `loopNodeTypes` abajo — NUNCA una lista de
 *     palabras "for"/"each"/"loop": la ausencia de esa lista es justo lo que
 *     el encargo pide reemplazar de `LOOP_KEYWORD`) sobre `this.F`, cuya
 *     variable ligada se usa, dentro del cuerpo del bucle, como receptor de
 *     OTRA llamada — `for (const o of this.observers) o.update(evt)` — o,
 *     donde la gramática no tiene nodo de bucle propio (Ruby: `.each {}` es
 *     una llamada con bloque, no un nodo dedicado), la MISMA forma vía
 *     "llamada con argumento-bloque de un solo parámetro, usado como
 *     receptor dentro del bloque" (`findBlockCallTraversal` abajo) — ambas
 *     son la Forma 4 de CONTRATO-F10.md §3 ("recorrido de colección +
 *     invocación del elemento"), implementada LOCALMENTE vía AST porque
 *     `graph/edges/invocacion-indirecta.ts` (archivo compartido, dueño de
 *     Cimientos/Ola 11 según el registro de pendientes) sólo cubre su Forma
 *     3(a) (`this.foo()` directo) — declarado, no escondido, mismo criterio
 *     que `strategy.ts#hasDispatchTable` ya usa para su propia detección de
 *     tabla de despacho vía AST cuando el grafo no alcanza.
 * Si el par existe (mismo `F`, miembros DISTINTOS) ⇒ `ya-aplicado`: la clase
 * YA implementa Observer con una lista genérica; el hallazgo de fan-out a
 * mano que ancla esta hipótesis convive con esa lista, no la reemplaza.
 * *** SIMPLIFICACIÓN DECLARADA (requisito 3) ***: no se verifica que el
 * fan-out a mano del propio hallazgo use el MISMO campo `F` que el par — con
 * eso sería, más precisamente, `aplicado-eludido` (la abstracción existe y
 * ESTE notificador puntual la salta). Separarlos exigiría rastrear si las
 * llamadas de ESTE miembro pasan, indirectamente, por `F` — no observable
 * sin dataflow. Declarado: `ya-aplicado` es el valor por defecto cuando la
 * pareja completa existe en la clase; el camino que sí distingue el puenteo
 * (`aplicado-eludido`, abajo) es vía GRAFO — `calls` desde un símbolo EXTERNO
 * a la clase hacia un miembro del tipo de elemento, saltándose el
 * notificador — y, como el ancla es `intra-file`, `graph` es SIEMPRE `null`
 * en la producción de hoy (`code-analyzer.ts`: el grafo del repo no existe
 * dentro de `analyzeFile` — mismo bloqueo que `decorator.ts#graphOverride`/
 * `strategy.ts#structuralStrategyEvidence` ya declaran para sus propias
 * anclas `intra-*`). Correcto y probado, inerte en la producción de hoy.
 *
 * PARCIAL: dos caminos independientes, cualquiera alcanza:
 *   (a) GRAFO (CONTRATO-F9.md §3.5, el ancla que Ola 9 ya dejó emitiendo:
 *       7.565 `carries`/113 `invokes-indirect` en los 8 repos) — un portador
 *       con `carries` fan-in >=2 hacia function-like + `invokes-indirect`
 *       fan-in >=1, en el mismo archivo. Es la lista de CALLBACKS ad hoc, no
 *       de objetos — la única forma de Observer medible con aristas que ya
 *       emiten (CONTRATO-F10.md, nota del encargo). Igual que la ruta
 *       COMPLETA vía grafo: `graph` es `null` en la producción de hoy para
 *       este ancla intra-file — probado, inerte hasta que un ancla
 *       inter-file la alimente.
 *   (b) AST — sólo UNA mitad del par COMPLETA existe (suscriptor sin
 *       notificador recorriendo, o viceversa): hay maquinaria real pero
 *       incompleta. Ésta SÍ corre en producción hoy (ancla intra-file, árbol
 *       vivo).
 *
 * AUSENTE: ninguna de las dos formas de arriba — el fan-out a mano es todo
 * lo que hay.
 *
 * ─── EL EXCLUDER DEJA DE MIRAR VOCABULARIO (requisito 2) ───────────────────
 * Nada acá compara contra `LISTENER_FIELD_NAME`/`PUSH_AFTER`/`PUSH_BEFORE`/
 * `LOOP_KEYWORD`/`FORMAL_DISPATCH` (las constantes de `pattern-structural.ts`
 * que CONTRATO-F10.md §3 mapea a Observer): el campo `F` se identifica por
 * ser el argumento REENVIADO sin transformar (identidad de identificador) y
 * por ser lo ITERADO (nodo de iteración estructural), nunca por su nombre.
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import type { AstNode, FileUnit, Finding } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build, refreshDiscriminators, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

type Problem = Finding;
type Graph = CodeGraph | null;

const OBSERVER_MIN_NOTIFIERS = 2;
const OBSERVER_STRONG_SIGNAL = 3;

/* ── Primitivas de AST — mismo vocabulario genérico que `detect/intra-file/
 * manual-notification.ts` (duplicado a propósito: capas invertidas, `hypotheses/*`
 * no puede depender de un detector concreto, y viceversa — mismo argumento
 * que ese archivo ya documenta frente a `lazy-init-repetida.ts`). ──────────── */

const SELF_WORDS = new Set(["this", "self"]);
const RUBY_IVAR_TYPE = "instance_variable";
/**
 * Espejo de `graph/references.ts#RECEIVER_FIELDS` — "receiver" es el campo que
 * usa Ruby (`@x.metodo`), sin el cual ninguna llamada con receptor de esa
 * gramática se reconoce.
 *
 * OLA AE (AE11) — SUMA `expression`, que es el campo con el que C# escribe el
 * receptor (`member_access_expression`), y que faltaba acá aunque
 * `RECEIVER_FIELDS` —la lista que este comentario dice espejar— ya lo tenía.
 * Es ADITIVO en el sentido estricto: agrega un campo que antes NUNCA resolvía,
 * así que sólo puede hacer que se RECONOZCAN receptores que antes se perdían.
 */
const OBJECT_FIELDS = ["object", "operand", "receiver", "expression"];
const CALLEE_NAME_FIELDS = ["function", "method", "name"];
/**
 * OLA AE (AE11) — `/call|invocation/i`, NO `/call/i`, y la razón está MEDIDA en
 * este árbol: Java escribe `method_invocation` y C# `invocation_expression`, y
 * ninguno de los dos contiene "call", así que con el regex viejo TODA consulta
 * de llamada de este módulo devolvía la lista vacía en esos dos lenguajes. El
 * embudo del ancla de Observer veía **0 miembros con llamadas de campo en
 * `corpus/guava` (1.983 archivos) y 0 en `corpus-app/jenkins` (1.399)**; con
 * `invocation` agregado ve **102 y 101**. Es exactamente el mismo arreglo, con
 * el mismo razonamiento, que la Ola W (W4) hizo en
 * `detect/intra-file/homonymous-delegation.ts` y la Ola U (N4) en
 * `hypotheses/decorator.ts`: "invocation" es vocabulario de GRAMÁTICA (cómo
 * tree-sitter nombra el nodo), del mismo estatus que "call".
 *
 * ADITIVO Y PROBADO: Observer tenía **CERO hipótesis en las dos poblaciones**
 * antes de este cambio (medido sobre volcados del día, 21 repos), así que
 * ninguna clasificación existente puede cambiar de estado por él.
 */
const CALL_NODE_TYPE = /call|invocation/i;

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function findAllDescendants(node: AstNode, pred: (n: AstNode) => boolean, maxDepth: number, out: AstNode[]): void {
  if (pred(node)) out.push(node);
  if (maxDepth <= 0) return;
  for (const c of namedChildren(node)) findAllDescendants(c, pred, maxDepth - 1, out);
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

/** Único vehículo de Go para "campo propio"/"clase dueña" — mismo criterio que `detect/intra-file/manual-notification.ts#goReceiverOf` (duplicado a propósito, ver docstring del módulo). */
function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  let typeNode: AstNode | null = null;
  const seek = (n: AstNode, depth: number): void => {
    if (typeNode || depth < 0) return;
    if (n.type === "type_identifier") {
      typeNode = n;
      return;
    }
    for (const c of namedChildren(n)) seek(c, depth - 1);
  };
  seek(decl, 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: (typeNode as AstNode).text };
}

function calleeOf(node: AstNode): AstNode | null {
  for (const f of CALLEE_NAME_FIELDS) {
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

interface CallTarget {
  readonly object: AstNode;
  readonly methodName: string;
}

/**
 * El receptor y el nombre de método de una llamada `X.metodo(...)`, en
 * cualquiera de las DOS formas de gramática que coexisten en el corpus —
 * pura estructura de campos, ninguna rama por nombre de lenguaje:
 *   (a) el nodo de llamada MISMO expone el receptor como campo directo
 *       (`OBJECT_FIELDS`) y el callee (`CALLEE_NAME_FIELDS`) es una hoja sin
 *       hijos — la forma de Ruby, donde `call` trae `receiver`+`method` como
 *       hermanos directos (`(call receiver: (instance_variable) method:
 *       (identifier))`), sin nodo de miembro intermedio;
 *   (b) el callee es a su vez un nodo de miembro CON SU PROPIO campo de
 *       objeto (`member_expression`/`attribute`/`selector_expression`) — la
 *       forma de JS/Python/Go, donde el receptor nunca es un campo directo
 *       del nodo de llamada.
 * Se prueba (a) primero porque en (b) el nodo de llamada nunca expone
 * receptor propio (confirmado por sonda contra las 4 gramáticas). Sin esto,
 * toda consulta "receptor + método de una llamada" fallaba en Ruby: el
 * callee (`method`) es una hoja y `objectOf(callee)`/`memberNameOf(callee)`
 * buscan hijos que esa hoja nunca tiene.
 */
function callTargetOf(call: AstNode): CallTarget | null {
  const callee = calleeOf(call);
  if (!callee) return null;
  const directObject = objectOf(call);
  if (directObject && callee.childCount === 0) return { object: directObject, methodName: callee.text };
  const nestedObject = objectOf(callee);
  const methodName = memberNameOf(callee);
  if (nestedObject && methodName) return { object: nestedObject, methodName };
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

function bodyOf(fnNode: AstNode): AstNode | null {
  return (fnNode.childForFieldName("body") as AstNode | null) ?? (fnNode.childForFieldName("consequence") as AstNode | null);
}

/** Nombres de los parámetros propios de un miembro — técnica de 3 pasos ya
 *  establecida (`detect/intra-file/data-clump.ts#paramName`): nodo hoja, o
 *  campo genérico `name`/`pattern`/`left`, o único hijo nombrado. */
function paramNamesOf(fnNode: AstNode): string[] {
  const params = (fnNode.childForFieldName("parameters") as AstNode | null) ?? (fnNode.childForFieldName("parameter_list") as AstNode | null);
  if (!params) return [];
  const out: string[] = [];
  for (const p of namedChildren(params)) {
    if (p.childCount === 0) {
      out.push(p.text);
      continue;
    }
    let named: AstNode | null = null;
    for (const f of ["name", "pattern", "left"]) {
      const c = p.childForFieldName(f) as AstNode | null;
      if (c) {
        named = c;
        break;
      }
    }
    if (!named) {
      const kids = namedChildren(p);
      named = kids.length === 1 ? kids[0]! : null;
    }
    if (named) out.push(unwrapSingleChild(named).text);
  }
  return out;
}

function argumentsOf(call: AstNode): readonly AstNode[] {
  const args = (call.childForFieldName("arguments") as AstNode | null) ?? (call.childForFieldName("argument_list") as AstNode | null);
  return args ? namedChildren(args) : [];
}

/**
 * Go no tiene `slice.push(x)`: el idioma es el builtin `append(slice, x)`,
 * una llamada POSICIONAL sin receptor — `append` es una palabra reservada
 * del LENGUAJE, no vocabulario de dominio, misma categoría que
 * `CONSTRUCTOR_NAMES` (`code-grammar.ts`) ya acepta para `initialize`/
 * `constructor`/`__init__`. Sin este caso, la fixture canónica de Observer
 * en Go (`s.observers = append(s.observers, o)`) nunca calificaría como
 * "suscriptor".
 */
const GO_APPEND_BUILTIN = "append";

/** Ruby: `@observers << observer` — operador binario, NUNCA un nodo "de
 *  llamada" (`CALL_NODE_TYPE` no lo alcanza). El campo `operator` es la
 *  única forma estructural (no vocabulario) de distinguirlo de una
 *  reasignación simple (`isAssignmentLike`, que también resuelve `left`/
 *  `right` pero SIN `operator`, o con uno distinto de `<<`). */
function shiftAppendTarget(node: AstNode): { left: AstNode; right: AstNode } | null {
  const left = node.childForFieldName("left") as AstNode | null;
  const right = node.childForFieldName("right") as AstNode | null;
  const op = node.childForFieldName("operator") as AstNode | null;
  if (!left || !right || !op || op.text !== "<<") return null;
  return { left, right };
}

/**
 * `true` si `body` YA califica como "notificador a mano" bajo la MISMA
 * definición que ancla esta hipótesis (`detect/intra-file/manual-
 * notification.ts`): >=2 llamadas de campo-método con el mismo (nombre,
 * aridad) hacia >=2 campos DISTINTOS. Un miembro así NO es candidato a
 * "suscriptor" — sin este filtro, `onCreate(event) {
 * this.emailObserver.onChange(event); this.smsObserver.onChange(event); }`
 * (el fan-out MISMO que ancla el hallazgo) se leería como "reenvía `event`
 * hacia un campo propio", confundiendo el olor con la mitad de su propia
 * cura. Duplicado deliberado de la agrupación de
 * `manual-notification.ts#fanoutGroupIn` (capas invertidas, mismo criterio
 * documentado ahí).
 */
function isFanoutMember(body: AstNode, selfNames: ReadonlySet<string>): boolean {
  const calls: AstNode[] = [];
  findAllDescendants(body, (n) => CALL_NODE_TYPE.test(n.type), 14, calls);
  const byGroup = new Map<string, Set<string>>();
  for (const call of calls) {
    const target = callTargetOf(call);
    if (!target || !isSelfFieldAccess(target.object, selfNames)) continue;
    const key = `${target.methodName}#${argumentsOf(call).length}`;
    const set = byGroup.get(key) ?? new Set<string>();
    set.add(fieldKeyOf(target.object));
    byGroup.set(key, set);
  }
  return [...byGroup.values()].some((s) => s.size >= 2);
}

/** `true` si `body` contiene una llamada `this.<F>.<m>(...)` (el builtin
 *  `append(this.F, ...)` de Go, o el operador `<<` de Ruby) con al menos un
 *  argumento cuyo texto coincide con uno de `paramNames` (reenvío SIN
 *  transformar) — la forma "suscriptor". Devuelve el campo `F`. Un miembro
 *  que YA es, por sí mismo, un notificador a mano (`isFanoutMember`) nunca
 *  califica: ver su docstring. */
function findSubscribeField(body: AstNode, selfNames: ReadonlySet<string>, paramNames: readonly string[]): string | null {
  if (paramNames.length === 0 || isFanoutMember(body, selfNames)) return null;

  const shifts: AstNode[] = [];
  findAllDescendants(body, (n) => shiftAppendTarget(n) !== null, 14, shifts);
  for (const shift of shifts) {
    const { left, right } = shiftAppendTarget(shift)!;
    const target = unwrapSingleChild(left);
    if (!isSelfFieldAccess(target, selfNames)) continue;
    if (right.childCount === 0 && paramNames.includes(right.text)) return fieldKeyOf(target);
  }

  const calls: AstNode[] = [];
  findAllDescendants(body, (n) => CALL_NODE_TYPE.test(n.type), 14, calls);
  for (const call of calls) {
    const target = callTargetOf(call);
    if (target && isSelfFieldAccess(target.object, selfNames)) {
      const forwards = argumentsOf(call).some((a) => a.childCount === 0 && paramNames.includes(a.text));
      if (forwards) return fieldKeyOf(target.object);
      continue;
    }
    const callee = calleeOf(call);
    if (callee && callee.childCount === 0 && callee.text === GO_APPEND_BUILTIN) {
      const args = argumentsOf(call);
      const target = args[0] ? unwrapSingleChild(args[0]) : null;
      if (!target || !isSelfFieldAccess(target, selfNames)) continue;
      const forwards = args.slice(1).some((a) => a.childCount === 0 && paramNames.includes(a.text));
      if (forwards) return fieldKeyOf(target);
    }
  }
  return null;
}

/**
 * Tipos de nodo de ITERACIÓN, derivados de `DerivedNodeSets` sin ninguna
 * lista de palabras propia: `nestingNodes` (CONTRATO-F10.md/`code-grammar.ts`)
 * es la unión if-like ∪ loop-like ∪ exception-like ∪ switch-containers;
 * restando `exceptionNodes`/`switchContainerNodes`/`chainNodes` (que a su vez
 * es if-like ∪ switch-containers ∪ switch-arms) queda EXACTAMENTE loop-like
 * — la misma aritmética de conjuntos que `code-grammar.ts#deriveNodeSets`
 * usa puertas adentro, sin exponer `loopLike` como campo propio. Ver el
 * docstring del módulo, sección "requisito 2": esto reemplaza a
 * `LOOP_KEYWORD` (regex sobre TEXTO como "for"/"each"/"loop") por tipos de
 * nodo de gramática (estructura), la misma categoría que `chainNodes`/
 * `switchContainerNodes` ya son.
 */
function loopNodeTypes(sets: DerivedNodeSets): ReadonlySet<string> {
  const out = new Set<string>();
  for (const t of sets.nestingNodes) {
    if (sets.exceptionNodes.has(t) || sets.switchContainerNodes.has(t) || sets.chainNodes.has(t)) continue;
    out.add(t);
  }
  return out;
}

/** Go: `for _, x := range s.observers` envuelve el par izq/der en un
 *  `range_clause` propio, no en campos directos del `for_statement` — mismo
 *  tipo de nodo de gramática (no vocabulario de dominio) que
 *  `lazy-init-repetida.ts` ya usa para `composite_literal`/`keyed_element`. */
function loopClauseOf(loopNode: AstNode): AstNode {
  for (const c of namedChildren(loopNode)) {
    if (c.type === "range_clause") return c;
  }
  return loopNode;
}

function boundVarNameOf(loopNode: AstNode): string | null {
  const clause = loopClauseOf(loopNode);
  for (const f of ["left", "name", "pattern"]) {
    const c = clause.childForFieldName(f) as AstNode | null;
    if (!c) continue;
    const unwrapped = unwrapSingleChild(c);
    const kids = namedChildren(unwrapped);
    if (kids.length > 0) return kids[kids.length - 1]!.text; // Go `_, observer`: el último es el elemento, no el índice.
    return unwrapped.text;
  }
  return null;
}

function iterableFieldOf(loopNode: AstNode, selfNames: ReadonlySet<string>): string | null {
  const clause = loopClauseOf(loopNode);
  for (const f of ["right", "value"]) {
    const c = clause.childForFieldName(f) as AstNode | null;
    if (!c) continue;
    const unwrapped = unwrapSingleChild(c);
    return isSelfFieldAccess(unwrapped, selfNames) ? fieldKeyOf(unwrapped) : null;
  }
  return null;
}

/** `true` si, dentro de `scope`, hay una llamada cuyo receptor es exactamente `boundVar` (identidad de identificador — la variable ligada por el bucle/bloque, nunca un nombre de dominio). */
function invokesElement(scope: AstNode, boundVar: string): boolean {
  const calls: AstNode[] = [];
  findAllDescendants(scope, (n) => CALL_NODE_TYPE.test(n.type), 14, calls);
  return calls.some((call) => {
    const target = callTargetOf(call);
    return target !== null && target.object.childCount === 0 && target.object.text === boundVar;
  });
}

/** Ruby (y cualquier gramática sin nodo de bucle dedicado): `@observers.each { |o| o.update(e) }` — llamada con receptor propio y un argumento-bloque de UN parámetro, usado como receptor dentro del bloque. */
function findBlockCallTraversal(body: AstNode, selfNames: ReadonlySet<string>): string | null {
  const calls: AstNode[] = [];
  findAllDescendants(body, (n) => CALL_NODE_TYPE.test(n.type), 14, calls);
  for (const call of calls) {
    const obj = objectOf(call);
    if (!obj || !isSelfFieldAccess(obj, selfNames)) continue;
    const block = namedChildren(call).find((c) => c.type === "block" || c.type === "do_block");
    if (!block) continue;
    const params = block.childForFieldName("parameters") as AstNode | null;
    const paramKids = params ? namedChildren(params) : [];
    if (paramKids.length !== 1) continue;
    const boundVar = paramKids[0]!.text;
    const blockBody = (block.childForFieldName("body") as AstNode | null) ?? block;
    if (invokesElement(blockBody, boundVar)) return fieldKeyOf(obj);
  }
  return null;
}

/** El campo `F` sobre el que `member` "notifica" (recorre-e-invoca), vía nodo de bucle o vía llamada-con-bloque. */
function findNotifyField(body: AstNode, selfNames: ReadonlySet<string>, loopTypes: ReadonlySet<string>): string | null {
  const loops: AstNode[] = [];
  findAllDescendants(body, (n) => loopTypes.has(n.type), 12, loops);
  for (const loop of loops) {
    const boundVar = boundVarNameOf(loop);
    const field = boundVar ? iterableFieldOf(loop, selfNames) : null;
    if (!boundVar || !field) continue;
    const loopBody = bodyOf(loop) ?? loop;
    if (invokesElement(loopBody, boundVar)) return field;
  }
  return findBlockCallTraversal(body, selfNames);
}

interface ClassMember {
  readonly name: string;
  readonly node: AstNode;
  readonly body: AstNode;
}

/**
 * Miembros function-like de la clase llamada `className` — DOS mecanismos
 * independientes en la MISMA pasada, igual que `detect/intra-file/manual-
 * notification.ts#visit` (y, antes, `lazy-init-repetida.ts`): la gramática
 * (`file.sets.classNodes`, JS/TS/Python/Ruby/Java/C#) O el receptor de
 * método de Go (`goReceiverOf`), que no tiene nodo de clase en absoluto —
 * sin el segundo mecanismo, la fixture canónica de Observer en Go
 * (`type Subject struct{...}` + métodos con receptor `*Subject`) nunca
 * encontraría sus miembros acá, aunque el DETECTOR sí sepa anclar sobre ella.
 */
function membersOfOwningClass(file: FileUnit, className: string): readonly ClassMember[] {
  const out: ClassMember[] = [];
  const visit = (node: AstNode, cls: string | null): void => {
    let nextCls = cls;
    if (file.sets.classNodes.has(node.type)) {
      nextCls = (node.childForFieldName("name") as AstNode | null)?.text ?? null;
    }
    if (file.sets.functionNodes.has(node.type)) {
      const goReceiver = goReceiverOf(node);
      const owner = goReceiver ? goReceiver.typeName : nextCls;
      const body = bodyOf(node);
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
      if (body && owner === className) out.push({ name, node, body });
      return; // un miembro no contiene otro miembro de la misma clase
    }
    for (const c of namedChildren(node)) visit(c, nextCls);
  };
  visit(file.root, null);
  return out;
}

interface CompletePair {
  readonly field: string;
  readonly subscribeMember: string;
  readonly notifyMember: string;
}

/** `this`/`self` MÁS el nombre del receptor de Go de ESTE miembro, si tiene — sin esto, `s.observers` en un método Go nunca calificaría como acceso a campo propio (`isSelfFieldAccess` sólo conoce `this`/`self`). */
function selfNamesFor(member: ClassMember): ReadonlySet<string> {
  const goReceiver = goReceiverOf(member.node);
  return goReceiver ? new Set([...SELF_WORDS, goReceiver.paramName]) : SELF_WORDS;
}

/** Busca el par (suscriptor, notificador) sobre el MISMO campo, en cualquier combinación de miembros de la clase. */
function findCompletePair(members: readonly ClassMember[], loopTypes: ReadonlySet<string>): CompletePair | null {
  const subscribeByField = new Map<string, string>();
  const notifyByField = new Map<string, string>();
  for (const m of members) {
    const selfNames = selfNamesFor(m);
    const sub = findSubscribeField(m.body, selfNames, paramNamesOf(m.node));
    if (sub && !subscribeByField.has(sub)) subscribeByField.set(sub, m.name);
    const notify = findNotifyField(m.body, selfNames, loopTypes);
    if (notify && !notifyByField.has(notify)) notifyByField.set(notify, m.name);
  }
  for (const [field, subscribeMember] of subscribeByField) {
    const notifyMember = notifyByField.get(field);
    if (notifyMember && notifyMember !== subscribeMember) return { field, subscribeMember, notifyMember };
  }
  return null;
}

/* ── Ruta de grafo — CONTRATO-F9.md §3.5. Correcta y probada; `graph` es
 * SIEMPRE `null` en la producción de hoy para este ancla `intra-file` (ver
 * el docstring del módulo) — medida sobre el corpus vía script propio, no
 * asumida. ──────────────────────────────────────────────────────────────── */

function hasAdHocDispatchCarrier(graph: CodeGraph, file: string): boolean {
  const edges = confidentEdges(graph);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const carriesTo = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.kind !== "carries") continue;
    const carrier = nodeById.get(e.from);
    if (!carrier || carrier.file !== file) continue;
    const target = nodeById.get(e.to);
    if (!target || target.kind !== "symbol" || target.family !== "function-like") continue;
    const set = carriesTo.get(e.from) ?? new Set<string>();
    set.add(e.to);
    carriesTo.set(e.from, set);
  }
  const invoked = new Set<string>();
  for (const e of edges) if (e.kind === "invokes-indirect" && carriesTo.has(e.to)) invoked.add(e.to);
  for (const [carrierId, targets] of carriesTo) {
    if (targets.size >= 2 && invoked.has(carrierId)) return true;
  }
  return false;
}

function appliedStateFor(problem: Problem, graph: Graph, ctx: HypothesisContext): AppliedStateResult {
  const className = problem.locations[0]!.anchor?.symbolPath[0] ?? null;
  const file = ctx.file;

  if (file && className) {
    const sets = ctx.setsFor(file.language);
    const loopTypes = loopNodeTypes(sets);
    const members = membersOfOwningClass(file, className);
    const complete = findCompletePair(members, loopTypes);
    if (complete) {
      return {
        state: "ya-aplicado",
        checks: [
          {
            label: "par-suscriptor-notificador-completo",
            passed: true,
            why:
              `\`${className}\` ya mantiene una lista genérica sobre el campo \`${complete.field}\`: \`${complete.subscribeMember}\` ` +
              `reenvía su propio parámetro hacia \`this.${complete.field}\` y \`${complete.notifyMember}\` recorre ese campo invocando ` +
              "cada elemento — la pareja suscriptor/notificador de Observer, ya aplicada. El fan-out a mano que ancla este " +
              "hallazgo convive con esa lista (SIMPLIFICACIÓN DECLARADA: no se verifica que sea el MISMO mecanismo el que " +
              "debería cubrirlo — ver el docstring del módulo, 'aplicado-eludido' queda gateado al grafo).",
            role: "applied",
          },
        ],
      };
    }

    // PARCIAL vía AST: sólo una mitad del par.
    let halfField: string | null = null;
    let halfWhich: "suscriptor" | "notificador" | null = null;
    for (const m of members) {
      const selfNames = selfNamesFor(m);
      const sub = findSubscribeField(m.body, selfNames, paramNamesOf(m.node));
      if (sub) {
        halfField = sub;
        halfWhich = "suscriptor";
        break;
      }
      const notify = findNotifyField(m.body, selfNames, loopTypes);
      if (notify) {
        halfField = notify;
        halfWhich = "notificador";
        break;
      }
    }
    if (halfField) {
      return {
        state: "parcial",
        checks: [
          {
            label: "mitad-de-la-pareja-existente",
            passed: true,
            why: `\`${className}\` tiene un miembro ${halfWhich} real sobre el campo \`${halfField}\`, pero no su contraparte — la lista existe a medias, no formalizada como Observer completo.`,
            role: "applied",
          },
        ],
      };
    }
  }

  if (graph) {
    const file2 = problem.locations[0]!.file;
    if (hasAdHocDispatchCarrier(graph, file2)) {
      return {
        state: "parcial",
        checks: [
          {
            label: "portador-ad-hoc-existente",
            passed: true,
            why: "el grafo muestra un portador con fan-in >=2 hacia invocables + invocación indirecta en este archivo — una tabla de despacho ad hoc, no formalizada como Observer con interfaz común (CONTRATO-F9.md §3.5).",
            role: "applied",
          },
        ],
      };
    }
  }

  return {
    state: "ausente",
    checks: [
      {
        label: "sin-maquinaria-generica",
        passed: false,
        why: file
          ? `no se encontró, en \`${className ?? "?"}\`, ni un par suscriptor/notificador sobre un campo común ni un portador ad hoc — el fan-out a mano parece ser todo lo que hay.`
          : "árbol no disponible para confirmar si existe maquinaria genérica cercana; se asume ausente de forma conservadora.",
        role: "applied",
      },
    ],
  };
}

const hasEnoughNotifiersCheck: Check<Problem, Graph> = {
  id: "suficientes-notificadores",
  describe: `al menos ${OBSERVER_MIN_NOTIFIERS} miembros distintos notificando a mano (re-verificación del ancla)`,
  run: (problem) => {
    const value = problem.trigger[0]!.value;
    return { holds: value >= OBSERVER_MIN_NOTIFIERS, evidence: `${value} miembros distintos notifican a mano (mínimo ${OBSERVER_MIN_NOTIFIERS}).` };
  },
};

const strongSignalDiscriminator: Check<Problem, Graph> = {
  id: `${OBSERVER_STRONG_SIGNAL}-o-mas`,
  describe: `${OBSERVER_STRONG_SIGNAL} o más miembros notificando a mano — más fuerte que el piso`,
  run: (problem) => {
    const value = problem.trigger[0]!.value;
    return { holds: value >= OBSERVER_STRONG_SIGNAL, evidence: `${value} (>= ${OBSERVER_STRONG_SIGNAL} sube un peldaño).` };
  },
};

/**
 * Ola 11 — registro de pendientes §B1: Observer era el ÚNICO de los 17
 * archivos con CERO consumo (ni `ctx.neighborhood`, ni `carries`/
 * `invokes-indirect`, la Forma 4 por valor que Ola 9 dejó emitiendo — 7.565
 * `carries`/113 `invokes-indirect` en los 8 repos, sin ningún consumidor
 * real). Este discriminador re-corre `hasAdHocDispatchCarrier` (la MISMA
 * función que `appliedStateFor` ya usa para `parcial` vía grafo, abajo) con
 * el grafo REAL de `refresh()` — nunca decide `state` (prohibido por
 * contrato), sólo SUMA confianza cuando el portador ad hoc existe de
 * verdad. En `build()` (`graph` SIEMPRE `null` para este ancla intra-file,
 * ver el docstring del módulo) es conservador: `holds: false`.
 */
const portadorAdHocConfirmadoPorGrafo: Check<Problem, Graph> = {
  id: "portador-ad-hoc-confirmado-por-grafo",
  describe:
    "el grafo real (`carries` fan-in >=2 + `invokes-indirect`, CONTRATO-F9.md §3.5 — la Forma 4 por valor) confirma un portador ad hoc de despacho en el archivo del hallazgo — evidencia adicional, nunca decide `state` (eso lo hace `appliedStateFor`, sólo con el `graph` de `build()`, que para este ancla intra-file es siempre `null`)",
  run: (problem, graph) => {
    if (!graph) {
      return {
        holds: false,
        evidence: "sin grafo real en esta corrida (build() ve graph=null para este ancla intra-file; ver el límite de cableado del docstring del módulo).",
      };
    }
    const file = problem.locations[0]!.file;
    const holds = hasAdHocDispatchCarrier(graph, file);
    return {
      holds,
      evidence: holds
        ? `el grafo real confirma un portador con \`carries\` fan-in >=2 + \`invokes-indirect\` en "${file}" — Observer implementado con una tabla de despacho ad hoc, visible por primera vez para esta hipótesis (registro de pendientes §B1).`
        : `el grafo real no muestra un portador ad hoc (\`carries\`+\`invokes-indirect\`) en "${file}".`,
    };
  },
};

/**
 * Ola 11 — el vecindario en sí (`ctx.neighborhood.countOfKind`): ¿el mismo
 * olor (`manual-notification`) aparece en OTROS archivos del repo? Si sí,
 * es más motivo real para centralizar con un Observer genérico (no un caso
 * aislado) — evidencia adicional, nunca decide `state`. En `build()`
 * (`ctx.neighborhood` SIEMPRE `EMPTY_NEIGHBORHOOD` para este ancla
 * intra-file) el conteo es siempre 0, conservador por diseño.
 */
function vecindarioMuestraPatronRepetido(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "vecindario-muestra-patron-repetido",
    describe:
      "el vecindario (`ctx.neighborhood.countOfKind`) muestra que 'manual-notification' aparece en OTROS archivos del repo — el mismo olor repetido, más motivo para una abstracción genérica en vez de un caso aislado",
    run: (problem) => {
      const count = ctx.neighborhood.countOfKind(problem.kind);
      return {
        holds: count > 0,
        evidence:
          count > 0
            ? `${count} hallazgo(s) más de "${problem.kind}" en el repo (vecindario real): el mismo olor se repite, más motivo para una abstracción genérica.`
            : `ningún otro hallazgo de "${problem.kind}" según el vecindario (o el vecindario está vacío en esta corrida — build() siempre lo ve vacío para este ancla intra-file; sólo refresh() ve el índice real).`,
      };
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AE (AE11) — EL CAMINO DE ENTRADA DEL ANCLA-FUERZA `hard-wired-notification`
 *
 * Camino PROPIO, en paralelo al viejo: no toca ni un `required`, ni un
 * discriminador, ni una rama de `appliedState` del camino de
 * `manual-notification`. La única línea compartida que cambia es el array
 * `anchors`, que SUMA. Ver `detect/intra-file/hard-wired-notification.ts` para
 * la fuerza, las cinco condiciones y los dos umbrales con su razón.
 * ══════════════════════════════════════════════════════════════════════════ */

const HARD_WIRED_KIND = "hard-wired-notification";
/** El detector ya exige `> 1` (`presencia`); acá se RE-VERIFICA sobre el propio `trigger`, que es el dato que viajó. */
const HW_MIN_PLACES = 2;
/** Mismo piso que `hard-wired-notification.ts#MIN_TARGETS`, re-verificado acá. */
const HW_MIN_TARGETS = 3;
const HW_STRONG_TARGETS = 4;
const HW_STRONG_PLACES = 3;

function triggerValue(problem: Problem, label: string): number | null {
  const t = problem.trigger.find((x) => x.label === label);
  return t ? t.value : null;
}

/**
 * *"Agregar un interesado obliga a tocar MÁS DE UN punto de cambio"* — la
 * fuerza entera de Observer en una línea. Se re-verifica acá, sobre el dato que
 * viajó en el `trigger`, en vez de confiar en que el detector lo respetó. Si el
 * dato no está, `holds: false` — nunca "no pude mirar, apruebo".
 */
const hwRepeatedPlacesCheck: Check<Problem, Graph> = {
  id: "repeticion-en-varios-puntos-de-cambio",
  describe: `el mismo listado de interesados está escrito en al menos ${HW_MIN_PLACES} puntos de cambio distintos del mismo dueño`,
  run: (problem) => {
    const value = triggerValue(problem, "puntos de cambio que repiten el mismo listado");
    if (value === null) return { holds: false, evidence: "el hallazgo no trae el conteo de puntos de cambio: no hay con qué confirmar la repetición." };
    return { holds: value >= HW_MIN_PLACES, evidence: `${value} puntos de cambio repiten el mismo listado (mínimo ${HW_MIN_PLACES}).` };
  },
};

/**
 * *"Hay una LISTA de interesados, no un par fijo"* — el falso que cuatro jueces
 * distintos anotaron con la misma frase en las Olas P y Z ("par fijo, no lista
 * de suscriptores"). Con dos destinatarios no hay lista que crezca.
 */
const hwEnoughTargetsCheck: Check<Problem, Graph> = {
  id: "listado-de-varios-interesados",
  describe: `al menos ${HW_MIN_TARGETS} destinatarios distintos nombrados uno por uno — con dos es un par fijo, no una lista`,
  run: (problem) => {
    const value = triggerValue(problem, "interesados nombrados uno por uno");
    if (value === null) return { holds: false, evidence: "el hallazgo no trae el conteo de destinatarios: no hay con qué descartar un par fijo." };
    return { holds: value >= HW_MIN_TARGETS, evidence: `${value} destinatarios distintos (mínimo ${HW_MIN_TARGETS}).` };
  },
};

/**
 * *"La lista genérica NO está ya puesta"* — RESOLUCIÓN VERIFICADA, preguntada
 * por segunda vez y desde el otro lado: el detector la verificó sobre el
 * archivo que estaba analizando; acá se vuelve a preguntar sobre el árbol VIVO
 * que la hipótesis recibe. Si no hay árbol o no se puede ubicar al dueño,
 * `holds: false` — el `required` no aprueba por no poder mirar.
 */
function hwNoGenericListCheckFor(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "sin-lista-generica-en-el-dueno",
    describe:
      "el dueño del estado NO tiene ya la pareja suscriptor/notificador sobre un campo común (si la tuviera, lo que falta no es Observer sino usar la lista que ya hay)",
    run: (problem) => {
      const file = ctx.file;
      const className = problem.locations[0]?.anchor?.symbolPath[0] ?? null;
      if (!file || !className) {
        return { holds: false, evidence: "sin árbol vivo o sin dueño identificable en el hallazgo: no hay con qué verificar que la lista genérica no esté ya puesta." };
      }
      const members = membersOfOwningClass(file, className);
      if (members.length === 0) {
        return { holds: false, evidence: `no se pudieron ubicar los miembros de \`${className}\` en el árbol vivo: no hay con qué verificar la resolución.` };
      }
      const complete = findCompletePair(members, loopNodeTypes(ctx.setsFor(file.language)));
      return complete
        ? { holds: false, evidence: `\`${className}\` YA mantiene una lista genérica sobre \`${complete.field}\` (\`${complete.subscribeMember}\` suscribe, \`${complete.notifyMember}\` recorre): Observer está aplicado.` }
        : { holds: true, evidence: `\`${className}\` no tiene la pareja suscriptor/notificador sobre ningún campo común entre sus ${members.length} miembros.` };
    },
  };
}

/** Más puntos de cambio = más lugares que hay que editar por cada interesado nuevo. */
const hwManyPlacesDiscriminator: Check<Problem, Graph> = {
  id: `${HW_STRONG_PLACES}-o-mas-puntos-de-cambio`,
  describe: `${HW_STRONG_PLACES} o más puntos de cambio repitiendo el listado — más trabajo que la lista genérica ahorra`,
  run: (problem) => {
    const value = triggerValue(problem, "puntos de cambio que repiten el mismo listado") ?? 0;
    return { holds: value >= HW_STRONG_PLACES, evidence: `${value} puntos de cambio (>= ${HW_STRONG_PLACES} sube un peldaño).` };
  },
};

/** Más interesados = menos posible que sea un conjunto fijo del diseño. */
const hwManyTargetsDiscriminator: Check<Problem, Graph> = {
  id: `${HW_STRONG_TARGETS}-o-mas-interesados`,
  describe: `${HW_STRONG_TARGETS} o más destinatarios distintos — cada vez menos parecido a un conjunto fijo elegido a propósito`,
  run: (problem) => {
    const value = triggerValue(problem, "interesados nombrados uno por uno") ?? 0;
    return { holds: value >= HW_STRONG_TARGETS, evidence: `${value} destinatarios (>= ${HW_STRONG_TARGETS} sube un peldaño).` };
  },
};

/**
 * *"Los destinatarios YA comparten protocolo"* — cuando todos los avisos usan
 * el MISMO nombre de método, la lista genérica se puede introducir sin inventar
 * primero una interfaz común, así que el refactor es más barato y la propuesta
 * más fuerte. NUNCA es una condición de entrada: exigirla es exactamente lo que
 * deja al ancla vieja (`manual-notification`) en cero, porque pide que media
 * cura ya esté puesta. Acá sólo SUMA confianza.
 */
const hwSharedProtocolDiscriminator: Check<Problem, Graph> = {
  id: "destinatarios-con-protocolo-comun",
  describe: "todos los avisos llaman al MISMO nombre de método — los destinatarios ya comparten protocolo, así que la lista genérica no obliga a inventar antes una interfaz común",
  run: (problem) => {
    const e = problem.evidence?.find((x) => x.label === "nombres de método distintos entre los avisos");
    if (!e) return { holds: false, evidence: "el hallazgo no publica cuántos nombres de método distintos usan los avisos." };
    return {
      holds: e.value === 1,
      evidence: e.value === 1 ? "los avisos usan un único nombre de método: los destinatarios ya comparten protocolo." : `${e.value} nombres de método distintos: el refactor tiene que inventar además el evento común.`,
    };
  },
};

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO, y por qué NO reusa `appliedStateFor`.
 *
 * `appliedStateFor` decide `parcial` cuando encuentra "media pareja", y una de
 * sus dos mitades es `findSubscribeField`, que llama "suscriptor" a cualquier
 * miembro que reenvíe un parámetro propio a un campo propio. Para el ancla
 * VIEJA eso es correcto (su forma es `this.a.f(e); this.b.f(e);`, que
 * `isFanoutMember` descarta explícitamente antes). Para el ancla NUEVA no lo
 * es: **el aviso mismo — `this.mailer.send(e)` — reenvía un parámetro propio a
 * un campo propio**, así que TODO hallazgo del ancla nueva se leería como
 * `parcial` y `ausente` sería inalcanzable. Es exactamente el peldaño vacuo que
 * la Ola AD midió y reemplazó en su propia escalera (AD4 §7.1): *un peldaño que
 * contesta siempre lo mismo no informa nada*.
 *
 * Acá `parcial` se reserva para la mitad INEQUÍVOCA: el dueño ya tiene un
 * miembro que RECORRE-E-INVOCA un campo propio (maquinaria genérica de
 * despacho, sin la mitad que suscribe). Todo lo demás es `ausente`.
 *
 * `ya-aplicado` es INALCANZABLE desde este camino, y lo digo con todas las
 * letras con el mismo criterio con el que AC3 y AD4 lo dijeron de las suyas:
 * el `required` `sin-lista-generica-en-el-dueno` ya devuelve `holds: false`
 * cuando la pareja completa existe, así que la hipótesis ni se construye. **Que
 * no produzca `ya-aplicado` NO es mérito suyo.** Lo que sí es mérito medible es
 * que el DETECTOR se calle en ese caso (condiciones 5a/5b), y hay dos tests que
 * lo exigen.
 */
function hardWiredAppliedState(problem: Problem, ctx: HypothesisContext): AppliedStateResult {
  const className = problem.locations[0]!.anchor?.symbolPath[0] ?? null;
  const file = ctx.file;
  if (file && className) {
    const loopTypes = loopNodeTypes(ctx.setsFor(file.language));
    for (const m of membersOfOwningClass(file, className)) {
      const notify = findNotifyField(m.body, selfNamesFor(m), loopTypes);
      if (notify) {
        return {
          state: "parcial",
          checks: [
            {
              label: "mitad-de-despacho-generico-existente",
              passed: true,
              why: `\`${className}\` ya tiene un miembro (\`${m.name}\`) que recorre \`${notify}\` invocando cada elemento — hay maquinaria de despacho genérico, pero los avisos de este hallazgo no pasan por ella.`,
              role: "applied",
            },
          ],
        };
      }
    }
  }
  return {
    state: "ausente",
    checks: [
      {
        label: "sin-maquinaria-generica",
        passed: false,
        why: file
          ? `no se encontró, en \`${className ?? "?"}\`, ningún miembro que recorra un campo propio invocando cada elemento: el listado escrito a mano parece ser todo lo que hay.`
          : "árbol no disponible; el `required` de resolución ya impidió construir la hipótesis en ese caso.",
        role: "applied",
      },
    ],
  };
}

function buildHardWiredSpec(ctx: HypothesisContext): HypothesisSpec<Problem, Graph> {
  return {
    pattern: "Observer",
    // Misma razón que el camino viejo: distinguir con precisión "el aviso
    // puntual PUEDE pasar por la lista" de "no puede" pide dataflow que este
    // analizador no tiene. Media, no alta.
    ceiling: "media",
    needs: [],
    required: [hwRepeatedPlacesCheck, hwEnoughTargetsCheck, hwNoGenericListCheckFor(ctx)],
    discriminators: [hwManyPlacesDiscriminator, hwManyTargetsDiscriminator, hwSharedProtocolDiscriminator, vecindarioMuestraPatronRepetido(ctx)],
    appliedState: (problem) => hardWiredAppliedState(problem, ctx),
    toConfirm: [
      "¿Los destinatarios son de verdad partes INTERESADAS en el cambio, o son piezas de un subsistema que este miembro coordina? Lo segundo es Facade, no Observer.",
      "¿La lista de interesados necesita crecer (hoy o mañana), o es un conjunto fijo que el diseño eligió a propósito? Si es fijo, Observer es sobre-ingeniería y la mitigación barata es extraer una función que haga los avisos en un solo lugar.",
      "¿El orden de los avisos importa? Una lista genérica recorrida en orden de inserción puede cambiar el orden actual.",
      "SIMPLIFICACIÓN DECLARADA: el detector confirma que el miembro cambia ALGÚN campo propio, no que el aviso dependa CAUSALMENTE de ese cambio — eso pide dataflow que este analizador no tiene.",
    ],
    source: "https://refactoring.guru/design-patterns/observer",
  };
}

function buildSpec(ctx: HypothesisContext): HypothesisSpec<Problem, Graph> {
  return {
    pattern: "Observer",
    // Ver el docstring del módulo: la ruta que distingue COMPLETA de
    // "aplicado-eludido" con precisión (¿el fan-out puntual pasa por F o no?)
    // no es observable sin dataflow — mismo motivo (requisito 3) que baja el
    // techo de Strategy. Media, no alta.
    ceiling: "media",
    needs: [],
    required: [hasEnoughNotifiersCheck],
    discriminators: [strongSignalDiscriminator, portadorAdHocConfirmadoPorGrafo, vecindarioMuestraPatronRepetido(ctx)],
    appliedState: (problem, graph) => appliedStateFor(problem, graph, ctx),
    toConfirm: [
      "¿Los colaboradores llamados a mano comparten de verdad la misma interfaz, o el parecido de nombre/aridad es casualidad?",
      "¿La lista de colaboradores necesita crecer en runtime (suscribir/desuscribir), o es un conjunto fijo conocido en tiempo de compilación (entonces Observer es sobre-ingeniería)?",
      "¿El orden de notificación importa? Una lista genérica recorrida en orden de inserción puede cambiar el orden actual si hoy las llamadas a mano siguen otro criterio.",
    ],
    source: "https://refactoring.guru/design-patterns/observer",
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI7 — LA TRAZA DEL EMBUDO (auditoría de compuertas).
 * Mismo mecanismo, misma forma y mismo default que
 * `engine.ts#startArbitrationTrace` y `strategy.ts#startStrategyTrace`
 * (Ola AH, AH1): `null` en producción ⇒ costo cero. Los `required` que se
 * re-corren acá son puros. No cambia ningún comportamiento.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface ObserverTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly language: string | null;
  readonly ruta: string;
  readonly withGraph: boolean;
  readonly withFile: boolean;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly appliedState: string;
  readonly emitted: boolean;
}

let observerTrace: ObserverTraceEntry[] | null = null;

export function startObserverTrace(): void {
  observerTrace = [];
}

export function takeObserverTrace(): readonly ObserverTraceEntry[] {
  const t = observerTrace ?? [];
  observerTrace = null;
  return t;
}

function recordObserverTrace(spec: HypothesisSpec<Problem, Graph>, problem: Problem, graph: Graph, ctx: HypothesisContext, ruta: string, emitted: boolean): void {
  const checks = spec.required.map((c) => ({ id: c.id, holds: c.run(problem, graph).holds }));
  const loc = problem.locations[0];
  observerTrace?.push({
    findingId: problem.id ?? "",
    kind: problem.kind,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    language: ctx.file?.language ?? null,
    ruta,
    withGraph: graph !== null,
    withFile: ctx.file !== null,
    checks,
    diesAt: checks.find((c) => !c.holds)?.id ?? null,
    appliedState: spec.appliedState(problem, graph).state,
    emitted,
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "observer",
  pattern: "Observer",
  layer: "patron",
  // OLA AE (AE11) — el array SUMA `hard-wired-notification` y CONSERVA
  // `manual-notification`: ningún frente de esta ola apaga nada. El ancla vieja
  // emite CERO en las dos poblaciones (medido, 21 repos) y se publica ese
  // número sin tocarla.
  anchors: ["manual-notification", "hard-wired-notification"],
  build(problem, graph, ctx) {
    if (problem.kind === HARD_WIRED_KIND) {
      const hwSpec = buildHardWiredSpec(ctx);
      const hwOutcome = build(hwSpec, ctx.capabilities, problem, graph);
      if (observerTrace) recordObserverTrace(hwSpec, problem, graph, ctx, "hard-wired", hwOutcome !== null);
      if (!hwOutcome) return null;
      return toPatternHypothesis(hwSpec, hwOutcome, {
        anchorFindingId: problem.id,
        places: problem.locations,
        cost:
          "Un campo de lista en el dueño del estado + suscribir/desuscribir + un solo recorrido que invoca a cada " +
          "interesado, y (si los destinatarios no comparten ya nombre de método) una interfaz común o un evento que " +
          "todos entiendan.",
      });
    }
    const spec = buildSpec(ctx);
    const outcome = build(spec, ctx.capabilities, problem, graph);
    if (observerTrace) recordObserverTrace(spec, problem, graph, ctx, "manual", outcome !== null);
    if (!outcome) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: problem.locations,
      cost:
        "Una interfaz común para los colaboradores (si no la tienen ya) + un campo de lista + suscribir/desuscribir + " +
        "reemplazar cada llamada a mano por un recorrido de la lista.",
    });
  },
  /**
   * Ola 11 — cierra, para Observer, el "CERO consumo" del registro de
   * pendientes §B1: `portadorAdHocConfirmadoPorGrafo` (grafo real,
   * `carries`/`invokes-indirect`) y `vecindarioMuestraPatronRepetido`
   * (`ctx.neighborhood.countOfKind`) sólo pueden confirmar algo de verdad
   * acá — en `build()` (llamada dentro de `analyzeFile`) `graph` y
   * `ctx.neighborhood` son siempre `null`/`EMPTY_NEIGHBORHOOD`. Ninguno de
   * los dos necesita nada cacheado del árbol vivo (ninguno lee `ctx.file`),
   * así que no hace falta `refreshState`. Nunca toca `state`/`checks` —
   * prohibido por contrato; sólo `discriminators`/`confidence`.
   */
  refresh(existing: PatternHypothesisDraft, problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    if (existing.state !== "ausente" && existing.state !== "parcial") return null; // no compiten por confianza — mismo criterio que engine.ts#refreshDiscriminators.
    const spec = problem.kind === HARD_WIRED_KIND ? buildHardWiredSpec(ctx) : buildSpec(ctx);
    return refreshDiscriminators(spec, existing, problem, graph);
  },
};
