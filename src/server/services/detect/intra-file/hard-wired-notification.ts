/**
 * `hard-wired-notification` — OLA AE, frente AE11. **EL ANCLA-FUERZA DE OBSERVER.**
 *
 * ─── POR QUÉ EXISTE: EL ANCLA VIEJA NO PUEDE DECIR "ACÁ FALTA UN OBSERVER" ──
 *
 * Observer tenía UNA sola ancla, `manual-notification`, y **emite CERO en las
 * dos poblaciones** (13 bibliotecas + 8 aplicaciones, 21 repos, medido por
 * este frente y coincidente dígito a dígito con lo que midió la Ola Z). La
 * causa NO es que la fuerza no exista: es que el ancla vieja exige, para
 * disparar, que **los destinatarios YA compartan protocolo** — mismo nombre de
 * método, misma aridad y el MISMO argumento textual
 * (`manual-notification.ts#fanoutGroupIn`). Esa uniformidad es exactamente lo
 * que Observer INTRODUCE. Pedirla como condición de entrada es pedir que media
 * cura ya esté puesta, la misma patología estructural que la Ola AC documentó
 * para `Decorator · homonymous-delegation` (la compuerta REQUIRED exigía un
 * reenvío EXISTENTE) y la Ola AD para las dos anclas de síntoma de Facade
 * (0 `ausente` sobre 288 hipótesis).
 *
 * **LO QUE CUESTA ESA EXIGENCIA, MEDIDO SOBRE LOS 21 REPOS ANTES DE ESCRIBIR
 * UNA LÍNEA DE ESTE ARCHIVO** (sonda de sólo lectura, `scratchpad-ae11/`):
 * miembros que cambian su propio estado y avisan a >=2 campos propios
 * distintos → **154 en bibliotecas / 360 en aplicaciones**; de ésos, los que
 * además repiten (nombre, aridad) sobre >=2 campos → 33 / 81; los que además
 * pasan el MISMO argumento → **9 / 16**; y los que además caen en una clase
 * con un SEGUNDO miembro igual (`distinctNotifiers`) → **0 / 0**.
 *
 * ─── LA FUERZA QUE ESTE ANCLA NOMBRA ───────────────────────────────────────
 *
 * *Un miembro cambia su propio estado y, acto seguido, **avisa a VARIOS
 * interesados nombrándolos UNO POR UNO**; y ese mismo listado de interesados
 * está escrito **en VARIOS puntos de cambio del mismo dueño**, así que sumar un
 * interesado obliga a editarlos todos.*
 *
 * Es la situación que Observer resuelve, no un síntoma correlacionado: lo que
 * el patrón compra es justamente que el sujeto DEJE de nombrar a sus
 * observadores. Y es lo contrario de la fuerza de Facade —donde los
 * colaboradores forman UN subsistema cohesivo y quien coordina es el CLIENTE—:
 * acá quien enumera es el DUEÑO DEL ESTADO y los destinatarios son partes
 * interesadas, no piezas de un subsistema.
 *
 * ─── LAS CINCO CONDICIONES, CON LA INTENCIÓN DE CADA UNA ────────────────────
 *
 * (1) **CAMBIA SU PROPIO ESTADO** — el miembro asigna a un campo de su propio
 *     dueño (`this.F = …`/`@f = …`/receptor de Go). INTENCIÓN: *"el aviso es
 *     sobre algo que ACABA DE CAMBIAR ACÁ"*. Sin esto, un miembro que llama a
 *     sus colaboradores es un coordinador — la fuerza de Facade, no la de
 *     Observer. **SIMPLIFICACIÓN DECLARADA, heredada del ancla vieja y con la
 *     misma razón**: no se verifica que el aviso dependa CAUSALMENTE de la
 *     mutación; eso pide dataflow que este analizador no tiene.
 *
 * (2) **AVISA A >= `interesados` DESTINATARIOS DISTINTOS, NOMBRADOS UNO POR
 *     UNO** — llamadas `X.m(…)` donde `X` es (a) un campo propio (`this.F`,
 *     `@F`, receptor de Go) o (b) un identificador DESNUDO que NO nace en este
 *     miembro (ni parámetro ni local asignada) — o sea un colaborador que
 *     quien cambia ya conocía. INTENCIÓN: *"hay VARIOS interesados y están
 *     cableados POR NOMBRE"*. La rama (b) no es un capricho: en Java, C# y
 *     TypeScript el campo propio se escribe SIN `this.`, y sin ella el ancla
 *     es ciega en esos lenguajes por construcción — el mismo tipo de ceguera
 *     por lenguaje que la Ola W (W4) ya midió y arregló en
 *     `homonymous-delegation.ts`.
 *
 * (3) **EL AVISO ES UN AVISO, NO UN CÁLCULO** — el resultado de cada una de
 *     esas llamadas se DESCARTA: la llamada no está dentro de otra llamada, ni
 *     del lado derecho de una asignación, ni dentro de un `return`, ni como
 *     operando de un `&&`/`||`/`and`/`or`. INTENCIÓN: *"a un interesado se le
 *     AVISA, no se le CONSULTA"*. Un Observer nunca consume lo que devuelve el
 *     observador; una llamada cuyo valor se usa es una consulta a un
 *     colaborador, que es otra cosa. (El caso `&&`/`||` viene medido desde la
 *     Ola P: `cobra/command.go#LocalFlags` — ver `manual-notification.ts`.)
 *
 * (4) **EL MISMO LISTADO SE REPITE EN >= `lugares` PUNTOS DE CAMBIO** — >= L
 *     miembros DISTINTOS del mismo dueño cumplen (1)+(2)+(3) sobre un conjunto
 *     COMÚN de >= `interesados` destinatarios. INTENCIÓN: *"agregar un
 *     interesado obliga a tocar VARIOS sitios — ahí es donde una lista genérica
 *     PAGA"*. Es la condición de ESCALA, la que la Ola AC midió que le FALTABA
 *     al ancla de State (7 máquinas de estado reales, 6 demasiado chicas).
 *
 * (5) **RESOLUCIÓN VERIFICADA — no disparar donde Observer YA ESTÁ**, en sus
 *     dos formas:
 *     (5a) el dueño NO tiene ya la pareja completa suscriptor+notificador
 *          sobre un campo común (reenviar un parámetro propio hacia un
 *          contenedor propio + recorrer ese contenedor invocando al elemento)
 *          — la MISMA maquinaria con la que `hypotheses/observer.ts` decide
 *          `ya-aplicado`, preguntada acá para callar antes de emitir.
 *          INTENCIÓN: *"si ya hay lista de suscriptores, lo que falta no es
 *          Observer: es usar la que ya hay"*.
 *     (5b) ninguno de los destinatarios del conjunto repetido es, él mismo, un
 *          contenedor que alguien RECORRE-E-INVOCA en este archivo.
 *          INTENCIÓN: *"si uno de los 'interesados' es en realidad el
 *          despachador ya formalizado, esto no es cableado a mano: es el uso
 *          normal del despachador"*. Corta la familia de falsos que la Ola P
 *          (P7) y la Ola Z (Z5) nombraron cuatro veces:
 *          `sqlalchemy Connection.execution_options` avisa a `self.dispatch`,
 *          que ES el sistema de eventos de la biblioteca.
 *
 * ─── LO QUE ESTE ANCLA NO PIDE, A PROPÓSITO ────────────────────────────────
 * **NO pide que los destinatarios compartan nombre de método, aridad ni
 * argumento.** Ésa es la exigencia que deja al ancla vieja en cero y es, punto
 * por punto, la estructura que Observer viene a crear. Cada hallazgo PUBLICA
 * cuántos de sus avisos comparten nombre de método (`evidence`), para que quien
 * lo lea sepa si el refactor es "juntar llamadas ya uniformes" o "además hay
 * que inventar el evento común". **Lo ambiguo viaja como ambiguo.**
 *
 * ─── GENERICIDAD ───────────────────────────────────────────────────────────
 * Cero léxico de dominio: ni nombres de campo, ni de método, ni de clase. Todo
 * es estructura de gramática — tipos de nodo (`/call|invocation/i`, mismo
 * criterio y misma razón que `homonymous-delegation.ts#CALL_NODE_TYPE` desde la
 * Ola W), campos de nodo (`OBJECT_FIELDS`/`CALLEE_NAME_FIELDS`, espejo de
 * `graph/references.ts`) y conjuntos derivados (`loopNodeTypes`, aritmética de
 * `DerivedNodeSets`, igual que `hypotheses/observer.ts`).
 *
 * DUPLICACIÓN DECLARADA: las primitivas de AST (`namedChildren`, `objectOf`,
 * `callTargetOf`, `isSelfFieldAccess`, `goReceiverOf`, …) son copia deliberada
 * de `manual-notification.ts`/`hypotheses/observer.ts`, con el mismo argumento
 * que esos dos archivos ya documentan: capas invertidas (`detect/*` no importa
 * de `hypotheses/*`) y dos detectores hermanos no se importan entre sí por una
 * decena de líneas.
 *
 * NO USA GRAFO: la forma vive entera dentro de un archivo (los miembros de un
 * dueño y a quién nombran). `ctx.file` llega VIVO a `hypotheses/observer.ts` en
 * producción justamente porque el ancla es `intra-file` — un ancla `inter-file`
 * dejaría a la hipótesis sin árbol y sin poder distinguir `ya-aplicado` de
 * `ausente`.
 */
