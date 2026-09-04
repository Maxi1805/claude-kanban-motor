/**
 * `manual-notification` — Ola 10, CONTRATO-F10.md, tarea Observer: promueve a
 * detector propio la forma AUSENTE del encargo — la única de las tres de
 * Observer que NO tenía dueño (`hypotheses/registry.ts` documenta a Observer
 * como "16/17, ausente" desde F6, sin detector-ancla real). Mismo reparto de
 * trabajo que `detect/intra-file/lazy-init-repetida.ts` (Proxy, esta misma
 * ola): el detector confirma la FORMA cruda, `hypotheses/observer.ts` decide
 * el `PatternState`.
 *
 * RELACIÓN (sin jerga de AST): un mismo objeto (`X`), tras cambiar su propio
 * estado, notifica a un grupo de colaboradores LLAMÁNDOLOS UNO POR UNO, por
 * nombre de campo — `this.emailObserver.onChange(evt); this.smsObserver.onChange(evt);`
 * — en vez de mantener una lista genérica y recorrerla. Si esa misma forma se
 * repite en OTRO miembro de `X` (otro evento, mismo cableado a mano), la
 * duplicación es la evidencia de que falta la abstracción — es Observer
 * implementado sin el objeto Observer.
 *
 * ESTRUCTURAL, NO LÉXICO — cero lista de nombres de campo/clase/método:
 *   1. Un nodo "de llamada" (`CALL_NODE_TYPE`, mismo criterio genérico que
 *      `lazy-init-repetida.ts` — cualquier tipo de nodo que contenga "call",
 *      confirmado por sonda contra Go/Ruby) cuyo callee es un acceso a
 *      miembro (`CALLEE_NAME_FIELDS`, igual que `graph/references.ts`) cuyo
 *      OBJETO es a su vez un acceso a campo propio (`isSelfFieldAccess`,
 *      duplicado de `lazy-init-repetida.ts`/`hypotheses/proxy.ts` — `this.F`/
 *      `self.F`/`@F`/receptor de Go) — es decir, `this.F.metodo(...)`, NUNCA
 *      `this.metodo(...)` (un solo nivel no tiene "campo destinatario").
 *   2. Agrupadas por (nombre del método llamado, cantidad de argumentos) —
 *      la MISMA (name, arity) que exige el encargo, leída de la LLAMADA, no
 *      de una declaración (no hay grafo en este detector — ver más abajo).
 *   3. Si un grupo reúne llamadas hacia >=2 campos `F` DISTINTOS dentro del
 *      MISMO miembro ⇒ ese miembro "notifica a mano".
 *   4. Si >=2 miembros DISTINTOS de la misma clase notifican a mano (cada uno
 *      con su propio grupo calificante, no necesariamente el mismo evento) ⇒
 *      se dispara el hallazgo sobre esa clase — la repetición ES la señal.
 *
 * SIMPLIFICACIÓN DECLARADA (requisito 3 del encargo, "si no podés, decilo"):
 * el encargo pide "tras mutar el mismo estado". Sin resolución de tipos ni
 * dataflow, este detector no puede confirmar que la notificación depende
 * CAUSALMENTE de esa mutación — sólo que el miembro mutó ALGÚN campo propio
 * en algún punto de su cuerpo (misma técnica que `isAssignmentLike`/
 * `isSelfFieldAccess` de `lazy-init-repetida.ts` aplicada al LHS). Es un
 * requisito MÁS DÉBIL que el literal del encargo, declarado así a propósito:
 * exigir la causalidad real inventaría precisión que ningún hecho de AST hoy
 * sostiene.
 *
 * ARREGLO MEDIDO (ola de precisión sobre el corpus de 8 lenguajes): antes de
 * este cambio, el ÚNICO hallazgo de este kind en los 8 repos —
 * `cobra/command.go#LocalFlags` (Go) — era FALSO. `LocalFlags` llama
 * `c.lflags.Lookup(name)` y `c.parentsPflags.Lookup(name)`, mismo (método,
 * aridad) sobre dos campos distintos, pero como los DOS operandos de una
 * misma condición (`if c.lflags.Lookup(name) == nil && name !=
 * c.parentsPflags.Lookup(name) { ... }`) — dos chequeos de existencia
 * independientes combinados con `&&`, no dos SENTENCIAS que notifican el
 * mismo evento en secuencia (la forma canónica del olor, `this.a.f(e);
 * this.b.f(e);`, es siempre sentencia-tras-sentencia). `findCallDescendants`
 * ahora excluye toda llamada de campo-método encontrada dentro de un operando
 * de `&&`/`||`/`and`/`or` (mismo vocabulario cerrado que
 * `boolean-complexity.ts#LOGICAL_OPERATOR_TOKEN`) — ver el test "COMBINADAS
 * por `&&`" que reproduce el caso exacto de cobra.
 *
 * SEGUNDA CAUSA MEDIDA (Ola P, frente P7) — 0 % de precisión con n=5 en dos
 * olas seguidas (`tests/golden/precision/*.verdicts.csv`, kind
 * `manual-notification`), CUATRO de los cinco jueces con la MISMA nota
 * literal ("Par fijo, no lista de suscriptores... RAIZ: el criterio '>=2
 * campos propios distintos reciben el mismo metodo' no distingue un par fijo
 * de una lista abierta"): `ClientRedis.connect`/`ClientKafka.connect` (nest)
 * llaman `.connect()` SIN ARGUMENTOS sobre `pubClient`/`subClient` que la
 * MISMA línea acaba de construir (`this.pubClient = this.createClient()`);
 * `IntSets.setDefaultsIfNotSet` (hugo) llama `.Set(cfg.ConfiguredLanguages
 * .IndexDefault())`/`.Set(cfg.ConfiguredVersions.IndexDefault())` — un
 * argumento DISTINTO por campo, cada uno recién creado en la línea anterior;
 * `InstanceState.__setstate__` (sqlalchemy) llama `.update(state_dict["info"])`
 * y `.update([...])` — de nuevo, un argumento propio y distinto por campo.
 * Los CUATRO son "delegar en un sub-recurso propio con SU DATO particular",
 * no "distribuir la MISMA noticia a colaboradores" — que es, literalmente,
 * el ejemplo canónico del propio módulo: `this.emailObserver.onChange(evt);
 * this.smsObserver.onChange(evt);` pasa el MISMO `evt` a los dos.
 *
 * ARREGLO: un grupo sólo cuenta como "notifica a mano" si, además de repetir
 * (nombre, aridad) sobre >=2 campos distintos, TODAS las llamadas del grupo
 * (a) llevan al menos un argumento (`argCount >= 1` — una llamada sin
 * argumentos no puede transmitir "qué cambió", así que no hay nada que
 * "notificar") y (b) pasan el MISMO argumento, comparado por texto
 * normalizado (`argsTextOf` más abajo) — la propia forma canónica del
 * módulo asume que el "evento" es uno solo, repartido sin cambios entre
 * colaboradores. `fanoutGroupIn` exige ahora las dos cosas. Las 5 fixtures
 * canónicas del test (TS/Python/Ruby/Go) ya pasaban `event`/`evt` sin tocar
 * a los dos colaboradores — el arreglo no las toca; sólo cierra el agujero
 * que dejaba pasar delegación normal con datos propios por colaborador.
 *
 * NO USA GRAFO: a diferencia de `scattered-instantiation.ts`, la forma que
 * este detector busca (llamadas por NOMBRE DE CAMPO dentro de un miembro) no
 * necesita resolución cruzada de símbolos — el mismo argumento que
 * `lazy-init-repetida.ts` ya documenta para elegir `intra-file` en vez de
 * `inter-file`: `ctx.file` llega VIVO a `hypotheses/observer.ts` en
 * producción (la única llamada de `attachHypotheses` que ve árbol, ver
 * `hypotheses/run.ts`), mientras que un ancla `inter-file` vería siempre
 * `ctx.file === null`.
 *
 * DUPLICACIÓN DECLARADA: `namedChildren`/`findAllDescendants`/`objectOf`/
 * `isSelfFieldAccess`/`fieldKeyOf`/`isAssignmentLike`/`unwrapSingleChild`/
 * `goReceiverOf`/`CALL_NODE_TYPE` son copia deliberada del mismo subconjunto
 * de `lazy-init-repetida.ts` (que a su vez las duplica de `hypotheses/
 * proxy.ts`) — mismo argumento ya documentado ahí: capas invertidas
 * (`detect/*` no importa de `hypotheses/*`, y dos detectores hermanos no se
 * importan entre sí para no crear un acoplamiento nuevo por una decena de
 * líneas).
 *
 * QUÉ NO HACE: no decide si la notificación a mano es realmente Observer
 * ausente, parcial, ya aplicado o eludido — eso es `hypotheses/observer.ts`,
 * que puede ver el árbol completo de la clase y, cuando hay grafo, las
 * aristas `carries`/`invokes-indirect`. Este detector sólo confirma que la
 * forma cruda existe y vale la pena mirar con más cuidado.
 */
