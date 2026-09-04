/**
 * OLA AE — FRENTE AE5. EL ANCLA-FUERZA DE CHAIN OF RESPONSIBILITY.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE — el número, primero
 * ═══════════════════════════════════════════════════════════════════════════
 * Chain of Responsibility tenía hoy TRES anclas —`many-returns`, `complexity`,
 * `boolean-complexity`— y las tres son SÍNTOMAS de forma de una función
 * (las comparte `decorator.ts`; ninguna nombra una situación de diseño).
 * Medido sobre los volcados oficiales del 16/08 en las DOS poblaciones
 * (13 bibliotecas + 8 aplicaciones): **27 hipótesis, `ausente` = 0**
 * (18 `parcial`, 9 `ya-aplicado`), sobre 6.148 hallazgos crudos de las tres
 * anclas. La causa es ESTRUCTURAL y está en
 * `hypotheses/chain-of-responsibility.ts:898`: el único camino que puede
 * terminar en `ausente` (la corrida de guardas) exige, desde la Ola V, que al
 * menos una rama llame a través de un SUCESOR GUARDADO EN UN CAMPO PROPIO
 * (`successorFieldReceiver`) — o sea, para decir "acá FALTA una cadena" hay
 * que encontrar antes media cadena ya escrita. Es la misma patología que el
 * proyecto ya midió en `Facade` (0 `ausente` de 288) y en
 * `Decorator · homonymous-delegation` (0 de 111), y se arregla igual: SUMANDO
 * el camino que falta, sin tocar el que existe.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA FUERZA QUE ESTE DETECTOR NOMBRA (no un síntoma correlacionado)
 * ═══════════════════════════════════════════════════════════════════════════
 * GoF: *"avoid coupling the sender of a request to its receiver by giving more
 * than one object a chance to handle the request"*. Escrita como situación:
 *
 *   *Hay VARIOS destinos posibles para UNA MISMA solicitud, y quién la atiende
 *   lo decide UN SITIO con una escalera de condiciones que los conoce a TODOS
 *   — así que agregar un destino obliga a tocar ese sitio, y ese sitio es el
 *   único que sabe que los demás existen.*
 *
 * ESTE DETECTOR NO AFIRMA QUE FALTE UN PATRÓN. Reporta la SITUACIÓN cruda (una
 * escalera excluyente que reparte la misma solicitud entre N destinos que sólo
 * este sitio enumera). Si la cadena ya está, si está a medias o si no está, lo
 * decide la hipótesis, no este archivo — misma división que
 * `homonymous-divergent-sequence.ts` declara para Template Method.
 *
 * LAS SEIS CONDICIONES, CADA UNA CON LA INTENCIÓN QUE VERIFICA:
 *
 *  (1) HAY UNA ESCALERA MUTUAMENTE EXCLUYENTE — >= `ramas` ramas de nivel
 *      superior del cuerpo, en cualquiera de las DOS formas que expresan
 *      exclusión mutua: guarda con salida temprana, o brazo de una cadena
 *      `if/else-if` (incluye `elif`/`elsif`, que llegan como el `alternative`
 *      con `condition` propio de la gramática de cada lenguaje).
 *      INTENCIÓN: *"exactamente UNO de los destinos atiende"*. Es la forma de
 *      la ELECCIÓN, no el olor de la complejidad. Cubre `if/else-if`, que el
 *      camino viejo no mira NUNCA (`topLevelGuardRun` exige que la guarda no
 *      tenga `alternative`).
 *
 *  (2) CADA RAMA DELEGA — la consecuencia de la rama contiene una llamada.
 *      INTENCIÓN: *"la rama no calcula: le pasa el trabajo a otro"*. Una rama
 *      que aborta, que devuelve un literal o que hace la cuenta ahí mismo no
 *      tiene destino que encadenar.
 *
 *  (3) LA MISMA SOLICITUD VIAJA A TODOS — existe UN parámetro `p` del emisor
 *      que aparece, como identificador DESNUDO y sin transformar, en la
 *      llamada de >= `ramas` ramas.
 *      INTENCIÓN: *"son destinos ALTERNATIVOS de UNA solicitud"*, no un
 *      pipeline (donde cada paso recibe lo que calculó el anterior) ni una
 *      cascada de fuentes (donde nadie recibe la solicitud). Son las dos
 *      causas de falso que la Ola 12 y la Ola U midieron A MANO sobre este
 *      mismo patrón. Es MÁS FUERTE que el `laSolicitudViaja` de hoy, que
 *      pregunta por rama y no exige que sea el MISMO parámetro en todas.
 *
 *  (4) LAS CONDICIONES SON INDEPENDIENTES — ningún identificador distinto de
 *      `p` aparece en TODAS las condiciones de las ramas.
 *      INTENCIÓN: *"cada rama decide por su cuenta si le toca"*. Si todas
 *      preguntan por el mismo identificador, la escalera es un despacho por un
 *      ÚNICO discriminante: la fuerza es la de Strategy/State (un mapa de
 *      valor→comportamiento), no la de CoR. Misma pregunta que
 *      `independentGuardConditions` ya hace como discriminador, subida a
 *      compuerta y hecha sobre el CONJUNTO de identificadores en vez del
 *      último.
 *
 *  (5a) RESOLUCIÓN VERIFICADA — LA CADENA NO ESTÁ YA ARMADA: ningún destino
 *      resuelto llama (arista `calls`) a otro destino resuelto.
 *      INTENCIÓN: *"si el pase de la responsabilidad ya estuviera escrito, lo
 *      que falta no es la cadena"*. Un destino que llama a otro destino ES un
 *      eslabón.
 *
 *  (5b) RESOLUCIÓN VERIFICADA — NADIE MÁS LOS ENUMERA: ningún otro símbolo del
 *      repo llama a >= 2 de los destinos resueltos.
 *      INTENCIÓN: *"agregar un destino obliga a tocar ESTE sitio"*, que es
 *      literalmente la consecuencia que el patrón elimina. Si otro sitio ya
 *      conoce a >= 2, o la enumeración ya está factorizada en otro lado (una
 *      tabla, un registro — la mitigación ya puesta), o los destinos son
 *      utilidades generales y no una familia de manejadores.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS DOS PISOS DE ESCALA, ESCRITOS ANTES DE MEDIR (ver `thresholds`)
 * ═══════════════════════════════════════════════════════════════════════════
 * `ramas = 4` y `destinos = 4`. Las razones completas están en el `rationale`
 * de cada uno, que es donde el proyecto las audita.
 *
 * BRECHA DECLARADA, NO ESCONDIDA — EL ORDEN. El patrón prueba los manejadores
 * EN UN ORDEN; este detector verifica que hay N destinos alternativos para una
 * misma solicitud, no que el orden importe. El dato no está: las aristas
 * `calls` no llevan posición (medido por AC3 §3.1 y AD4 §2.2) y el orden
 * textual de las ramas no dice si es semánticamente relevante.
 *
 * SIN GRAFO no emite nada, y es deliberado: (5a) y (5b) son afirmaciones SOBRE
 * los destinos, y un destino que no puedo mirar no puede sostener un "nadie más
 * lo enumera". `needsGraph` en un detector `intra-*` es RUTEO, no compuerta
 * (ver `types.ts#IntraGraphOptIn`), así que el detector igual corre en una
 * corrida sin grafo — y devuelve `[]`, que es la respuesta honesta.
 */