import { pisoDeclarado, presencia } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

export const HARD_WIRED_NOTIFICATION_KIND = "hard-wired-notification";

/**
 * PISO DE ESCALA, ESCRITO ANTES DE MEDIR NINGUNA PRECISIÓN. El falso
 * documentado de este patrón, anotado por CUATRO jueces distintos en la Ola P
 * (frente P7) y reconfirmado por la Ola Z (Z5) con la misma frase literal, es
 * **"PAR FIJO, no lista de suscriptores"**: dos colaboradores de rol distinto
 * que se tocan juntos no son una lista que crezca — son un par que el diseño
 * fijó a propósito. **Con DOS destinatarios no hay lista: hay un par.** TRES es
 * el primer número en el que "varios interesados" ya no puede ser un par fijo y
 * en el que una lista genérica (interfaz común + campo + suscribir/desuscribir
 * + recorrer) ahorra más de lo que cuesta. Mismo tipo de razonamiento —y misma
 * lección— que la Ola AC midió al descubrir que a su ancla de State le faltaba
 * la condición de ESCALA (7 máquinas de estado REALES, 6 con 2-4 estados de una
 * línea).
 */
const MIN_TARGETS = 3;

const SELF_WORDS = new Set(["this", "self"]);
const RUBY_IVAR_TYPE = "instance_variable";
/** Espejo de `graph/references.ts#RECEIVER_FIELDS` — INCLUYENDO `expression`, que es el campo con el que C# escribe el receptor (`member_access_expression`) y que `manual-notification.ts` dejó afuera. */
const OBJECT_FIELDS = ["object", "operand", "receiver", "expression"];
/** Mismo criterio que `graph/references.ts#CALLEE_NAME_FIELDS`. */
const CALLEE_NAME_FIELDS = ["function", "method", "name"];
/**
 * `/call|invocation/i`, NO `/call/i` — y la razón está medida en este mismo
 * frente, no heredada: con `/call/i` (lo que usa `manual-notification.ts`) el
 * embudo ve **0 miembros con llamadas de campo en `corpus/guava` (1.983
 * archivos) y 0 en `corpus-app/jenkins` (1.399)**, y con `invocation` agregado
 * ve **102 y 101**. Java escribe `method_invocation` y C#
 * `invocation_expression`: ninguno de los dos contiene "call". Es exactamente
 * el arreglo que la Ola W (W4) ya hizo en
 * `detect/intra-file/homonymous-delegation.ts`, con su razonamiento escrito
 * ahí: "invocation" es vocabulario de GRAMÁTICA, del mismo estatus que "call".
 */