import { presencia } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

function classScopedAnchor(file: string, className: string, methodName: string) {
  return { file, symbolPath: [className, methodName] };
}

type ThresholdKey = "distinctNotifiers";

const SELF_WORDS = new Set(["this", "self"]);
const RUBY_IVAR_TYPE = "instance_variable";
/** Mismo criterio que `graph/references.ts#RECEIVER_FIELDS` — "receiver" es el campo que usa Ruby (`@x.metodo`), sin el cual ninguna llamada con receptor de esa gramática se reconoce. */
const OBJECT_FIELDS = ["object", "operand", "receiver"];
/** Mismo criterio que `graph/references.ts#CALLEE_NAME_FIELDS` — duplicado localmente (ver docstring del módulo). */
const CALLEE_NAME_FIELDS = ["function", "method", "name"];
/** Mismo criterio genérico que `lazy-init-repetida.ts#CALL_NODE_TYPE`: cualquier tipo de nodo cuyo nombre contenga "call". */
const CALL_NODE_TYPE = /call/i;
/** Mismo vocabulario CERRADO que `boolean-complexity.ts#LOGICAL_OPERATOR_TOKEN`, duplicado a propósito acá (misma razón ya documentada en el módulo: capas invertidas). */
const LOGICAL_OPERATOR_TOKEN = /^(&&|\|\||and|or)$/;

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