import { symbolNodeId, type CodeGraphNode, type GraphIndex } from "../../graph/types.js";
import { pisoDeclarado } from "../thresholds.js";
import type { AstNode, FileUnit, FunctionUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Vocabulario de GRAMÁTICA — duplicado a propósito respecto de
 * `hypotheses/chain-of-responsibility.ts` (mismo criterio que ese archivo
 * documenta para `RETURN_WORD`: cada consumidor arma el suyo, sin fábrica
 * compartida). Ni una palabra de dominio.
 * ──────────────────────────────────────────────────────────────────────── */

/** Tipos de nodo de LLAMADA en las gramáticas del corpus — misma lista que
 *  `chain-of-responsibility.ts#CALL_NODE_TYPES`. */
const CALL_NODE_TYPES = new Set(["call", "call_expression", "method_invocation", "invocation_expression"]);

/** Salida temprana — misma expresión que `chain-of-responsibility.ts#EARLY_EXIT_TYPE`. */
const EARLY_EXIT_TYPE = /^(return|throw|break|continue|next|raise)(_statement)?$/;

/** PALABRAS CLAVE Y LITERALES DE LA GRAMÁTICA que aparecen dentro del texto de
 *  una condición y que NO son el sujeto de la pregunta: sin restarlas, cuatro
 *  condiciones `a.nil?`/`b.nil?`/`c.nil?`/`d.nil?` compartirían el
 *  identificador `nil` y la condición (4) las rechazaría por "mismo
 *  discriminante", que es exactamente lo contrario de lo que pasa. Mismo
 *  estatus que `SELF_WORDS`/`EARLY_EXIT_TYPE` de `chain-of-responsibility.ts`:
 *  vocabulario de LENGUAJE, explícitamente permitido, nunca de dominio. */
const GRAMMAR_WORDS = new Set([
  "null",
  "nil",
  "None",
  "undefined",
  "true",
  "false",
  "True",
  "False",
  "is",
  "not",
  "and",
  "or",
  "in",
  "new",
  "typeof",
  "instanceof",
  "isinstance",
  "self",
  "this",
  "let",
  "var",
  "const",
]);

/** Un identificador de la gramática, para leer el texto de una condición. */
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;
/** Literales de texto, que se borran ANTES de leer identificadores: sin esto
 *  `x == "a"` aporta el identificador `a`, que no existe en el código. */
const STRING_LITERAL = /"[^"]*"|'[^']*'|`[^`]*`/g;

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function collectDescendants(node: AstNode, pred: (n: AstNode) => boolean, maxDepth: number): AstNode[] {
  const out: AstNode[] = [];
  const visit = (n: AstNode, depth: number): void => {
    if (pred(n)) out.push(n);
    if (depth <= 0) return;
    for (const c of namedChildren(n)) visit(c, depth - 1);
  };
  visit(node, maxDepth);
  return out;
}