const CALL_NODE_TYPE = /call|invocation/i;
/** Mismo vocabulario CERRADO que `boolean-complexity.ts#LOGICAL_OPERATOR_TOKEN`. */
const LOGICAL_OPERATOR_TOKEN = /^(&&|\|\||and|or)$/;
/** Palabra RESERVADA del lenguaje —no léxico de dominio, misma categoría que `CONSTRUCTOR_NAMES` de `code-grammar.ts`— con la que las 9 gramáticas nombran el nodo que DEVUELVE un valor. Un aviso nunca se devuelve. */
const RETURN_NODE_TYPE = /(^|_)(return|yield)(_|$)/;
/**
 * Campos con los que una gramática expone el lado que CONSUME un valor: el
 * lado derecho de una asignación/enlace (`right`/`value`) y la **condición** de
 * una rama (`condition`) — `if (x.f())` es literalmente una CONSULTA a `x`, no
 * un aviso, y sin `condition` acá la condición (3) no verificaba lo que su
 * propio nombre dice. **Encontrado juzgando a mano** los 25 hallazgos de la
 * primera corrida: `string.IsNullOrEmpty(Host)` de ShareX entraba como "aviso a
 * `string`".
 */
const CONSUMING_FIELDS = ["right", "value", "condition"];
/** Nodo que agrupa los ARGUMENTOS de una llamada o de una construcción: todo lo que cuelga de él es un valor que ALGUIEN consume (`throw new Exception(x.f())`, `foo(x.f())`). */
const ARGUMENT_LIST_NODE_TYPE = /(^|_)arguments?(_list)?$/;

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

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function isAssignmentLike(node: AstNode): boolean {
  return hasField(node, "left") && hasField(node, "right");
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

/** Receptor + nombre de método de `X.m(…)` en las dos formas de gramática que coexisten en el corpus — ver el docstring de `hypotheses/observer.ts#callTargetOf` para la sonda contra las 4 gramáticas. */
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

/** Único vehículo de Go para "campo propio"/"dueño" — mismo criterio que `manual-notification.ts#goReceiverOf`. */
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

function bodyOf(fnNode: AstNode): AstNode | null {
  return (fnNode.childForFieldName("body") as AstNode | null) ?? (fnNode.childForFieldName("consequence") as AstNode | null);
}

/** Nombres de los parámetros propios de un miembro — técnica de 3 pasos ya establecida (`data-clump.ts#paramName`, `hypotheses/observer.ts#paramNamesOf`). */
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

/**
 * Los identificadores DESNUDOS que NACEN dentro del miembro: parámetros, más
 * todo lo que se asigna a un nombre simple, más todo nodo con campo `name`
 * (declaraciones). Es el complemento de la rama (b) de la condición (2): un
 * receptor desnudo que NO está acá es un colaborador que el miembro ya conocía
 * —campo propio sin `this.`, importación, símbolo de módulo—, no algo que él
 * mismo fabricó. Conservador por diseño: cualquier duda suma el nombre a esta
 * lista, o sea que EXCLUYE candidatos, nunca los inventa.
 */
function bornHereNamesOf(fnNode: AstNode, body: AstNode): Set<string> {
  const out = new Set<string>(paramNamesOf(fnNode));
  const assigns: AstNode[] = [];
  findAllDescendants(body, isAssignmentLike, 12, assigns);
  for (const a of assigns) {
    const left = a.childForFieldName("left") as AstNode | null;
    if (!left) continue;
    const u = unwrapSingleChild(left);
    if (u.childCount === 0) out.add(u.text);
    for (const k of namedChildren(left)) if (k.childCount === 0) out.add(k.text);
  }
  const named: AstNode[] = [];
  findAllDescendants(body, (n) => n.childForFieldName("name") !== null && !CALL_NODE_TYPE.test(n.type), 12, named);
  for (const d of named) {
    const n = d.childForFieldName("name") as AstNode | null;
    if (n && n.childCount === 0) out.add(n.text);
  }
  return out;
}

/**
 * Los nombres que el CUERPO DE LA CLASE declara como miembros de datos: todo
 * descendiente con campo `name` que no sea function-like ni una clase anidada,
 * sin entrar a los miembros. Es el vehículo con el que Java, C# y
 * TypeScript escriben `campo = valor` SIN `this.` — y es estructura de
 * gramática pura (un campo `name` bajo un nodo de clase), NO una rama por
 * lenguaje: Python y Ruby simplemente no declaran campos en el cuerpo de la
 * clase, así que ahí este conjunto sale vacío y la condición (1) se decide sólo
 * por `self.`/`@`, que es como esas dos gramáticas la escriben. Sin esto, la
 * condición (1) es **imposible de cumplir en Java y C#** — medido: la fixture
 * canónica de este mismo test, escrita en Java, no emitía nada.
 */
function declaredFieldNamesOf(classNode: AstNode, sets: FileUnit["sets"]): Set<string> {
  const out = new Set<string>();
  const walk = (node: AstNode, depth: number): void => {
    if (depth < 0) return;
    for (const c of namedChildren(node)) {
      if (sets.functionNodes.has(c.type) || sets.classNodes.has(c.type)) continue;
      const name = c.childForFieldName("name") as AstNode | null;
      if (name && name.childCount === 0) out.add(name.text);
      walk(c, depth - 1);
    }
  };
  walk(classNode, 4);
  return out;
}

/** SIMPLIFICACIÓN DECLARADA (ver el docstring, condición 1): mutación de ALGÚN campo propio en el cuerpo, sin ligadura causal con el aviso. */
function mutatesOwnState(body: AstNode, selfNames: ReadonlySet<string>, ownFieldNames: ReadonlySet<string>): boolean {
  const assigns: AstNode[] = [];
  findAllDescendants(body, isAssignmentLike, 10, assigns);
  return assigns.some((a) => {
    const left = unwrapSingleChild((a.childForFieldName("left") as AstNode | null) ?? a);
    if (isSelfFieldAccess(left, selfNames)) return true;
    return left.childCount === 0 && ownFieldNames.has(left.text);
  });
}

interface Notice {
  readonly target: string;
  readonly methodName: string;
  readonly line: number;
}

/**
 * Recorre el cuerpo arrastrando si lo que hay debajo está en posición de
 * CONSUMO — condición (3). El flag se propaga con OR y no se apaga: una vez que
 * el descenso entra a los argumentos de otra llamada, al lado derecho de una
 * asignación, a un `return` o a un operando lógico, TODO lo de abajo es
 * cálculo, no aviso.
 */
function collectNotices(node: AstNode, consumed: boolean, depth: number, out: { node: AstNode; consumed: boolean }[]): void {
  if (CALL_NODE_TYPE.test(node.type)) out.push({ node, consumed });
  if (depth <= 0) return;
  const operator = node.childForFieldName("operator") as AstNode | null;
  const isLogical = operator !== null && LOGICAL_OPERATOR_TOKEN.test(operator.text);
  const consumingChildren = new Set<AstNode>();
  for (const f of CONSUMING_FIELDS) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) consumingChildren.add(c);
  }
  const baseConsumed =
    consumed || isLogical || CALL_NODE_TYPE.test(node.type) || RETURN_NODE_TYPE.test(node.type) || ARGUMENT_LIST_NODE_TYPE.test(node.type);
  for (const c of namedChildren(node)) collectNotices(c, baseConsumed || consumingChildren.has(c), depth - 1, out);
}

