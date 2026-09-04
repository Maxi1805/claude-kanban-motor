/**
 * Extract Variable — Ola AT, frente AT5 ("componiendo métodos").
 *
 * ── LA APUESTA DEL FRENTE, Y POR QUÉ ESTA FORMA Y NO OTRA ─────────────────
 * `Extract Method` mide 73,6 % pero emite **7.303** propuestas: 4,5 veces los
 * 17 patrones juntos. La apuesta de este frente es que una parte de ese
 * volumen se explica mejor con un remedio MÁS PRECISO que "extraé un método".
 * Este archivo prueba una de esas partes.
 *
 * El encargo avisa del riesgo con nombre propio: *"Extract Variable — riesgo
 * alto de escala y de GUSTO PERSONAL"*. Es exacto. "Esta expresión se leería
 * mejor con un nombre" es una opinión, y una familia construida sobre eso
 * repetiría el 17,9 % de los patrones. Por eso este archivo **no implementa
 * la técnica suelta**: implementa la única forma de ella que es un HECHO
 * CONTABLE y además un PROBLEMA, no una forma —
 *
 *     LA MISMA subexpresión de navegación, escrita IDÉNTICA tres o más veces
 *     dentro de la misma función.
 *
 * Eso se verifica abriendo el archivo y contando; no hace falta estar de
 * acuerdo sobre estilo para reconocerlo. Y es un problema real, no una
 * preferencia: tres copias de `opts.resolve.alias` es un lugar donde el
 * próximo cambio tiene que acordarse de las tres, y el analizador acaba de
 * demostrar que el autor NO le puso nombre (`sin-nombre-todavia`).
 *
 * ── LA MEDICIÓN QUE FIJÓ LOS TRES NÚMEROS (v1 → v2 de la sonda) ───────────
 * La primera sonda (`scripts/at5-sonda.mts`, cobra) contó **134 candidatos en
 * 36 archivos** y al abrirlos resultaron ser, casi todos, tres cosas que NO
 * son este problema, y las tres se arreglaron por ESTRUCTURA, no por lista:
 *   · el CALLEE de una llamada (`strings.Join` en `strings.Join(a, b)`): no
 *     es un valor que se pueda nombrar en una variable — se descarta mirando
 *     si el nodo padre arranca en la misma posición y sigue con `(`;
 *   · el DESTINO de una asignación (`rootCmd.ValidArgsFunction = …`): no es
 *     una lectura repetida, es una escritura — se descarta por la forma de
 *     campos `left`/`right` del padre;
 *   · declaraciones de parámetro y literales compuestos (`args []string`,
 *     `[]string{"first"}`): se descartan exigiendo que el texto sea una
 *     cadena de navegación PURA (identificador + `.x`/`[i]`, sin paréntesis,
 *     sin llaves, sin espacios).
 * Con eso más el piso de **dos eslabones** (`a.b.c`, `a.b[i]`; `cmd.name`
 * NO), lo que queda es la forma que este archivo afirma.
 *
 * ── POR QUÉ "SIN LLAMADAS" ES UNA CONDICIÓN Y NO UNA COMODIDAD ────────────
 * La regla corregida de esta ola exige que la precondición sea **visible en
 * lo que el analizador carga**. "Esta expresión no tiene efectos" NO es
 * visible cuando la expresión contiene una llamada: hay que abrir la función
 * llamada, y puede estar en otro archivo, en otro paquete o detrás de una
 * interfaz. Una cadena de navegación pura, en cambio, se decide mirando el
 * propio texto. Por eso las llamadas quedan afuera: no por gusto, porque la
 * afirmación no se podría sostener. Falso negativo declarado.
 *
 * ── LA TRAMPA #3: EL REMEDIO PUEDE YA ESTAR APLICADO ──────────────────────
 * `sin-nombre-todavia` es un `required`, no un discriminador: si la función
 * YA declara un local cuyo valor inicial es exactamente esta expresión, esta
 * hipótesis devuelve **silencio**. El nombre ya existe; que algunos sitios no
 * lo usen es otro consejo (y uno que esta familia no puede sostener sin
 * resolución de alcances léxicos, que el analizador no hace).
 *
 * ── LA TRAMPA #2: NO LE BORRA LA PROPUESTA A `Extract Method` ─────────────
 * Las anclas son las MISMAS dos de `extract-method.ts` (`long-function`,
 * `complexity`) y las de `guard-clauses.ts`. `appliedState` devuelve SIEMPRE
 * `"ausente"`: `engine.ts#arbitrateRivalHypotheses` sólo retira una
 * oportunidad frente a un estado CONFIRMADO de otro patrón, así que una
 * hipótesis que no puede estar confirmada no puede retirarle nada a nadie —
 * ni a `Extract Method` ni a `Value Object`. El test lo congela.
 *
 * ── EL ANCLA DUEÑA (mismo defecto de producto que la Ola AS ya pagó) ──────
 * Una función larga Y compleja dispara las dos anclas y, sin desempate, la
 * misma expresión repetida saldría propuesta DOS veces con texto idéntico
 * (fue el 25 % de las propuestas de `Guard Clauses` en su primera medición).
 * `ancla-duena` lee la métrica de la función encerrante —la misma con la que
 * decide el detector— y aplica una prioridad fija.
 *
 * ── LENGUAJES ─────────────────────────────────────────────────────────────
 * `needs: []`. Ninguna constante nombra un lenguaje: la cadena de navegación
 * se reconoce por su forma léxica compartida (identificador + `.`/`[]`, la
 * gramática de acceso que los seis lenguajes escriben igual) y el callee/
 * destino por FORMA de nodo padre, nunca por tipo de nodo de una gramática.
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import type { AstNode, FileUnit, Finding, FunctionUnit, RoleLocation } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/**
 * Cadena de NAVEGACIÓN pura: un identificador y después sólo eslabones `.x` o
 * `[i]`. Sin paréntesis (⇒ sin llamadas: ver el docstring), sin llaves (⇒ sin
 * literales compuestos), sin espacios (⇒ sin declaraciones de tipo ni
 * operadores). Es gramática de ACCESO, compartida por los seis lenguajes —
 * `@a.b` de Ruby, `self.a.b` de Python, `this.a.b` de TS/Java/C#, `a.b.c` de
 * Go — no una lista por lenguaje.
 */