/** Mismo criterio estructural que `boolean-complexity.ts#isLogicalBinary`: un nodo binario cuyo campo `operator` es `&&`/`||`/`and`/`or`. */
function isLogicalBinary(node: AstNode): boolean {
  const operator = node.childForFieldName("operator") as AstNode | null;
  return operator !== null && LOGICAL_OPERATOR_TOKEN.test(operator.text);
}

/**
 * Igual que `findAllDescendants`, pero además arrastra si el nodo actual
 * está DENTRO de una expresión lógica (`&&`/`||`/`and`/`or`) — hallazgo de
 * esta ola (ver `cobra/command.go#LocalFlags`, corpus): dos llamadas de
 * campo-método con el mismo (nombre, aridad) sobre campos DISTINTOS pueden
 * ser dos OPERANDOS de una misma condición booleana (`f.lflags.Lookup(n) ==
 * nil && f != c.parentsPflags.Lookup(n)`, dos chequeos de existencia
 * independientes combinados con `&&`) en vez de dos SENTENCIAS secuenciales
 * que notifican el mismo evento — la forma canónica del olor
 * (`this.emailObserver.onChange(e); this.smsObserver.onChange(e);`) es
 * siempre sentencia-tras-sentencia, nunca sub-expresión de un `&&`/`||`. Una
 * vez que el descenso entra a un operando de una expresión lógica, TODO lo
 * que hay debajo es predicado, no notificación — por eso el flag se
 * propaga con OR y nunca se apaga dentro del mismo subárbol.
 */