/** Los avisos de un miembro: llamadas `X.m(…)` con el resultado descartado, hacia un destinatario que el miembro NO fabricó. */
function noticesOf(fnNode: AstNode, body: AstNode, selfNames: ReadonlySet<string>): Notice[] {
  const bornHere = bornHereNamesOf(fnNode, body);
  const calls: { node: AstNode; consumed: boolean }[] = [];
  collectNotices(body, false, 14, calls);
  const out: Notice[] = [];
  for (const { node: call, consumed } of calls) {
    if (consumed) continue;
    const t = callTargetOf(call);
    if (!t) continue;
    if (isSelfFieldAccess(t.object, selfNames)) {
      out.push({ target: fieldKeyOf(t.object), methodName: t.methodName, line: call.startPosition.row + 1 });
      continue;
    }
    if (t.object.childCount === 0 && !bornHere.has(t.object.text) && !selfNames.has(t.object.text)) {
      out.push({ target: t.object.text, methodName: t.methodName, line: call.startPosition.row + 1 });
    }
  }
  return out;
}

/* ── (5) RESOLUCIÓN VERIFICADA — la maquinaria genérica, si ya está ───────── */

/**
 * Tipos de nodo de ITERACIÓN, derivados de `DerivedNodeSets` por aritmética de
 * conjuntos y sin ninguna lista de palabras — copia literal de
 * `hypotheses/observer.ts#loopNodeTypes` (ver su docstring para el
 * razonamiento y para por qué NO se usa `LOOP_KEYWORD`).
 */