const NAV = /^[A-Za-z_@$][A-Za-z0-9_$]*(\??\.[A-Za-z_$][A-Za-z0-9_$]*|\[[^[\]()]{1,24}\])+$/;
/** Dos eslabones: `cmd.name` no es un problema, `cmd.flags.lookup` empieza a serlo. */
const MIN_LINKS = 2;
/** Tres copias. Dos es una comparación (`a.b.c === d.e.f`), tres ya es un patrón de escritura. */
const MIN_TIMES = 3;
/** Menos de esto no le ahorra nada al lector. */
const MIN_LENGTH = 12;
/** Cuatro o más sube un peldaño. */
const MANY_TIMES = 4;
/** Tres eslabones o más: además de repetida, la cadena es profunda. */
const DEEP_LINKS = 3;
/** Repartida a lo largo de la función, no tres veces en la misma expresión. */
const SPREAD_LINES = 10;
/** El piso REAL de `detect/intra-function/complexity.ts`: `citado(15, SonarSource S3776)`. */
const COMPLEXITY_FLOOR = 15;

type Graph = CodeGraph | null;

/* ── lectura del árbol ───────────────────────────────────────────────────── */

function findEnclosingFunction(file: FileUnit, problem: Finding): FunctionUnit | null {
  const loc = problem.locations[0];
  if (!loc) return null;
  let best: FunctionUnit | null = null;
  for (const fn of file.functions) {
    if (fn.startLine <= loc.startLine && loc.endLine <= fn.endLine) {
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
  }
  return best;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function samePosition(a: AstNode | null, b: AstNode | null): boolean {
  return (
    a !== null &&
    b !== null &&
    a.startPosition.row === b.startPosition.row &&
    a.startPosition.column === b.startPosition.column &&
    a.endPosition.row === b.endPosition.row &&
    a.endPosition.column === b.endPosition.column
  );
}

/**
 * ¿La aparición es el CALLEE de una llamada? Dos mecanismos, los dos de
 * forma: el campo genérico (`function`/`method`/`constructor`, el nombre que
 * cada gramática le da al invocado) y, para las que no lo exponen, la prueba
 * posicional — el padre arranca donde arranca el nodo y lo que sigue abre
 * paréntesis o corchete angular.
 */
function isCallee(node: AstNode, parent: AstNode | null): boolean {
  if (!parent) return false;
  for (const field of ["function", "method", "constructor"] as const) {
    if (samePosition(parent.childForFieldName(field) as AstNode | null, node)) return true;
  }
  if (parent.startPosition.row === node.startPosition.row && parent.startPosition.column === node.startPosition.column) {
    const rest = parent.text.slice(node.text.length);
    if (/^\s*[(<]/.test(rest)) return true;
  }
  return false;
}

/**
 * LA LIGADURA CON NOMBRE (`x = <expresión>`), por FORMA y no por gramática.
 *
 * Dos mecanismos, y el segundo NO es opcional: lo encontró el test de los seis
 * lenguajes de `decompose-conditional.test.ts`. Cuatro de las seis gramáticas
 * exponen la ligadura con los campos genéricos (`name`/`value` en Java y
 * JS/TS, `left`/`right` en Python, Ruby y Go), pero **C# no expone ninguno**:
 * su `variable_declarator` tiene dos hijos nombrados sueltos —el identificador
 * y un envoltorio que arranca con `=`— y nada más (sonda directa,
 * `scratchpad-at5/probes/csharp.mts`). Sin el segundo mecanismo la trampa #3
 * queda MUDA en C#: la misma clase de agujero por lenguaje que
 * `state.ts#SELF_PREFIX` dejó abierto durante varias olas. El segundo es
 * estructural —dos hijos nombrados, el primero un identificador desnudo, un
 * `=` entre ellos— y no nombra ninguna gramática.
 *
 * (Duplicado, a propósito, en las tres hipótesis de este frente: un archivo
 * compartido nuevo en `hypotheses/` obligaría a editar la lista de exclusión
 * de `registries.test.ts`, que es un archivo de otro dueño.)
 */
function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function unwrapBinding(node: AstNode): AstNode {
  let cur = node;
  for (let i = 0; i < 2; i++) {
    if (!/^\s*=[^=]/.test(cur.text)) break;
    const kids = namedChildren(cur);
    if (kids.length !== 1) break;
    cur = kids[0]!;
  }
  return cur;
}

/**
 * ASIGNACIÓN de verdad, no cualquier binaria. Los campos `left`/`right` son
 * COMPARTIDOS entre la aritmética, la comparación y la asignación en las seis
 * gramáticas — es la misma advertencia que `boolean-complexity.ts` escribe
 * para el vocabulario lógico: *"el nombre del nodo es compartido, no alcanza
 * por sí solo"*. Sin este filtro, `limite + 1` se leía como la ligadura
 * `limite = 1` y rompía las dos cosas a la vez: el temporal parecía asignado
 * dos veces y el lado izquierdo de cualquier multiplicación quedaba marcado
 * como destino de escritura. Lo encontró el test de los seis lenguajes.
 */
const ASSIGN_OPERATOR = /^(([-+*/%&|^]|<<|>>|>>>|\*\*|\/\/|\?\?|\|\||&&)?=)$/;

function namedBinding(node: AstNode): { readonly name: AstNode; readonly value: AstNode } | null {
  const operator = node.childForFieldName("operator") as AstNode | null;
  if (operator && !ASSIGN_OPERATOR.test(operator.type)) return null;
  const nameField = (node.childForFieldName("name") ?? node.childForFieldName("left")) as AstNode | null;
  const valueField = (node.childForFieldName("value") ?? node.childForFieldName("right")) as AstNode | null;
  if (nameField && valueField) return { name: nameField, value: unwrapBinding(valueField) };
  const kids = namedChildren(node);
  if (kids.length !== 2) return null;
  const [a, b] = kids as [AstNode, AstNode];
  if (namedChildren(a).length !== 0) return null;
  if (!/^[A-Za-z_@$][A-Za-z0-9_$]*$/.test(a.text.trim())) return null;
  if (!/^\s*=[^=]/.test(node.text.slice(a.text.length))) return null;
  return { name: a, value: unwrapBinding(b) };
}

/**
 * EL RECORRIDO DE LAS EXPRESIONES — y las DOS correcciones que costó afinar,
 * las dos encontradas ABRIENDO LAS PROPUESTAS de la primera corrida, no
 * leyendo el código:
 *
 *   1. NO SE ENTRA A UNA ANOTACIÓN DE TIPO (campos genéricos `type` y
 *      `return_type`). `click/src/click/_termui_impl.py:60` proponía nombrar
 *      `cabc.Iterable[V]`, que no es un valor que el código lea: es la
 *      anotación de un parámetro. En Python y en Go una anotación se parsea
 *      con la MISMA forma que un acceso encadenado, así que la única manera
 *      de distinguirlas es por el CAMPO por el que se llega — genérico, no de
 *      una gramática.
 *   2. SE MARCA lo que está DENTRO DE UNA FUNCIÓN ANIDADA, pero NO se lo
 *      salta. La primera reacción al ver la misma línea propuesta dos veces
 *      (`preact/scripts/babel-plugin-fast-rest.mjs:26`, una función larga
 *      adentro de otra función larga) fue dejar de abrir las anidadas — y eso
 *      **borró casi todas las propuestas buenas del frente**: en JS/TS y Ruby
 *      una función larga es, casi siempre, una función con callbacks adentro,
 *      y la cadena repetida vive ahí (`jekyll .../livereload.js:339`,
 *      `_this.options.host` seis veces; `vueuse .../onLongPress/index.ts:90`,
 *      `options?.modifiers?.prevent` tres veces). Una sobre-corrección que
 *      cambia un duplicado por un silencio no es un arreglo. La marca permite
 *      lo correcto: CONTAR todo el cuerpo (una variable extraída afuera se ve
 *      desde adentro de un closure) y a la vez EXIGIR que al menos una
 *      aparición esté en el cuerpo propio, que es lo que desempata entre la
 *      función de afuera y la de adentro.
 */
function walkExpressions(
  node: AstNode,
  sets: DerivedNodeSets,
  visit: (n: AstNode, parent: AstNode | null, inNested: boolean) => void,
): void {
  const rec = (n: AstNode, p: AstNode | null, isRoot: boolean, inNested: boolean): void => {
    const nested = inNested || (!isRoot && sets.functionNodes.has(n.type));
    visit(n, p, nested);
    const typeChild = n.childForFieldName("type") as AstNode | null;
    const returnType = n.childForFieldName("return_type") as AstNode | null;
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i) as AstNode | null;
      if (!c) continue;
      if ((typeChild && samePosition(typeChild, c)) || (returnType && samePosition(returnType, c))) continue;
      rec(c, n, false, nested);
    }
  };
  rec(node, null, true, false);
}

const posKey = (n: AstNode) => `${n.startPosition.row}:${n.startPosition.column}:${n.endPosition.row}:${n.endPosition.column}`;

interface Repetida {
  readonly text: string;
  readonly times: number;
  /** Cuántas de esas apariciones están en el cuerpo PROPIO (fuera de toda función anidada). */
  readonly own: number;
  readonly links: number;
  readonly firstLine: number;
  readonly lastLine: number;
}

interface Lectura {
  /** La expresión repetida elegida — la más larga que sobrevive. */
  readonly best: Repetida | null;
  /** Cuántas expresiones distintas cumplen la condición (sólo se propone la mejor). */
  readonly candidates: number;
  /** Destinos de asignación de la función, con sus líneas: lo que puede volver INESTABLE una cadena. */
  readonly assigned: ReadonlyMap<string, readonly number[]>;
  /** El local que YA guarda esta expresión, si existe. */
  readonly existingName: string | null;
  readonly fnName: string | null;
  readonly file: string;
}

function readFunction(fn: FunctionUnit, file: string): Lectura {
  /* PASADA 1 — las ligaduras: qué se escribe y qué ya tiene nombre. */
  const assigned = new Map<string, number[]>();
  const initializers = new Map<string, string>(); // texto de la expresión -> nombre del local
  const targetPositions = new Set<string>();
  walkExpressions(fn.node, fn.sets, (n) => {
    const binding = namedBinding(n);
    if (!binding) return;
    targetPositions.add(posKey(binding.name));
    const targetText = norm(binding.name.text);
    const at = assigned.get(targetText);
    if (at) at.push(binding.name.startPosition.row + 1);
    else assigned.set(targetText, [binding.name.startPosition.row + 1]);
    const expr = norm(binding.value.text);
    const id = norm(binding.name.text);
    if (/^[A-Za-z_@$][A-Za-z0-9_$]*$/.test(id) && !initializers.has(expr)) initializers.set(expr, id);
  });

  /*
   * PASADA 2 — las LECTURAS repetidas (nunca un callee, nunca un destino).
   *
   * SE CUENTA POR POSICIÓN, NO POR NODO, y no es un detalle: la gramática de
   * C# produce DOS nodos nombrados con el MISMO span para un acceso encadenado
   * (`cfg.server.options` se visitó 4 veces por 2 apariciones reales —
   * comprobado con `scratchpad-at5/probes/cs-ev.mts`), así que contar nodos
   * inflaba el conteo al doble y esta familia habría emitido en C# con la
   * mitad de las repeticiones que exige. Lo encontró el test de los seis
   * lenguajes, no la lectura.
   */
  const counts = new Map<string, { times: number; own: number; first: number; last: number }>();
  const contadas = new Set<string>();
  walkExpressions(fn.node, fn.sets, (n, p, inNested) => {
    if (!n.isNamed) return;
    if (targetPositions.has(posKey(n))) return;
    if (contadas.has(posKey(n))) return;
    const t = norm(n.text);
    if (!NAV.test(t) || t.length < MIN_LENGTH) return;
    const l = (t.match(/\./g)?.length ?? 0) + (t.match(/\[/g)?.length ?? 0);
    if (l < MIN_LINKS) return;
    if (isCallee(n, p)) return;
    contadas.add(posKey(n));
    const row = n.startPosition.row + 1;
    const c = counts.get(t);
    if (c) {
      c.times += 1;
      if (!inNested) c.own += 1;
      c.last = Math.max(c.last, row);
    } else counts.set(t, { times: 1, own: inNested ? 0 : 1, first: row, last: row });
  });

  /*
   * ESTABILIDAD, Y EL NÚMERO QUE LA DECIDE ES LA LÍNEA, NO LA PRESENCIA.
   *
   * La primera versión descartaba la cadena si su raíz aparecía ALGUNA VEZ
   * como destino de asignación. Medido sobre la corrida real, eso dejaba a la
   * familia CASI MUDA, y por una razón que sólo se ve abriendo los casos: el
   * idiomatismo `var _this = this;` / `const opts = getOpts();` liga la raíz
   * UNA vez, arriba de todo, y después sólo se lee — es exactamente el código
   * donde la cadena repetida vale la pena, y era el que se descartaba
   * (`jekyll .../livereload.js:339`, `_this.options.host` seis veces, y con
   * él toda cadena que arranque en un local).
   *
   * Lo que de verdad rompe la equivalencia no es que la raíz se ligue: es que
   * se REASIGNE ENTRE MEDIO. Una ligadura ANTES de la primera lectura deja
   * las N lecturas devolviendo el mismo valor; una asignación dentro del
   * tramo leído, no. Se compara por línea, que es un hecho del archivo.
   */
  const unstable = (t: string, firstLine: number): boolean => {
    const root = t.split(/[.[]/)[0]!;
    for (const [a, lines] of assigned) {
      const alcanza = a === t || t.startsWith(`${a}.`) || t.startsWith(`${a}[`) || a === root;
      if (!alcanza) continue;
      if (lines.some((l) => l >= firstLine)) return true;
    }
    return false;
  };

  const repetidas: Repetida[] = [...counts.entries()]
    .filter(([t, c]) => c.times >= MIN_TIMES && c.own >= 1 && !unstable(t, c.first))
    .map(([t, c]) => ({ text: t, times: c.times, own: c.own, links: (t.match(/\./g)?.length ?? 0) + (t.match(/\[/g)?.length ?? 0), firstLine: c.first, lastLine: c.last }))
    .sort((a, b) => (b.times - a.times) || (b.text.length - a.text.length));

  // Una cadena y su prefijo se cuentan las dos (`a.b.c` implica `a.b`): se
  // conserva la MÁS LARGA, que es la que de verdad hay que nombrar.
  const maximales = repetidas.filter((r) => !repetidas.some((o) => o !== r && o.text.length > r.text.length && o.text.includes(r.text)));
  const best = maximales[0] ?? null;

  return {
    best,
    candidates: maximales.length,
    assigned,
    existingName: best ? (initializers.get(best.text) ?? null) : null,
    fnName: fn.name,
    file,
  };
}

/* ── el ancla dueña ─────────────────────────────────────────────────────── */

function ownerAnchor(fn: FunctionUnit): string {
  return fn.metrics.cognitive >= COMPLEXITY_FLOOR ? "complexity" : "long-function";
}

/* ── los checks ─────────────────────────────────────────────────────────── */

const SOURCE = "https://refactoring.guru/es/extract-variable";
const TO_CONFIRM: readonly string[] = [
  "¿las tres apariciones significan LO MISMO en el punto donde están, o alguna se lee después de que otro hilo/callback pudo cambiar el objeto? El análisis mira la función, no la concurrencia.",
  "¿hay un nombre que describa QUÉ es el valor y no cómo se llega a él? Si el único nombre posible es repetir la ruta (`optsResolveAlias`), la variable no agrega nada y conviene dejarlo como está.",
  "¿alguna aparición está dentro de una rama que puede no ejecutarse, donde el acceso hoy se saltea? Subir la lectura al principio la volvería incondicional.",
];

interface Ctx {
  readonly lectura: Lectura | null;
  readonly kind: string;
  readonly owner: string | null;
  readonly cognitive: number;
}

const subexpresionRepetida: Check<Ctx, Graph> = {
  id: "subexpresion-repetida",
  describe: `la misma cadena de navegación (>= ${MIN_LINKS} eslabones, >= ${MIN_LENGTH} caracteres, sin llamadas) se lee ${MIN_TIMES} veces o más dentro de la función, y al menos una de esas lecturas está en su cuerpo propio (no dentro de una función anidada)`,
  run: (c) =>
    !c.lectura
      ? { holds: false, evidence: "no se pudo leer la función encerrante (sin árbol vivo o sin función): no demostrado." }
      : !c.lectura.best
        ? { holds: false, evidence: `ninguna cadena de navegación se repite ${MIN_TIMES} veces: no hay nada que nombrar.` }
        : { holds: true, evidence: `\`${c.lectura.best.text}\` aparece ${c.lectura.best.times} veces (líneas ${c.lectura.best.firstLine}–${c.lectura.best.lastLine}), ${c.lectura.best.own} de ellas en el cuerpo propio de la función, con ${c.lectura.best.links} eslabones.` },
};

const baseEstable: Check<Ctx, Graph> = {
  id: "base-estable",
  describe: "ni la cadena ni su raíz se REASIGNAN dentro del tramo que se lee (una ligadura anterior a la primera lectura no rompe nada; una asignación entre medio sí)",
  run: (c) => {
    if (!c.lectura || !c.lectura.best) return { holds: false, evidence: "sin cadena repetida: no demostrado." };
    // `readFunction` ya descarta las inestables antes de elegir `best`: si hay
    // `best`, esto se cumple por construcción. El check existe igual porque es
    // la condición que decide la CORRECCIÓN de la transformación y tiene que
    // estar en la evidencia que ve el usuario, no sólo en el código.
    return {
      holds: true,
      evidence: `ninguna de las ${c.lectura.assigned.size} ligaduras de la función escribe sobre \`${c.lectura.best.text}\` ni sobre su raíz desde la línea ${c.lectura.best.firstLine} en adelante: las ${c.lectura.best.times} lecturas devuelven el mismo valor.`,
    };
  },
};

const sinNombreTodavia: Check<Ctx, Graph> = {
  id: "sin-nombre-todavia",
  describe: "la función NO declara ya un local cuyo valor inicial sea exactamente esta cadena (si lo declara, el nombre ya está puesto y esta familia calla)",
  run: (c) => {
    if (!c.lectura || !c.lectura.best) return { holds: false, evidence: "sin cadena repetida: no demostrado." };
    return c.lectura.existingName === null
      ? { holds: true, evidence: "ningún local de la función se inicializa con esta cadena: el nombre no existe todavía." }
      : { holds: false, evidence: `\`${c.lectura.existingName}\` ya guarda esta cadena: el remedio está aplicado, esta familia calla.` };
  },
};

const anclaDuena: Check<Ctx, Graph> = {
  id: "ancla-duena",
  describe: "este hallazgo es el ancla DUEÑA de esta función (una función larga Y compleja dispara las dos anclas; sin esto la misma propuesta sale dos veces)",
  run: (c) =>
    c.owner === null
      ? { holds: false, evidence: "no se pudo ubicar la función encerrante: no demostrado." }
      : { holds: c.owner === c.kind, evidence: `dueño "${c.owner}" (complejidad cognitiva ${c.cognitive}, piso ${COMPLEXITY_FLOOR}); este hallazgo es "${c.kind}".` },
};

const muchasRepeticiones: Check<Ctx, Graph> = {
  id: "muchas-repeticiones",
  describe: `la cadena se repite ${MANY_TIMES} veces o más`,
  run: (c) => ({ holds: (c.lectura?.best?.times ?? 0) >= MANY_TIMES, evidence: `${c.lectura?.best?.times ?? 0} apariciones (>= ${MANY_TIMES} sube un peldaño).` }),
};

const cadenaProfunda: Check<Ctx, Graph> = {
  id: "cadena-profunda",
  describe: `la cadena tiene ${DEEP_LINKS} eslabones o más (además de repetida, es larga de leer)`,
  run: (c) => ({ holds: (c.lectura?.best?.links ?? 0) >= DEEP_LINKS, evidence: `${c.lectura?.best?.links ?? 0} eslabones (>= ${DEEP_LINKS} sube un peldaño).` }),
};

const repartida: Check<Ctx, Graph> = {
  id: "repartida",
  describe: `las apariciones están repartidas a lo largo de ${SPREAD_LINES} líneas o más (no son tres términos de la misma expresión)`,
  run: (c) => {
    const b = c.lectura?.best;
    const span = b ? b.lastLine - b.firstLine + 1 : 0;
    return { holds: span >= SPREAD_LINES, evidence: `las apariciones abarcan ${span} líneas (>= ${SPREAD_LINES} sube un peldaño).` };
  },
};

/** SIEMPRE `"ausente"` — ver la trampa #2 en el docstring del módulo. */
function appliedState(c: Ctx): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "la cadena no tiene nombre en esta función",
        passed: true,
        why:
          c.lectura?.best
            ? `ningún local de la función guarda \`${c.lectura.best.text}\` (el required "sin-nombre-todavia" devuelve silencio si lo hubiera).`
            : "sin cadena repetida.",
      },
    ],
  };
}