function fnBody(fn: FunctionUnit): AstNode | null {
  return (fn.node.childForFieldName("body") as AstNode | null) ?? (fn.node.childForFieldName("consequence") as AstNode | null);
}

function consequenceOf(node: AstNode): AstNode | null {
  return (node.childForFieldName("consequence") as AstNode | null) ?? (node.childForFieldName("body") as AstNode | null);
}

function conditionOf(node: AstNode): AstNode | null {
  return node.childForFieldName("condition") as AstNode | null;
}

/**
 * ¿La consecuencia de la guarda TERMINA en una salida temprana?
 *
 * CORREGIDO MIDIENDO, no en el escritorio (ver §"qué rompí" del informe AE5).
 * La primera versión preguntaba si el cuerpo CONTENÍA una salida temprana en
 * cualquier lugar, y eso NO es exclusión mutua: `gitea/models/activities/
 * repo_activity.go:48 GetActivityStats` tiene cuatro `if <bandera> { … if err
 * != nil { return … } }` que **corren TODOS** cuando sus banderas están
 * encendidas — es un acumulador de pasos OPCIONALES, la fuerza de otro patrón,
 * no una elección entre destinos. Lo que hace que la rama siguiente sólo corra
 * si la anterior NO disparó es que la anterior SALGA: la salida tiene que ser
 * el ÚLTIMO statement, no uno cualquiera adentro.
 *
 * Se desenvuelven los bloques (un `{ … }`/`:` es el mismo statement) hasta 3
 * niveles: alcanza para las seis gramáticas y no adivina flujo real.
 */
function endsWithEarlyExit(node: AstNode, depth = 3): boolean {
  if (EARLY_EXIT_TYPE.test(node.type)) return true;
  // Un statement CONDICIONAL nunca es una salida incondicional: puede no
  // correr. Sin esta línea, `if (x) { if (falla) { return } }` se leía como
  // "la rama sale" — el caso exacto de `GetActivityStats` que rompió la
  // primera versión.
  if (conditionOf(node)) return false;
  if (depth <= 0) return false;
  const last = namedChildren(node).at(-1);
  return last ? endsWithEarlyExit(last, depth - 1) : false;
}

/**
 * LA ESCALERA (condición 1). Las ramas de nivel superior del cuerpo que son
 * MUTUAMENTE EXCLUYENTES, en las dos formas que existen:
 *
 *   (a) GUARDA CON SALIDA TEMPRANA — `if (c) { return f(x); }` seguida de otra:
 *       la segunda sólo corre si la primera no disparó. Exclusión mutua por
 *       flujo.
 *   (b) BRAZO DE UNA CADENA `if/else-if` — exclusión mutua por sintaxis. Se
 *       sigue el campo `alternative` mientras el nodo alcanzado tenga
 *       `condition` propio, que es como las seis gramáticas del corpus
 *       representan `else if`/`elif`/`elsif`. El `else` final NO es una rama:
 *       no lo elige ninguna condición.
 *
 * La forma (b) es la que el camino viejo de este patrón no puede ver nunca
 * (`chain-of-responsibility.ts#topLevelGuardRun` descarta toda guarda que tenga
 * `alternative`), y es la forma clásica de "el emisor los conoce a todos".
 */