function loopNodeTypes(sets: FileUnit["sets"]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const t of sets.nestingNodes) {
    if (sets.exceptionNodes.has(t) || sets.switchContainerNodes.has(t) || sets.chainNodes.has(t)) continue;
    out.add(t);
  }
  return out;
}

function loopClauseOf(loopNode: AstNode): AstNode {
  for (const c of namedChildren(loopNode)) if (c.type === "range_clause") return c;
  return loopNode;
}

function boundVarNameOf(loopNode: AstNode): string | null {
  const clause = loopClauseOf(loopNode);
  for (const f of ["left", "name", "pattern"]) {
    const c = clause.childForFieldName(f) as AstNode | null;
    if (!c) continue;
    const u = unwrapSingleChild(c);
    const kids = namedChildren(u);
    if (kids.length > 0) return kids[kids.length - 1]!.text; // Go `_, x`: el último es el elemento.
    return u.text;
  }
  return null;
}

function iteratedNodeOf(loopNode: AstNode): AstNode | null {
  const clause = loopClauseOf(loopNode);
  for (const f of ["right", "value"]) {
    const c = clause.childForFieldName(f) as AstNode | null;
    if (c) return unwrapSingleChild(c);
  }
  return null;
}

function invokesElement(scope: AstNode, boundVar: string): boolean {
  const calls: AstNode[] = [];
  findAllDescendants(scope, (n) => CALL_NODE_TYPE.test(n.type), 14, calls);
  return calls.some((call) => {
    const t = callTargetOf(call);
    return t !== null && t.object.childCount === 0 && t.object.text === boundVar;
  });
}