function findCallDescendants(node: AstNode, insideLogical: boolean, maxDepth: number, out: { node: AstNode; insideLogical: boolean }[]): void {
  if (CALL_NODE_TYPE.test(node.type)) out.push({ node, insideLogical });
  if (maxDepth <= 0) return;
  const nextInsideLogical = insideLogical || isLogicalBinary(node);
  for (const c of namedChildren(node)) findCallDescendants(c, nextInsideLogical, maxDepth - 1, out);
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

/**
 * El receptor y el nombre de método de una llamada `X.metodo(...)`, en
 * cualquiera de las DOS formas de gramática que coexisten en el corpus —
 * pura estructura de campos, ninguna rama por nombre de lenguaje. Duplicado
 * deliberado de `hypotheses/observer.ts#callTargetOf` (ver docstring del
 * módulo, "DUPLICACIÓN DECLARADA"): ahí está el razonamiento completo con la
 * sonda de las 4 gramáticas.
 *   (a) el nodo de llamada MISMO expone el receptor como campo directo
 *       (`OBJECT_FIELDS`) y el callee (`CALLEE_NAME_FIELDS`) es una hoja sin
 *       hijos — la forma de Ruby (`call` con `receiver`+`method` hermanos);
 *   (b) el callee es a su vez un nodo de miembro con su propio campo de
 *       objeto (`member_expression`/`attribute`/`selector_expression`) — la
 *       forma de JS/Python/Go.
 * Sin esto, `collectFieldMethodCalls` nunca reconocía `@email_observer.
 * on_change(event)` en Ruby: el callee (`method`) es una hoja y
 * `objectOf(callee)`/`memberNameOf(callee)` buscan hijos que esa hoja nunca
 * tiene.
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

/** Único vehículo de Go para "campo propio"/"clase dueña" — igual que `lazy-init-repetida.ts`. */
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

function argumentsNodeOf(call: AstNode): AstNode | null {
  return (call.childForFieldName("arguments") as AstNode | null) ?? (call.childForFieldName("argument_list") as AstNode | null);
}

function countArguments(call: AstNode): number {
  const args = argumentsNodeOf(call);
  return args ? namedChildren(args).length : 0;
}

/** Texto normalizado (espacios colapsados) de los argumentos de `call`, en orden,
 *  separados por `|` — sirve para comparar si dos llamadas del grupo reciben EL
 *  MISMO argumento (ver "SEGUNDA CAUSA MEDIDA" en el docstring del módulo). `""`
 *  para una llamada sin argumentos. */
function argsTextOf(call: AstNode): string {
  const args = argumentsNodeOf(call);
  if (!args) return "";
  return namedChildren(args)
    .map((a) => a.text.replace(/\s+/g, " ").trim())
    .join("|");
}

interface FanoutCall {
  readonly targetField: string;
  readonly methodName: string;
  readonly argCount: number;
  readonly argsText: string;
}

/**
 * Todas las llamadas `this.F.metodo(...)` (2 niveles: campo propio, luego
 * método) dentro de `body`, EXCLUYENDO las que ocurren dentro de una
 * expresión lógica (`&&`/`||`/`and`/`or`) — ver el docstring de
 * `findCallDescendants`: ahí es un chequeo de existencia combinado, no una
 * notificación secuencial.
 */
function collectFieldMethodCalls(body: AstNode, selfNames: ReadonlySet<string>): FanoutCall[] {
  const out: FanoutCall[] = [];
  const calls: { node: AstNode; insideLogical: boolean }[] = [];
  findCallDescendants(body, false, 14, calls);
  for (const { node: call, insideLogical } of calls) {
    if (insideLogical) continue;
    const target = callTargetOf(call);
    if (!target || !isSelfFieldAccess(target.object, selfNames)) continue;
    out.push({
      targetField: fieldKeyOf(target.object),
      methodName: target.methodName,
      argCount: countArguments(call),
      argsText: argsTextOf(call),
    });
  }
  return out;
}

/** SIMPLIFICACIÓN DECLARADA: ver el docstring del módulo — mutación de ALGÚN
 *  campo propio en el cuerpo, no necesariamente ligada causalmente a la
 *  notificación encontrada. */
function mutatesOwnState(body: AstNode, selfNames: ReadonlySet<string>): boolean {
  const assigns: AstNode[] = [];
  findAllDescendants(body, isAssignmentLike, 10, assigns);
  return assigns.some((a) => {
    const left = unwrapSingleChild((a.childForFieldName("left") as AstNode | null) ?? a);
    return isSelfFieldAccess(left, selfNames);
  });
}

/** `true` si `body` "notifica a mano": alguna llamada de campo-método se
 *  repite (misma (nombre, aridad)) hacia >=2 campos DISTINTOS, TODAS con
 *  argumentos y TODAS con el MISMO argumento — ver "SEGUNDA CAUSA MEDIDA" en
 *  el docstring del módulo: sin esas dos condiciones, "mismo método sobre
 *  campos distintos" también matchea delegación normal a sub-recursos
 *  propios, cada uno con su propio dato (falso medido, 4 de 5 en dos olas).
 *  Devuelve la evidencia (grupo ganador) para el `RawFinding`. */
function fanoutGroupIn(body: AstNode, selfNames: ReadonlySet<string>): { readonly methodName: string; readonly argCount: number; readonly fields: readonly string[] } | null {
  const calls = collectFieldMethodCalls(body, selfNames);
  const byGroup = new Map<string, { fields: Set<string>; argsTexts: Set<string> }>();
  for (const c of calls) {
    if (c.argCount === 0) continue; // sin argumento no hay "qué cambió" que notificar — ver docstring.
    const key = `${c.methodName}#${c.argCount}`;
    const entry = byGroup.get(key) ?? { fields: new Set<string>(), argsTexts: new Set<string>() };
    entry.fields.add(c.targetField);
    entry.argsTexts.add(c.argsText);
    byGroup.set(key, entry);
  }
  let best: { methodName: string; argCount: number; fields: string[] } | null = null;
  for (const [key, { fields, argsTexts }] of byGroup) {
    if (fields.size < 2) continue;
    if (argsTexts.size !== 1) continue; // colaboradores reciben datos DISTINTOS: delegación, no la misma noticia.
    if (!best || fields.size > best.fields.length) {
      const [methodName, argCountStr] = key.split("#");
      best = { methodName: methodName!, argCount: Number(argCountStr), fields: [...fields].sort() };
    }
  }
  return best;
}

interface Notifier {
  readonly methodName: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly calledMethod: string;
  readonly argCount: number;
  readonly fields: readonly string[];
}

/**
 * OLA Z (Z5) — SIN POBLACIÓN, MEDIDO Y PROBADO A MANO, NO CABLEADO: sobre
 * los 13 repos del corpus, 77.544 nodos función visitados → 3.805 con al
 * menos una llamada `this.F.metodo(...)` → sólo **9** grupos reales pasan
 * las DOS compuertas ya endurecidas por olas anteriores (mismo (nombre,
 * aridad) sobre ≥2 campos distintos, TODOS con el MISMO argumento) — y de
 * esos 9, **0 caen en la misma clase que un segundo notificador**
 * (`distinctNotifiers` nunca pasa de 1). Leídos los 9 a mano (más 3 más en
 * `corpus-app/gitea`, Go, población distinta): NINGUNO es Observer
 * implementado a mano. Tres formas se repiten, ninguna la del módulo:
 * (1) reconstrucción funcional de un valor a partir de sus partes
 * (`pageTrees.Shape`: `t.campo = t.campo.Shape(v)` por cada campo, hugo);
 * (2) inicialización de sub-recursos recién creados
 * (`Command.ResetFlags`: dos `flag.NewFlagSet` seguidos de
 * `.SetOutput(mismoBuffer)`, cobra); (3) un PAR FIJO de colaboradores de rol
 * distinto, uno de los cuales YA es un mecanismo de notificación real
 * (`Connection.execution_options`: `self.dispatch.set_...()` +
 * `self.dialect.set_...()`, sqlalchemy — `dispatch` es el propio sistema de
 * eventos de la librería). Es la MISMA familia que P7 ya nombró
 * ("par fijo, no lista de suscriptores") para una muestra más chica; con
 * n=9+3 la conclusión no cambia. Ver el informe de la tarea para las 12
 * lecturas completas.
 */
export const detector: IntraFileDetector<ThresholdKey, "manual-notification"> = {
  id: "manual-notification",
  kind: "manual-notification",
  scope: "intra-file",
  title: "Notificación manual duplicada (Observer sin abstracción)",
  needs: [],
  thresholds: {
    // R3 (auditoría de umbrales inventados): binario por definición del
    // hallazgo ("¿MÁS de un miembro repite el mismo cableado a mano?"), no
    // un piso elegido a mano. Antes `pisoDeclarado(2, …)`.
    distinctNotifiers: presencia({
      rationale:
        "Un único miembro que llama a >=2 colaboradores por nombre de campo puede ser, sin más, un caso de uso " +
        "genuino (dos dependencias reales, sin nada en común que abstraer). Recién con 2 o más miembros DISTINTOS " +
        "de la misma clase repitiendo el mismo cableado a mano hay evidencia de que falta una lista genérica de " +
        "observadores — la repetición, no un único sitio, es la señal.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("distinctNotifiers");
    const findings: RawFinding[] = [];

    // className -> notificadores encontrados.
    const byClass = new Map<string, { className: string; notifiers: Notifier[] }>();

    const visit = (node: AstNode, cls: { name: string; key: string } | null): void => {
      let nextCls = cls;
      if (file.sets.classNodes.has(node.type)) {
        const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
        nextCls = { name, key: `${name}@${node.startPosition.row}` };
      } else if (file.sets.functionNodes.has(node.type)) {
        const goReceiver = goReceiverOf(node);
        const selfNames = new Set(SELF_WORDS);
        let methodCls = nextCls;
        if (goReceiver) {
          selfNames.add(goReceiver.paramName);
          methodCls = { name: goReceiver.typeName, key: `receiver:${goReceiver.typeName}` };
        }
        const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
        const methodName = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
        if (body && methodCls && mutatesOwnState(body, selfNames)) {
          const group = fanoutGroupIn(body, selfNames);
          if (group) {
            const entry = byClass.get(methodCls.key) ?? { className: methodCls.name, notifiers: [] };
            entry.notifiers.push({
              methodName,
              startLine: node.startPosition.row + 1,
              endLine: node.endPosition.row + 1,
              calledMethod: group.methodName,
              argCount: group.argCount,
              fields: group.fields,
            });
            byClass.set(methodCls.key, entry);
          }
        }
      }
      for (const c of namedChildren(node)) visit(c, nextCls);
    };
    visit(file.root, null);

    for (const { className, notifiers } of byClass.values()) {
      // Un notificador por MIEMBRO distinto — el mismo miembro nunca se cuenta dos veces.
      const distinct = new Map<string, Notifier>();
      for (const n of notifiers) if (!distinct.has(n.methodName)) distinct.set(n.methodName, n);
      // `threshold.value` es 1 (`presencia()`, R3): `> 1` es exactamente `>= 2`.
      if (distinct.size <= threshold.value) continue;

      const sites = [...distinct.values()].sort((a, b) => a.startLine - b.startLine);
      const locations: RoleLocation[] = sites.map((s, i) => ({
        file: file.path,
        startLine: s.startLine,
        endLine: s.endLine,
        symbol: s.methodName,
        anchor: classScopedAnchor(file.path, className, s.methodName),
        role: `notificador ${i + 1} de ${sites.length}: llama \`${s.calledMethod}\` (${s.argCount} args) sobre [${s.fields.join(", ")}]`,
      }));

      findings.push({
        title: `\`${className}\` notifica a sus colaboradores a mano en ${sites.length} miembros distintos`,
        detail:
          `En ${sites.length} miembros distintos de \`${className}\`, tras cambiar su propio estado, se llama al ` +
          "mismo método por nombre sobre >=2 campos propios distintos — la misma notificación cableada a mano, " +
          "repetida. Mantener una lista genérica de colaboradores y recorrerla evita repetir el mismo cableado " +
          "cada vez que aparece un evento nuevo que notificar.",
        trigger: [{ label: "miembros distintos que notifican a mano", value: sites.length, threshold }],
        evidence: [{ label: "llamadas de campo-método analizadas", value: notifiers.length }],
        locations: locations as unknown as readonly [RoleLocation, ...RoleLocation[]],
        severity: Math.min(100, 30 + sites.length * 15),
        advice: {
          primary: {
            name: "Replace hard-wired notifications with Observer",
            kind: "refactorizacion",
            why:
              "Sustituir las llamadas por nombre de campo por una lista genérica de observadores (suscribir/" +
              "desuscribir + recorrer-e-invocar) evita repetir el mismo cableado a mano cada vez que se agrega " +
              "un evento nuevo.",
            source: "https://refactoring.guru/design-patterns/observer",
          },
        },
      });
    }

    return findings;
  },
};