export interface LadderBranch {
  readonly conditionText: string;
  readonly consequence: AstNode;
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * LAS ESCALERAS CANDIDATAS de un emisor. Devuelve una lista de listas, nunca
 * una lista sola, y ésa es la SEGUNDA corrección medida (ver §"qué rompí" del
 * informe AE5): la primera versión juntaba en una sola escalera TODAS las ramas
 * de nivel superior, y dos bloques `if/else` INDEPENDIENTES uno detrás del otro
 * no son mutuamente excluyentes entre sí — el caso real que lo rompió es
 * `sqlalchemy/lib/sqlalchemy/orm/session.py:2182 _execute_internal`, un
 * procedimiento de 200 líneas con cuatro `if/else` sueltos que se leyeron como
 * una elección de cuatro destinos. Una escalera es UNA de estas dos cosas, y
 * NUNCA una mezcla:
 *
 *   (A) LA CORRIDA DE GUARDAS QUE SALEN — los `if` de nivel superior sin
 *       `alternative` cuya consecuencia TERMINA en una salida temprana. Cada
 *       una excluye a las siguientes POR FLUJO: si disparó, ya salió.
 *   (B) LOS BRAZOS DE UNA SOLA CADENA `if/else-if` — exclusión mutua por
 *       SINTAXIS. Se sigue el campo `alternative` mientras el nodo alcanzado
 *       tenga `condition` propio, que es como las seis gramáticas del corpus
 *       representan `else if`/`elif`/`elsif`. El `else` final NO es una rama:
 *       no lo elige ninguna condición.
 *
 * La forma (B) es la que el camino viejo de este patrón no puede ver nunca
 * (`chain-of-responsibility.ts#topLevelGuardRun` descarta toda guarda que tenga
 * `alternative`), y es la forma clásica de "el emisor los conoce a todos".
 */
/**
 * OLA AO · FRENTE AO1 — `export` AGREGADO, y sólo eso: ni una línea del cuerpo
 * cambia. Es para que el embudo de este detector se pueda MEDIR desde un script
 * (`scripts/ao1-sonda-cor.mts`) sin re-implementar la regla, que es lo que el
 * docstring de `LadderRejection` ya pedía —"para que el embudo se pueda MEDIR
 * sin re-implementar la regla en un script aparte, que es como se miden dos
 * cosas distintas sin saberlo"—. **Delta de NIVEL 1: cero, por construcción.**
 */
export function ladderCandidatesOf(fn: FunctionUnit): readonly (readonly LadderBranch[])[] {
  const body = fnBody(fn);
  if (!body) return [];
  const branchOf = (node: AstNode): LadderBranch | null => {
    const condition = conditionOf(node);
    const consequence = consequenceOf(node);
    if (!condition || !consequence) return null;
    return { conditionText: condition.text, consequence, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 };
  };

  const guardRun: LadderBranch[] = [];
  const chains: LadderBranch[][] = [];
  for (const stmt of namedChildren(body)) {
    if (!conditionOf(stmt)) continue;
    const alternative = stmt.childForFieldName("alternative") as AstNode | null;
    if (!alternative) {
      const consequence = consequenceOf(stmt);
      const branch = consequence && endsWithEarlyExit(consequence) ? branchOf(stmt) : null;
      if (branch) guardRun.push(branch);
      continue;
    }
    const chain: LadderBranch[] = [];
    const first = branchOf(stmt);
    if (first) chain.push(first);
    let alt: AstNode | null = alternative;
    let vueltas = 0;
    while (alt && vueltas++ < 64) {
      if (conditionOf(alt)) {
        const arm = branchOf(alt);
        if (arm) chain.push(arm);
        alt = alt.childForFieldName("alternative") as AstNode | null;
        continue;
      }
      // `else` puro: puede envolver un `if` (gramáticas donde `alternative` es
      // un bloque con un único `if` adentro). Un solo nivel, nunca más.
      const inner = namedChildren(alt).find((c) => conditionOf(c) !== null);
      if (!inner) break;
      const arm = branchOf(inner);
      if (arm) chain.push(arm);
      alt = inner.childForFieldName("alternative") as AstNode | null;
    }
    if (chain.length >= 2) chains.push(chain);
  }

  const out: (readonly LadderBranch[])[] = [];
  if (guardRun.length > 0) out.push(guardRun);
  out.push(...chains);
  // la más larga primero: si dos candidatas pasan, gana la que más destinos enumera.
  return out.sort((a, b) => b.length - a.length);
}

/** Los parámetros PROPIOS del emisor — LA SOLICITUD candidata. Misma lectura
 *  que `chain-of-responsibility.ts#ownParameterNames`, incluido dejar afuera el
 *  receptor de Go (el receptor es el emisor, no la solicitud). */
function ownParameterNames(fn: FunctionUnit): readonly string[] {
  const list = fn.node.childForFieldName("parameters") as AstNode | null;
  if (!list) return [];
  const names: string[] = [];
  for (const param of namedChildren(list)) {
    if (param.type === "identifier") {
      names.push(param.text);
      continue;
    }
    const named =
      (param.childForFieldName("name") as AstNode | null) ??
      (param.childForFieldName("pattern") as AstNode | null) ??
      (param.childForFieldName("left") as AstNode | null);
    if (named) {
      names.push(named.text);
      continue;
    }
    const ident = namedChildren(param).find((c) => c.type === "identifier");
    if (ident) names.push(ident.text);
  }
  return names;
}

function callArguments(call: AstNode): readonly AstNode[] {
  const args = (call.childForFieldName("arguments") as AstNode | null) ?? (call.childForFieldName("argument_list") as AstNode | null);
  return args ? namedChildren(args) : [];
}

/** El texto del CALLEE, sin argumentos — mismo recorte que
 *  `chain-of-responsibility.ts#calleeTextOf`, y por el mismo motivo medido:
 *  sin él, un literal de texto dentro de un argumento entra en la comparación. */
function calleeTextOf(call: AstNode): string {
  const args = (call.childForFieldName("arguments") as AstNode | null) ?? (call.childForFieldName("argument_list") as AstNode | null);
  const text = args && call.text.endsWith(args.text) ? call.text.slice(0, call.text.length - args.text.length) : call.text;
  return text.trim();
}

/** EL MENSAJE de la llamada: el último identificador del callee
 *  (`this.a.handleX` ⇒ `handleX`, `handleX` ⇒ `handleX`). Es el nombre por el
 *  que el grafo indexa el símbolo destino. */
function messageOf(call: AstNode): string | null {
  const matches = calleeTextOf(call).match(IDENTIFIER);
  return matches && matches.length > 0 ? matches[matches.length - 1]! : null;
}

/** Identificadores de una condición, sin literales de texto y sin las palabras
 *  de la gramática — ver `GRAMMAR_WORDS`. */
function conditionIdentifiers(text: string): ReadonlySet<string> {
  const clean = text.replace(STRING_LITERAL, " ");
  const out = new Set<string>();
  for (const m of clean.match(IDENTIFIER) ?? []) if (!GRAMMAR_WORDS.has(m)) out.add(m);
  return out;
}

/* ────────────────────────────────────────────────────────────────────────
 * LOS HECHOS — una sola función pura, compartida por el detector y por la
 * hipótesis (`hypotheses/chain-of-responsibility.ts`), para que las dos
 * granularidades no puedan divergir. Mismo idiom que `wrapping-chain.ts`
 * comparte con `chain-of-responsibility.ts` desde la Ola 10.
 * ──────────────────────────────────────────────────────────────────────── */

export interface LadderFacts {
  /** El parámetro que viaja a todos los destinos — LA SOLICITUD. */
  readonly request: string;
  /** Una entrada por rama que delega la solicitud, en orden de archivo. */
  readonly branches: readonly {
    readonly message: string;
    readonly conditionText: string;
    readonly startLine: number;
    readonly endLine: number;
  }[];
  /** Mensajes DISTINTOS que el grafo resolvió a un símbolo del repo. */
  readonly resolved: readonly { readonly message: string; readonly targets: readonly string[] }[];
  /** Destinos (ids de símbolo) cuyo dueño comparte protocolo con el de otro
   *  destino — el dato que la hipótesis usa para `parcial` contra `ausente`. */
  readonly sharedProtocols: readonly string[];
  /** Cuántos de los destinos resueltos viven en OTRO archivo. Sólo evidencia. */
  readonly acrossFiles: number;
}

const CALLS = "calls";
const PROTOCOL_EDGES = new Set(["extends", "implements", "satisfies", "mixes-in"]);

function ownerIdOf(node: CodeGraphNode): string | null {
  return node.symbolPath.length > 1 ? symbolNodeId(node.file, node.symbolPath.slice(0, -1)) : null;
}

/**
 * LA REGLA COMPLETA, con las seis condiciones aplicadas en orden y el motivo
 * exacto por el que un candidato se cae — `reason` existe para que el embudo se
 * pueda MEDIR (cuántos descarta cada condición) sin re-implementar la regla en
 * un script aparte, que es como se miden dos cosas distintas sin saberlo.
 */
export type LadderRejection =
  | "sin-escalera"
  | "sin-solicitud-comun"
  | "pocas-ramas"
  | "condiciones-de-un-solo-discriminante"
  | "sin-grafo"
  | "pocos-destinos-resueltos"
  | "la-cadena-ya-esta-armada"
  | "otro-sitio-ya-los-enumera";

export interface LadderOutcome {
  readonly facts: LadderFacts | null;
  readonly rejection: LadderRejection | null;
  /** Cuántas ramas excluyentes tiene el emisor, haya o no delegación. */
  readonly rawBranches: number;
}

/**
 * LA REGLA sobre UNA escalera candidata. `ladderFactsFor` (abajo) la corre
 * sobre cada candidata del emisor y se queda con la primera que pasa — nunca
 * mezcla ramas de dos candidatas, que es la segunda corrección medida.
 */
function ladderOutcomeFor(
  file: FileUnit,
  fn: FunctionUnit,
  branches: readonly LadderBranch[],
  index: GraphIndex | null,
  minRamas: number,
  minDestinos: number,
): LadderOutcome {
  if (branches.length < minRamas) return { facts: null, rejection: "sin-escalera", rawBranches: branches.length };

  // (2)+(3): la MISMA solicitud viaja a todos. Se elige el parámetro que más
  // ramas comparten; con empate gana el declarado primero (orden estable).
  const params = ownParameterNames(fn);
  if (params.length === 0) return { facts: null, rejection: "sin-solicitud-comun", rawBranches: branches.length };

  let best: { request: string; hits: { message: string; conditionText: string; startLine: number; endLine: number }[] } | null = null;
  for (const p of params) {
    const hits: { message: string; conditionText: string; startLine: number; endLine: number }[] = [];
    for (const branch of branches) {
      const calls = collectDescendants(branch.consequence, (n) => CALL_NODE_TYPES.has(n.type), 4);
      const delegating = calls.find((c) => callArguments(c).some((a) => a.text.trim() === p));
      if (!delegating) continue;
      const message = messageOf(delegating);
      if (!message) continue;
      hits.push({ message, conditionText: branch.conditionText, startLine: branch.startLine, endLine: branch.endLine });
    }
    if (!best || hits.length > best.hits.length) best = { request: p, hits };
  }
  if (!best || best.hits.length < minRamas) return { facts: null, rejection: "pocas-ramas", rawBranches: branches.length };

  // (4): condiciones independientes — ningún identificador distinto de la
  // solicitud aparece en TODAS las condiciones.
  let common: Set<string> | null = null;
  for (const hit of best.hits) {
    const ids = new Set([...conditionIdentifiers(hit.conditionText)].filter((i) => i !== best!.request));
    if (common === null) common = ids;
    else for (const id of [...common]) if (!ids.has(id)) common.delete(id);
  }
  if (common && common.size > 0) return { facts: null, rejection: "condiciones-de-un-solo-discriminante", rawBranches: branches.length };

  if (!index) return { facts: null, rejection: "sin-grafo", rawBranches: branches.length };

  // Resolución de los destinos por las aristas `calls` que SALEN del emisor —
  // nunca por búsqueda de homónimos en el repo entero. Se leen CRUDAS (también
  // las `ambiguous`): la existencia de la llamada es un hecho del código y sólo
  // su destino es lo que el resolutor no supo fijar — mismo criterio que
  // `chain-of-responsibility.ts#outgoingCallCount` (Ola V) y que AD4.
  const senderId = symbolNodeId(file.path, fn.symbolPath);
  const byMessage = new Map<string, string[]>();
  for (const e of index.edgesFrom(senderId)) {
    if (e.kind !== CALLS || e.to === senderId) continue; // el emisor no es destino de sí mismo: eso es recursión.
    const target = index.nodeById(e.to);
    if (!target || target.kind !== "symbol" || target.family !== "function-like") continue;
    const name = target.symbolPath[target.symbolPath.length - 1];
    if (!name) continue;
    const list = byMessage.get(name) ?? [];
    if (!list.includes(target.id)) list.push(target.id);
    byMessage.set(name, list);
  }

  const wanted = [...new Set(best.hits.map((h) => h.message))];
  const resolved = wanted.map((message) => ({ message, targets: byMessage.get(message) ?? [] })).filter((r) => r.targets.length > 0);
  // Se cuentan los DESTINOS, no los nombres: dos mensajes que el grafo resuelve
  // al MISMO símbolo son UN destino, igual que dos ramas al mismo mensaje son un
  // manejador con dos condiciones de entrada.
  const targetIds = new Set(resolved.flatMap((r) => r.targets));
  if (resolved.length < minDestinos || targetIds.size < minDestinos) {
    return { facts: null, rejection: "pocos-destinos-resueltos", rawBranches: branches.length };
  }

  // (5a) la cadena no está ya armada.
  const targetToMessage = new Map<string, string>();
  for (const r of resolved) for (const t of r.targets) targetToMessage.set(t, r.message);
  for (const r of resolved) {
    for (const t of r.targets) {
      for (const e of index.edgesFrom(t)) {
        if (e.kind !== CALLS) continue;
        const otherMessage = targetToMessage.get(e.to);
        if (otherMessage && otherMessage !== r.message) return { facts: null, rejection: "la-cadena-ya-esta-armada", rawBranches: branches.length };
      }
    }
  }

  // (5b) nadie más los enumera. `edgesTo` es opcional en el contrato de
  // `GraphIndex`; sin él NO se puede afirmar exclusividad y no se emite.
  if (!index.edgesTo) return { facts: null, rejection: "sin-grafo", rawBranches: branches.length };
  const reachedBy = new Map<string, Set<string>>();
  for (const r of resolved) {
    for (const t of r.targets) {
      for (const e of index.edgesTo(t)) {
        if (e.kind !== CALLS || e.from === senderId) continue;
        const set = reachedBy.get(e.from) ?? new Set<string>();
        set.add(r.message);
        reachedBy.set(e.from, set);
      }
    }
  }
  for (const set of reachedBy.values()) if (set.size >= 2) return { facts: null, rejection: "otro-sitio-ya-los-enumera", rawBranches: branches.length };

  // EVIDENCIA para la escalera de estado de la hipótesis (nunca una compuerta
  // acá): ¿los destinos YA comparten un protocolo? Si sus dueños apuntan a un
  // mismo supertipo, la familia de manejadores intercambiables ya existe y lo
  // único que falta es que este sitio deje de enumerarlos ⇒ `parcial`.
  const byProtocol = new Map<string, Set<string>>();
  let acrossFiles = 0;
  for (const r of resolved) {
    for (const t of r.targets) {
      const node = index.nodeById(t);
      if (!node) continue;
      if (node.file !== file.path) acrossFiles++;
      const owner = ownerIdOf(node);
      if (!owner) continue;
      for (const e of index.edgesFrom(owner)) {
        if (!PROTOCOL_EDGES.has(e.kind)) continue;
        const set = byProtocol.get(e.to) ?? new Set<string>();
        set.add(owner);
        byProtocol.set(e.to, set);
      }
    }
  }
  const sharedProtocols = [...byProtocol.entries()]
    .filter(([, owners]) => owners.size >= 2)
    .map(([proto]) => proto)
    .sort();

  return {
    facts: {
      request: best.request,
      branches: best.hits,
      resolved,
      sharedProtocols,
      acrossFiles,
    },
    rejection: null,
    rawBranches: branches.length,
  };
}

/**
 * LA ENTRADA PÚBLICA — la MISMA que usan el detector y la hipótesis
 * (`hypotheses/chain-of-responsibility.ts`), para que las dos granularidades no
 * puedan divergir. Prueba cada escalera candidata del emisor, de la más larga a
 * la más corta, y devuelve la PRIMERA que pasa las seis condiciones; si ninguna
 * pasa, devuelve el rechazo de la que llegó MÁS LEJOS, que es el dato que hace
 * medible el embudo.
 */
export function ladderFactsFor(file: FileUnit, fn: FunctionUnit, index: GraphIndex | null, minRamas: number, minDestinos: number): LadderOutcome {
  const candidates = ladderCandidatesOf(fn);
  if (candidates.length === 0) return { facts: null, rejection: "sin-escalera", rawBranches: 0 };
  const ORDEN: readonly string[] = [
    "sin-escalera",
    "sin-solicitud-comun",
    "pocas-ramas",
    "condiciones-de-un-solo-discriminante",
    "sin-grafo",
    "pocos-destinos-resueltos",
    "la-cadena-ya-esta-armada",
    "otro-sitio-ya-los-enumera",
  ];
  let peor: LadderOutcome | null = null;
  for (const branches of candidates) {
    const outcome = ladderOutcomeFor(file, fn, branches, index, minRamas, minDestinos);
    if (outcome.facts) return outcome;
    if (!peor || ORDEN.indexOf(outcome.rejection ?? "") > ORDEN.indexOf(peor.rejection ?? "")) peor = outcome;
  }
  return peor!;
}

/** Prefijos de rol que la hipótesis lee del `Finding` — EXPORTADOS para que no
 *  haya un literal duplicado en dos archivos (mismo criterio que
 *  `repeated-collaborator-set.ts#ROLE_REPEATS`). */
export const ROLE_SENDER = "sitio que elige el destino";
export const ROLE_BRANCH = "rama que delega";

type ThresholdKey = "ramas" | "destinos";

export const detector: IntraFileDetector<ThresholdKey, "exclusive-dispatch-ladder"> = {
  id: "exclusive-dispatch-ladder",
  kind: "exclusive-dispatch-ladder",
  scope: "intra-file",
  needsGraph: true,
  title: "Un solo sitio reparte la misma solicitud entre destinos que sólo él conoce",
  needs: [],
  thresholds: {
    ramas: pisoDeclarado(4, {
      rationale:
        "MIN_GUARD_RUN (3, pattern-wrapping.ts:481, reusado por hypotheses/chain-of-responsibility.ts) es el piso con el que este proyecto declara que la FORMA EXISTE. El piso de que el patrón PAGUE tiene que estar estrictamente por encima del de existencia: usar el de existencia como el de pago es el modo de fallar que la Ola AC midió (7 máquinas de estados REALES, 6 de ellas con 2-4 estados y ramas de una línea). La cadena cobra un tipo por manejador más el cableado — el propio `cost` de esta hipótesis dice 'conviene sólo si la lista de comprobaciones crece' —: con 3 ramas la mitigación más barata es una tabla de despacho, sin tipos nuevos; con 4 la escalera ya demostró que CRECE. Piso declarado, escrito antes de medir.",
    }),
    destinos: pisoDeclarado(4, {
      rationale:
        "Dos ramas que llaman al MISMO destino son UN manejador con dos condiciones de entrada: contar ramas sin contar destinos dejaría pasar una escalera de 4 ramas con 2 destinos, y 2 manejadores nunca justifican una cadena. Se cuentan sólo los destinos que el grafo RESUELVE porque las condiciones (5a) y (5b) son afirmaciones sobre ellos: un destino que no se puede mirar no puede sostener un 'nadie más lo enumera'. Piso declarado, escrito antes de medir.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const ramas = ctx.threshold("ramas");
    const destinos = ctx.threshold("destinos");
    const index = ctx.graph ? (ctx.graphIndex?.() ?? null) : null;
    if (!index) return []; // ver "SIN GRAFO no emite nada" en el docstring del módulo.

    const findings: RawFinding[] = [];
    for (const fn of file.functions) {
      const outcome = ladderFactsFor(file, fn, index, ramas.value, destinos.value);
      const facts = outcome.facts;
      if (!facts) continue;

      const owner = fn.metrics.className;
      const senderName = fn.name ?? "(anónima)";
      const symbol = owner ? `${owner}.${senderName}` : senderName;
      const mensajes = facts.resolved.map((r) => r.message);
      const locations: RoleLocation[] = [
        {
          file: file.path,
          startLine: fn.startLine,
          endLine: fn.endLine,
          symbol,
          role: `${ROLE_SENDER}: ${facts.branches.length} ramas excluyentes reparten "${facts.request}" entre ${facts.resolved.length} destinos distintos`,
        },
        ...facts.branches.map<RoleLocation>((b) => ({
          file: file.path,
          startLine: b.startLine,
          endLine: b.endLine,
          symbol,
          role: `${ROLE_BRANCH}: si (${b.conditionText.trim().slice(0, 80)}) ⇒ "${b.message}"`,
        })),
      ];

      findings.push({
        variant: senderName,
        title: `"${senderName}" elige entre ${facts.resolved.length} destinos de "${facts.request}" que sólo este sitio conoce`,
        detail:
          `${facts.branches.length} ramas mutuamente excluyentes de "${senderName}" le pasan el MISMO parámetro "${facts.request}", sin transformar, a ${facts.resolved.length} destinos distintos ` +
          `(${mensajes.join(", ")}); las condiciones no comparten ningún identificador, así que cada rama decide por su cuenta. ` +
          `Ningún destino llama a otro (no hay cadena armada) y ningún otro símbolo del repo llama a dos o más de ellos: este sitio es el ÚNICO que los enumera, ` +
          "así que agregar un destino obliga a tocarlo. " +
          "Esto no afirma que falte un patrón: es la evidencia cruda de la SITUACIÓN — si la familia de destinos ya comparte protocolo, si no, o si la cadena ya existe, lo decide la hipótesis, no este detector.",
        trigger: [
          { label: "ramas excluyentes que delegan la misma solicitud", value: facts.branches.length, threshold: ramas },
          { label: "destinos distintos resueltos en el grafo", value: facts.resolved.length, threshold: destinos },
        ],
        evidence: [
          { label: "ramas excluyentes en total", value: outcome.rawBranches, note: "incluidas las que no delegan la solicitud" },
          { label: "destinos que viven en otro archivo", value: facts.acrossFiles, note: "0 = toda la familia está en este archivo" },
          {
            label: "protocolos que ya comparten dos o más destinos",
            value: facts.sharedProtocols.length,
            note: facts.sharedProtocols.length > 0 ? facts.sharedProtocols.join(", ") : "ninguno: los destinos no comparten supertipo escrito",
          },
        ],
        locations: locations as [RoleLocation, ...RoleLocation[]],
        severity: 30,
        advice: {
          primary: {
            name: "Replace Conditional Dispatch with Polymorphism",
            kind: "refactorizacion",
            why: `Los ${facts.resolved.length} destinos reciben la misma "${facts.request}" y sólo este sitio sabe que existen: mientras la elección viva acá, cada destino nuevo obliga a editar "${senderName}".`,
            source: "https://refactoring.guru/replace-conditional-with-polymorphism",
          },
        },
      });
    }
    return findings;
  },
};