function buildSpec(): HypothesisSpec<Ctx, Graph> {
  return {
    pattern: "Extract Variable",
    ceiling: "media",
    needs: [],
    // `ancla-duena` va ÚLTIMO a propósito: el motor exige que TODOS pasen, así
    // que el orden no cambia el resultado, pero sí cambia DÓNDE muere el
    // embudo — y muerto en un desempate no dice nada sobre la forma.
    required: [subexpresionRepetida, baseEstable, sinNombreTodavia, anclaDuena],
    discriminators: [muchasRepeticiones, cadenaProfunda, repartida],
    appliedState: (c) => appliedState(c),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── la traza ───────────────────────────────────────────────────────────── */

export interface ExtractVariableTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly withFile: boolean;
  readonly text: string | null;
  readonly times: number;
  readonly links: number;
  readonly candidates: number;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly emitted: boolean;
}

let trace: ExtractVariableTraceEntry[] | null = null;
export function startExtractVariableTrace(): void {
  trace = [];
}
export function takeExtractVariableTrace(): readonly ExtractVariableTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function placesOf(l: Lectura): readonly RoleLocation[] {
  const b = l.best!;
  return [
    {
      file: l.file,
      startLine: b.firstLine,
      endLine: b.lastLine,
      symbol: l.fnName ?? undefined,
      role: `\`${b.text}\` escrita ${b.times} veces idéntica dentro de la misma función`,
    },
  ];
}

export const hypothesis: HypothesisBuilder = {
  id: "extract-variable",
  pattern: "Extract Variable",
  layer: "refactorizacion",
  anchors: ["complexity", "long-function"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const fn = ctx.file ? findEnclosingFunction(ctx.file, problem) : null;
    const lectura = fn && ctx.file ? readFunction(fn, ctx.file.path) : null;
    const c: Ctx = {
      lectura,
      kind: problem.kind,
      owner: fn ? ownerAnchor(fn) : null,
      cognitive: fn?.metrics.cognitive ?? 0,
    };
    const spec = buildSpec();
    const outcome = runEngine(spec, ctx.capabilities, c, graph);
    if (trace) {
      const checks = spec.required.map((k) => ({ id: k.id, holds: k.run(c, graph).holds }));
      trace.push({
        findingId: problem.id,
        kind: problem.kind,
        file: problem.locations[0]?.file ?? "",
        line: problem.locations[0]?.startLine ?? 0,
        symbol: problem.locations[0]?.symbol ?? "",
        withFile: ctx.file !== null,
        text: lectura?.best?.text ?? null,
        times: lectura?.best?.times ?? 0,
        links: lectura?.best?.links ?? 0,
        candidates: lectura?.candidates ?? 0,
        checks,
        diesAt: checks.find((k) => !k.holds)?.id ?? null,
        emitted: outcome !== null,
      });
    }
    if (!outcome || !lectura || !lectura.best) return null;
    const b = lectura.best;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(lectura),
      cost:
        `Una línea nueva y ${b.times} reemplazos dentro de la misma función: \`${b.text}\` se lee una vez en un local con nombre ` +
        "y las demás apariciones pasan a usarlo. No cambia ninguna firma, no mueve nada de lugar y el valor es el mismo porque " +
        "la función no asigna sobre esa cadena ni sobre su raíz. El trabajo real es elegir el nombre; si el único nombre posible " +
        "es repetir la ruta, no vale la pena.",
    });
  },
};