/** El nombre de lo que se recorre-e-invoca dentro de `scope`, vía nodo de bucle. Devuelve el TEXTO del contenedor recorrido (`fieldKeyOf` si es campo propio, el identificador desnudo si no). */
function traversedAndInvokedIn(scope: AstNode, loopTypes: ReadonlySet<string>, selfNames: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const loops: AstNode[] = [];
  findAllDescendants(scope, (n) => loopTypes.has(n.type), 14, loops);
  for (const loop of loops) {
    const bv = boundVarNameOf(loop);
    const iterated = iteratedNodeOf(loop);
    if (!bv || !iterated) continue;
    const lb = bodyOf(loop) ?? loop;
    if (!invokesElement(lb, bv)) continue;
    out.push(isSelfFieldAccess(iterated, selfNames) ? fieldKeyOf(iterated) : iterated.text);
  }
  // Gramáticas sin nodo de bucle dedicado (Ruby `.each { |o| o.update(e) }`).
  const calls: AstNode[] = [];
  findAllDescendants(scope, (n) => CALL_NODE_TYPE.test(n.type), 14, calls);
  for (const call of calls) {
    const obj = objectOf(call);
    if (!obj) continue;
    const block = namedChildren(call).find((c) => c.type === "block" || c.type === "do_block");
    if (!block) continue;
    const params = block.childForFieldName("parameters") as AstNode | null;
    const kids = params ? namedChildren(params) : [];
    if (kids.length !== 1) continue;
    const bb = (block.childForFieldName("body") as AstNode | null) ?? block;
    if (invokesElement(bb, kids[0]!.text)) out.push(isSelfFieldAccess(obj, selfNames) ? fieldKeyOf(obj) : obj.text);
  }
  return out;
}

/** (5a) La mitad "suscriptor": reenvía SIN transformar un parámetro propio hacia un contenedor propio. Mismo criterio que `hypotheses/observer.ts#findSubscribeField`, en su forma mínima (llamada con receptor de campo propio, u operador `<<` de Ruby, o `append(this.F, x)` de Go). */
function subscribeFieldIn(fnNode: AstNode, body: AstNode, selfNames: ReadonlySet<string>): string | null {
  const params = paramNamesOf(fnNode);
  if (params.length === 0) return null;
  const shifts: AstNode[] = [];
  findAllDescendants(body, (n) => n.childForFieldName("operator") !== null && (n.childForFieldName("operator") as AstNode).text === "<<" && isAssignmentLike(n), 14, shifts);
  for (const s of shifts) {
    const left = unwrapSingleChild(s.childForFieldName("left") as AstNode);
    const right = s.childForFieldName("right") as AstNode;
    if (isSelfFieldAccess(left, selfNames) && right.childCount === 0 && params.includes(right.text)) return fieldKeyOf(left);
  }
  const calls: AstNode[] = [];
  findAllDescendants(body, (n) => CALL_NODE_TYPE.test(n.type), 14, calls);
  for (const call of calls) {
    const args = (call.childForFieldName("arguments") as AstNode | null) ?? (call.childForFieldName("argument_list") as AstNode | null);
    const argNodes = args ? namedChildren(args) : [];
    const forwards = argNodes.some((a) => a.childCount === 0 && params.includes(a.text));
    if (!forwards) continue;
    const t = callTargetOf(call);
    if (t && isSelfFieldAccess(t.object, selfNames)) return fieldKeyOf(t.object);
    const callee = calleeOf(call);
    if (callee && callee.childCount === 0 && callee.text === "append" && argNodes[0]) {
      const first = unwrapSingleChild(argNodes[0]);
      if (isSelfFieldAccess(first, selfNames)) return fieldKeyOf(first);
    }
  }
  return null;
}

interface Member {
  readonly name: string;
  readonly node: AstNode;
  readonly body: AstNode;
  readonly selfNames: ReadonlySet<string>;
  readonly line: number;
  readonly endLine: number;
}

interface OwnerBucket {
  readonly ownerName: string;
  readonly members: Member[];
  /** Los campos que el cuerpo de la clase declara — ver `declaredFieldNamesOf`. Vacío para un dueño de Go (no hay nodo de clase). */
  ownFieldNames: Set<string>;
}

/** El conjunto de destinatarios repetido y los miembros que lo repiten. */
interface RepeatedSet {
  readonly targets: readonly string[];
  readonly members: readonly { member: Member; notices: readonly Notice[] }[];
}

/** El grupo MÁS GRANDE (más miembros; a igualdad, más destinatarios) de la lista de candidatos. Determinista: recorre las intersecciones de pares en orden. */
function bestRepeatedSet(cands: readonly { member: Member; notices: readonly Notice[]; targets: readonly string[] }[], minTargets: number, minPlaces: number): RepeatedSet | null {
  let best: RepeatedSet | null = null;
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = new Set(cands[i]!.targets);
      const inter = cands[j]!.targets.filter((t) => a.has(t));
      if (inter.length < minTargets) continue;
      const withSet = cands.filter((c) => inter.every((t) => c.targets.includes(t)));
      const byName = new Map<string, { member: Member; notices: readonly Notice[] }>();
      for (const c of withSet) if (!byName.has(c.member.name)) byName.set(c.member.name, { member: c.member, notices: c.notices });
      const members = [...byName.values()].sort((x, y) => x.member.line - y.member.line);
      if (members.length < minPlaces) continue;
      const cand: RepeatedSet = { targets: [...inter].sort(), members };
      if (!best || members.length > best.members.length || (members.length === best.members.length && cand.targets.length > best.targets.length)) best = cand;
    }
  }
  return best;
}

export const detector: IntraFileDetector<"interesados" | "lugares", "hard-wired-notification"> = {
  id: "hard-wired-notification",
  kind: "hard-wired-notification",
  scope: "intra-file",
  title: "Aviso cableado a mano a varios interesados, repetido",
  // SIN `needs`: la forma —un miembro que cambia su estado y nombra a varios
  // colaboradores— existe en los 9 lenguajes y no depende de ninguna
  // `Capability` declarada. Misma razón que `optional-behavior-flags.ts` y
  // `exposed-container-traversal.ts` escriben para las suyas.
  needs: [],
  thresholds: {
    interesados: pisoDeclarado(MIN_TARGETS, {
      rationale:
        "El falso documentado de este patrón, anotado por CUATRO jueces distintos en la Ola P (P7) y reconfirmado " +
        "por la Ola Z (Z5) con la misma frase literal, es \"par fijo, no lista de suscriptores\": dos colaboradores " +
        "de rol distinto que se tocan juntos no son una lista que crezca, son un par que el diseño fijó a propósito. " +
        "Con DOS destinatarios no hay lista: hay un par. TRES es el primer número en el que \"varios interesados\" " +
        "ya no puede ser un par fijo y en el que la maquinaria de Observer (interfaz común + campo de lista + " +
        "suscribir/desuscribir + recorrer) ahorra más de lo que cuesta.",
    }),
    lugares: presencia({
      rationale:
        "La fuerza que Observer resuelve es que AGREGAR UN INTERESADO OBLIGA A TOCAR A QUIEN CAMBIA. Con UN SOLO " +
        "punto de cambio eso cuesta una línea en un lugar y ninguna abstracción paga: la repetición, no un único " +
        "sitio, es la señal. Es una pregunta BINARIA (¿el mismo listado está escrito en más de un punto de cambio " +
        "del mismo dueño?), no un piso elegido a mano — el mismo criterio y la misma razón con que el ancla vieja " +
        "de este patrón declara su `distinctNotifiers`.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<"interesados" | "lugares">): readonly RawFinding[] {
    const minTargets = ctx.threshold("interesados");
    const minPlaces = ctx.threshold("lugares");
    const loopTypes = loopNodeTypes(file.sets);
    const findings: RawFinding[] = [];

    // (5b) — todo lo que en ESTE archivo se recorre-e-invoca: si un
    // "destinatario" está acá, es un despachador ya formalizado, no un
    // interesado cableado a mano.
    const dispatched = new Set<string>(traversedAndInvokedIn(file.root, loopTypes, SELF_WORDS));

    const byOwner = new Map<string, OwnerBucket>();
    const visit = (node: AstNode, cls: { name: string; key: string; fields: Set<string> } | null): void => {
      let nextCls = cls;
      if (file.sets.classNodes.has(node.type)) {
        const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
        nextCls = { name, key: `${name}@${node.startPosition.row}`, fields: declaredFieldNamesOf(node, file.sets) };
      } else if (file.sets.functionNodes.has(node.type)) {
        const goReceiver = goReceiverOf(node);
        const selfNames = new Set(SELF_WORDS);
        let owner = nextCls;
        if (goReceiver) {
          selfNames.add(goReceiver.paramName);
          owner = { name: goReceiver.typeName, key: `receptor:${goReceiver.typeName}`, fields: new Set<string>() };
        }
        const body = bodyOf(node);
        const name = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
        if (body && owner) {
          const bucket = byOwner.get(owner.key) ?? { ownerName: owner.name, members: [], ownFieldNames: new Set<string>() };
          bucket.members.push({ name, node, body, selfNames, line: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
          for (const f of owner.fields) bucket.ownFieldNames.add(f);
          byOwner.set(owner.key, bucket);
        }
        // UN MIEMBRO NO CONTIENE OTRO PUNTO DE CAMBIO: se corta el descenso acá,
        // igual que `hypotheses/observer.ts#membersOfOwningClass`. Una función
        // ANIDADA (una lambda, un callback) no es un segundo punto de cambio del
        // dueño: es la misma línea de código, y contarla infla `lugares` con una
        // repetición que no existe. **Encontrado juzgando a mano** los 25
        // hallazgos de la primera corrida: 3 de 25 (nest `client-redis`/
        // `client-mqtt` y jenkins `AsyncPeriodicWork`) eran exactamente eso —
        // un método y su propia clausura contados como dos. Las llamadas de la
        // clausura siguen contando, para el miembro que la contiene.
        return;
      }
      for (const c of namedChildren(node)) visit(c, nextCls);
    };
    visit(file.root, null);

    for (const { ownerName, members, ownFieldNames } of byOwner.values()) {
      // (5a) — si el dueño YA tiene la pareja completa suscriptor+notificador
      // sobre un campo común, Observer está aplicado: silencio.
      const subscribeFields = new Set<string>();
      const notifyFields = new Set<string>();
      for (const m of members) {
        const sub = subscribeFieldIn(m.node, m.body, m.selfNames);
        if (sub) subscribeFields.add(sub);
        for (const t of traversedAndInvokedIn(m.body, loopTypes, m.selfNames)) notifyFields.add(t);
      }
      if ([...subscribeFields].some((f) => notifyFields.has(f))) continue;

      // (1)+(2)+(3) por miembro.
      const cands = members
        .map((member) => {
          if (!mutatesOwnState(member.body, member.selfNames, ownFieldNames)) return null;
          const notices = noticesOf(member.node, member.body, member.selfNames);
          const targets = [...new Set(notices.map((n) => n.target))].filter((t) => !dispatched.has(t)).sort();
          if (targets.length < minTargets.value) return null;
          return { member, notices: notices.filter((n) => targets.includes(n.target)), targets };
        })
        .filter((x): x is { member: Member; notices: Notice[]; targets: string[] } => x !== null);

      // (4) — `presencia`: `lugares.value` es 1, así que `> value` es `>= 2`.
      const group = bestRepeatedSet(cands, minTargets.value, minPlaces.value + 1);
      if (!group) continue;

      const distinctMethodNames = new Set(group.members.flatMap((m) => m.notices.filter((n) => group.targets.includes(n.target)).map((n) => n.methodName)));
      const locations: RoleLocation[] = group.members.map((m, i) => ({
        file: file.path,
        startLine: m.member.line,
        endLine: m.member.endLine,
        symbol: m.member.name,
        anchor: { file: file.path, symbolPath: [ownerName, m.member.name] },
        role: `punto de cambio ${i + 1} de ${group.members.length}: cambia el estado de \`${ownerName}\` y avisa a [${group.targets.join(", ")}] uno por uno`,
      }));

      findings.push({
        title: `\`${ownerName}\` avisa a los mismos ${group.targets.length} interesados a mano, desde ${group.members.length} puntos de cambio`,
        detail:
          `${group.members.length} miembros distintos de \`${ownerName}\` cambian su propio estado y, acto seguido, avisan uno por uno ` +
          `a los MISMOS ${group.targets.length} destinatarios (${group.targets.join(", ")}), descartando lo que devuelven. ` +
          "Sumar un interesado obliga hoy a editar todos esos puntos de cambio. Una lista genérica de observadores " +
          "(suscribir/desuscribir + recorrer-e-invocar) deja al dueño del estado sin tener que nombrar a nadie. " +
          `Ninguno de los ${group.targets.length} destinatarios es un contenedor que este archivo recorra-e-invoque, y el dueño no ` +
          "tiene ya la pareja suscriptor/notificador sobre un campo común — verificado antes de emitir.",
        trigger: [
          { label: "puntos de cambio que repiten el mismo listado", value: group.members.length, threshold: minPlaces },
          { label: "interesados nombrados uno por uno", value: group.targets.length, threshold: minTargets },
        ],
        evidence: [
          { label: "nombres de método distintos entre los avisos", value: distinctMethodNames.size },
          { label: "miembros del dueño examinados", value: members.length },
        ],
        locations: locations as unknown as readonly [RoleLocation, ...RoleLocation[]],
        severity: Math.min(100, 25 + group.members.length * 10 + group.targets.length * 5),
        advice: {
          primary: {
            name: "Introduce Observer for hard-wired notifications",
            kind: "refactorizacion",
            why:
              "Reemplazar el listado de destinatarios escrito a mano en cada punto de cambio por una lista genérica de " +
              "observadores (suscribir/desuscribir + un solo recorrido que invoca a cada uno) hace que agregar un " +
              "interesado no obligue a tocar a quien cambia el estado.",
            source: "https://refactoring.guru/design-patterns/observer",
          },
        },
      });
    }

    return findings;
  },
};
