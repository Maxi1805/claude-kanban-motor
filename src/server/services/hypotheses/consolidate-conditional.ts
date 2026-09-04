/**
 * Consolidate Conditional (Consolidate Conditional Expression + Consolidate
 * Duplicate Conditional Fragments) — Ola AS, frente AS2.
 *
 * ── DOS FORMAS, LAS DOS VERIFICABLES ABRIENDO EL ARCHIVO ───────────────────
 *
 *   FORMA A — **el mismo cuerpo bajo condiciones distintas.** Dos o más ramas
 *   de la MISMA cadena cuyo cuerpo es, carácter por carácter (normalizando
 *   espacios), IDÉNTICO:
 *
 *       if (seniority < 2)  return 0;          if (seniority < 2 ||
 *       if (monthsDisabled > 12) return 0;  ⇒      monthsDisabled > 12 ||
 *       if (isPartTime) return 0;                  isPartTime) return 0;
 *
 *   FORMA B — **el mismo fragmento en TODAS las ramas.** El primer (o el
 *   último) statement de CADA rama de la cadena es el mismo texto:
 *
 *       if (isSpecial) { total = price*0.95; send(); }     if (isSpecial) total = price*0.95;
 *       else           { total = price*0.98; send(); }  ⇒  else            total = price*0.98;
 *                                                          send();
 *
 * ── POR QUÉ LA PRECONDICIÓN ES UN HECHO Y NO UNA OPINIÓN ───────────────────
 * El criterio de la ola: *"si la precondición no se puede verificar abriendo
 * el archivo, la familia repite el 18 % de los patrones"*. Acá la
 * precondición es **igualdad de texto normalizado entre dos subárboles del
 * mismo condicional**. No hay juicio de estilo: o los dos cuerpos son el
 * mismo texto o no lo son. Es la misma clase de hecho que "esta función tiene
 * 107 líneas".
 *
 * ── LO QUE refactoring.guru DICE EN "CUÁNDO NO CONVIENE", Y CÓMO SE APLICA ─
 * Para *Consolidate Conditional Expression* la advertencia es: **no lo hagas
 * si las condiciones son de verdad independientes** (si mañana una de ellas
 * va a hacer otra cosa, unirlas es acoplarlas). No hay forma sintáctica de
 * saber el futuro, así que eso NO se pretende decidir acá: va en `toConfirm`,
 * textual. Lo que sí se exige por forma es lo que la técnica necesita para
 * ser CORRECTA: que los cuerpos sean idénticos y que las condiciones no
 * tengan efectos visibles (`sin-efectos-en-las-condiciones`), porque unir
 * `if (a()) …; if (b()) …;` en `if (a() || b())` puede dejar de ejecutar
 * `b()` por cortocircuito. Ése es un cambio de comportamiento, no de estilo,
 * y es el único falso GRAVE que esta familia puede producir.
 *
 * ── LA TRAMPA #2 (no borrarle la propuesta a Extract Method) ───────────────
 * `appliedState` devuelve SIEMPRE `"ausente"`. `engine.ts#arbitrateRival-
 * Hypotheses` sólo retira una oportunidad frente a un estado CONFIRMADO de
 * otro patrón; una hipótesis que no puede estar confirmada no puede retirar
 * nada. `consolidate-conditional.test.ts` lo congela.
 *
 * ── LENGUAJES ─────────────────────────────────────────────────────────────
 * `needs: []`. Ninguna constante nombra un lenguaje: las cadenas se ubican
 * por `DerivedNodeSets` (`ctx.setsFor`), la igualdad se decide sobre el TEXTO
 * del subárbol con espacios colapsados — la única lectura de texto, y no
 * contra ningún vocabulario.
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import { walkTree } from "../detect/tree-walk.js";
import type { AstNode, FileUnit, Finding, FunctionUnit, RoleLocation } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/** Dos ramas con el mismo cuerpo ya son el smell; con una no hay nada que unir. */
const MIN_REPEATS = 2;
/** Tres o más sube un peldaño. */
const MANY_REPEATS = 3;
/** Un cuerpo de una sola línea trivial (`return`, `break` pelado) se repite por
 *  azar en cualquier lado: para la FORMA A se exige que el cuerpo repetido
 *  tenga contenido, medido en caracteres del texto normalizado. */
const MIN_BODY_CHARS = 12;
/** Los pisos REALES de las anclas, para decidir si una función anidada puede
 *  reclamar una cadena — ver `reclamanCadena`. */
const COMPLEXITY_FLOOR = 15;
const CHAIN_FLOOR = 5;
const LONG_FUNCTION_FLOOR = 45;

const COMMENT_WORD = /(^|_)comment(_|$)/;
const BLOCK_WORD = /(^|_)(block|body|statement_list|suite|compound_statement)(_|$)/;
const LOOP_WORD = /(^|_)(while|until|for|do|loop|range)(_|$)/;
const CALL_WORD = /(^|_)(call|invocation)(_|$)/;
/** Corte de flujo: `return`, `throw`, `break`… Palabra de gramática genérica, nunca una lista por lenguaje. */
const FLOW_BREAK_WORD = /(^|_)(return|throw|raise|panic|continue|break)(_|$)/;
const MUTATION_WORD = /(^|_)(assignment|update|increment|decrement|augmented|named|declaration|short_var)(_|$)/;
/** Campos con los que las gramáticas nombran el INICIALIZADOR de un condicional
 *  (`if x := f(); x != nil` en Go, `if (T t = f(); ...)` en otras). Va aparte
 *  del `condition` a propósito: el trabajo vive ahí, no en la comparación. */
const INIT_FIELDS = ["initializer", "init"] as const;
const SWITCH_WORD = /(^|_)(switch|case|when|match|select)(_|$)/;
const SWITCH_ARM_EXCLUDE = /(pattern|else|default)/;
/** El arm que atrapa todo lo demás. Genérico: `default_case`, `else_clause`,
 *  `case_default`… nunca una lista por lenguaje. */
const DEFAULT_ARM = /(default|else)/;
const SWITCH_WRAPPER_EXCLUDE = /(^|_)(body|block|label)$/;

type Problem = Finding;
type Graph = CodeGraph | null;

interface Branch {
  readonly node: AstNode;
  readonly action: AstNode;
  readonly condition: AstNode | null;
}

/**
 * ¿Esta rama tiene TRABAJO en su cabecera (condición o inicializador)?
 *
 * FALSO REAL QUE ESTO CIERRA, encontrado midiendo sobre `corpus/cobra` con la
 * primera versión, que sólo miraba `condition`:
 *
 *     if _, err := io.WriteString(f, filePrepender(filename)); err != nil { return err }
 *     if _, err := io.WriteString(f, linkHandler(name));       err != nil { return err }
 *
 * Los dos cuerpos son el MISMO texto (`{ return err }`) y las dos condiciones
 * son `err != nil`, sin invocación: la primera versión proponía unirlas. **Es
 * incorrecto**: cada rama declara su PROPIO `err` en su inicializador y hace
 * una llamada distinta ahí. Unirlas con `||` no compila y, si compilara,
 * cambiaría qué se ejecuta. Es el modismo de error de Go, la forma más
 * frecuente que existe en ese lenguaje: sin este check la familia habría
 * emitido basura en todos los repos Go del corpus.
 */
function headerHasWork(branch: Branch): boolean {
  const heads: AstNode[] = [];
  if (branch.condition) heads.push(branch.condition);
  for (const f of INIT_FIELDS) {
    const c = branch.node.childForFieldName(f) as AstNode | null;
    if (c) heads.push(c);
  }
  return heads.some((h) => {
    let found = false;
    walkTree(h, (n) => {
      if (!found && n.isNamed && (CALL_WORD.test(n.type) || MUTATION_WORD.test(n.type))) found = true;
    });
    return found;
  });
}

type Forma = "A" | "B";

interface Hallazgo {
  readonly forma: Forma;
  /** El ancla que es DUEÑA de este lugar — ver `ownerAnchor`. */
  readonly owner: string;
  /** Ramas de la cadena. */
  readonly branches: readonly Branch[];
  /** Ramas que comparten cuerpo (forma A) o ramas con el fragmento común (forma B). */
  readonly repeats: number;
  /** Texto normalizado de lo que se repite. */
  readonly repeated: string;
  /** Condiciones con efecto visible (invocación o mutación). */
  readonly effectful: number;
  readonly fnName: string | null;
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
  /** Líneas exactas de lo que se repite, para `places`. */
  readonly spots: readonly { readonly startLine: number; readonly endLine: number }[];
}

/* ── lectura del árbol ───────────────────────────────────────────────────── */

function findEnclosingFunction(file: FileUnit, problem: Problem): FunctionUnit | null {
  const loc = problem.locations[0];
  let best: FunctionUnit | null = null;
  for (const fn of file.functions) {
    if (fn.startLine <= loc.startLine && loc.endLine <= fn.endLine) {
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
  }
  return best;
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function statementsOf(node: AstNode): AstNode[] {
  let cursor = node;
  for (let i = 0; i < 2; i++) {
    const kids = namedChildren(cursor).filter((c) => !COMMENT_WORD.test(c.type));
    if (kids.length === 1 && BLOCK_WORD.test(kids[0]!.type)) cursor = kids[0]!;
    else break;
  }
  return namedChildren(cursor).filter((c) => !COMMENT_WORD.test(c.type));
}

/** Espacios colapsados: la ÚNICA normalización. No se toca ni un identificador. */
function norm(node: AstNode): string {
  return node.text.replace(/\s+/g, " ").trim();
}

function isIfLike(node: AstNode, sets: DerivedNodeSets): boolean {
  return (
    node.isNamed &&
    sets.chainNodes.has(node.type) &&
    !sets.switchContainerNodes.has(node.type) &&
    !LOOP_WORD.test(node.type) &&
    node.childForFieldName("condition") !== null
  );
}

function actionOf(node: AstNode): AstNode | null {
  for (const f of ["consequence", "body"]) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

/**
 * OLA AS, AS2 — `else if` SÍ; `else { hacer_algo; if (...) }` NO.
 *
 * ENCONTRADO JUZGANDO: `guava .../ConcurrentHashMultiset.java:380 setCount`
 * salió propuesto con «2 ramas de la misma cadena tienen el MISMO cuerpo:
 * { return 0; }», y las dos "ramas" eran el `if (count == 0)` de afuera y un
 * `if (existingCounter == null)` que vive DENTRO del `else`, DESPUÉS de un
 * `existingCounter = countMap.putIfAbsent(...)`. No son ramas de la misma
 * cadena: la segunda depende de la asignación que la precede, y unirlas es
 * imposible.
 *
 * La versión vieja tomaba CUALQUIER hijo del bloque `else` que tuviera
 * condición propia. La regla correcta —y verificable— es que el `else` tiene
 * que ser SÓLO ese condicional: ahí `else { if (c) … }` es exactamente
 * `else if (c) …`. Con una sentencia más, no lo es.
 */
function unwrapAlternative(node: AstNode): AstNode {
  if (node.childForFieldName("condition")) return node;
  const stmts = statementsOf(node);
  if (stmts.length === 1 && stmts[0]!.childForFieldName("condition")) return stmts[0]!;
  return node;
}

/**
 * Ramas de una escalera `if/elsif`, INCLUYENDO el `else` terminal (para la
 * forma B el `else` es una rama más).
 *
 * La segunda vuelta (hijos directos con condición propia) existe por el mismo
 * defecto de gramática que documenta `lookup-table.ts#ladderRungs`: el
 * `if_statement` de Python expone `alternative` como campo REPETIDO y
 * `childForFieldName` devuelve sólo el primero, así que el recorrido clásico
 * mide 2 peldaños en una escalera `if/elif` de cualquier largo.
 */
function ladderBranches(root: AstNode): Branch[] {
  const out: Branch[] = [];
  const seen = new Set<string>();
  const add = (node: AstNode, action: AstNode, condition: AstNode | null): void => {
    const key = `${node.startPosition.row}:${node.startPosition.column}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ node, action, condition });
  };
  let current: AstNode | null = root;
  for (let guard = 0; current && guard < 200; guard++) {
    const cond = current.childForFieldName("condition") as AstNode | null;
    const action = actionOf(current);
    if (!action) break;
    add(current, action, cond);
    const alt = current.childForFieldName("alternative") as AstNode | null;
    if (!alt) break;
    const next = unwrapAlternative(alt);
    if (next === alt && !alt.childForFieldName("condition")) {
      add(alt, alt, null); // `else` terminal: un bloque sin condición. Es una rama más.
      break;
    }
    current = next;
  }
  for (const child of namedChildren(root)) {
    const cond = child.childForFieldName("condition") as AstNode | null;
    const action = actionOf(child);
    if (cond && action) add(child, action, cond);
  }
  out.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row);
  return out;
}

/**
 * OLA AS, AS2 (segunda vuelta) — ¿QUIÉN ES EL DUEÑO DE UNA CADENA ANIDADA?
 *
 * La primera versión de esta regla cortaba en TODA función anidada, y medida
 * contra `med1` se pasó de rosca: en `eslint` bajó de 23 propuestas a 11, y
 * DOS de las que se llevó puestas eran verdaderas juzgadas
 * (`capitalized-comments.js:266` y `arrow-body-style.js:375`). La razón es la
 * forma de eslint: `create(context) { … return { Handler(node) { … } } }`. El
 * hallazgo de `complexity` lo tiene `create`; el handler de adentro es CHICO y
 * **no dispara ningún ancla**, así que si `create` no puede mirar adentro, esa
 * cadena no la propone NADIE y se pierde.
 *
 * La regla correcta no es "nunca entrar", es **"no entrar donde el de adentro
 * puede reclamarla"**, y se decide con las MISMAS métricas con las que deciden
 * los detectores, sin vecindario y sin estado compartido:
 *
 *   una función anidada RECLAMA la cadena  ⟺  su `metrics.cognitive` llega al
 *   piso de `complexity` (15) o su `metrics.chain` llega al de
 *   `conditional-chain` (5) — o, para `Guard Clauses`, que además ancla en
 *   `long-function`, si tiene 45 líneas o más.
 *
 * Si reclama, el de afuera no baja (y el de adentro la propone: una sola vez).
 * Si no reclama, el de afuera baja y la propone (una sola vez también, porque
 * el de adentro no va a tener hallazgo).
 *
 * LÍMITE DECLARADO: `duplication` es un ancla inter-file (huellas de clones) y
 * NO se puede calcular desde la función, así que una función anidada chica que
 * igual reciba un hallazgo de `duplication` puede volver a proponer la misma
 * cadena que el de afuera ya propuso. Es el resto que esta regla no cubre; se
 * eligió así porque el error contrario —perder la cadena entera— se midió y es
 * peor.
 */
/**
 * OJO CON LA IDENTIDAD DE LOS NODOS: `web-tree-sitter` devuelve un envoltorio
 * JS NUEVO en cada `child(i)`, así que un `Set<AstNode>` con los nodos que
 * guardó `fileUnitFrom` NUNCA da `has()` verdadero durante un recorrido
 * posterior. Se identifica por POSICIÓN + tipo, que sí es estable. (Costó dos
 * tests en rojo descubrirlo; queda escrito para que no lo pague nadie más.)
 */
function claveDeNodo(n: AstNode): string {
  return `${n.startPosition.row}:${n.startPosition.column}:${n.type}`;
}

function reclamanCadena(fn: FunctionUnit, file: FileUnit, incluirLargas: boolean): Set<string> {
  const out = new Set<string>();
  for (const otra of file.functions) {
    if (otra === fn || otra.node === fn.node) continue;
    if (!(fn.startLine <= otra.startLine && otra.endLine <= fn.endLine)) continue;
    const largaSuficiente = incluirLargas && otra.endLine - otra.startLine + 1 >= LONG_FUNCTION_FLOOR;
    if (otra.metrics.cognitive >= COMPLEXITY_FLOOR || otra.metrics.chain >= CHAIN_FLOOR || largaSuficiente) out.add(claveDeNodo(otra.node));
  }
  return out;
}

/** Recorre el subárbol de `fn` sin entrar en las funciones que RECLAMAN. */
function walkOwnScope(root: AstNode, bloqueadas: ReadonlySet<string>, visit: (n: AstNode) => void): void {
  const step = (n: AstNode, isRoot: boolean): void => {
    if (!isRoot && bloqueadas.has(claveDeNodo(n))) return;
    visit(n);
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i) as AstNode | null;
      if (c) step(c, false);
    }
  };
  step(root, true);
}

/**
 * Una cadena candidata, y si CUBRE TODOS LOS CASOS.
 *
 * `exhaustiva` es la condición que decide la CORRECCIÓN de la forma B, y la
 * encontró juzgar, no leer — ver `formaB`.
 */
interface Cadena {
  readonly branches: Branch[];
  readonly exhaustiva: boolean;
  /** `if` HERMANOS (pueden correr TODOS) vs. escalera/switch (corre uno). */
  readonly hermanos: boolean;
}

/** Arms de un switch, sin el `default` (que no tiene condición que unir). */
function switchBranches(container: AstNode): Branch[] {
  const out: Branch[] = [];
  const visit = (node: AstNode): void => {
    for (const child of namedChildren(node)) {
      const isWrapper = SWITCH_WORD.test(child.type) && SWITCH_WRAPPER_EXCLUDE.test(child.type);
      const isArm = SWITCH_WORD.test(child.type) && !SWITCH_ARM_EXCLUDE.test(child.type) && !isWrapper;
      if (!isArm) {
        visit(child);
        continue;
      }
      // El arm ENTERO, nunca `childForFieldName("body")`: ese campo es
      // REPETIDO en varias gramáticas (`switch_case` de JS/TS) y devuelve sólo
      // la primera sentencia — ver el comentario largo en
      // `lookup-table.ts#switchRungs`, mismo defecto, encontrado juzgando Ghost.
      out.push({ node: child, action: child, condition: null });
    }
  };
  visit(container);
  return out;
}

/** ¿El switch tiene arm `default`/`else`? Es lo que lo vuelve exhaustivo. */
function switchTieneDefault(container: AstNode): boolean {
  let found = false;
  walkTree(container, (raw) => {
    const n = raw as AstNode;
    if (!found && n.isNamed && SWITCH_WORD.test(n.type) && DEFAULT_ARM.test(n.type)) found = true;
  });
  return found;
}

/** `if` HERMANOS sobre el mismo nivel — la forma A canónica de Fowler ("varias
 *  guardas seguidas que devuelven lo mismo") vive acá, no en una escalera. */
function siblingIfGroups(fnNode: AstNode, sets: DerivedNodeSets, bloqueadas: ReadonlySet<string>): Branch[][] {
  const groups: Branch[][] = [];
  const visit = (node: AstNode): void => {
    const run: Branch[] = [];
    for (const child of namedChildren(node)) {
      if (isIfLike(child, sets) && !child.childForFieldName("alternative")) {
        const action = actionOf(child);
        if (action) {
          run.push({ node: child, action, condition: child.childForFieldName("condition") as AstNode | null });
          continue;
        }
      }
      if (run.length >= MIN_REPEATS) groups.push([...run]);
      run.length = 0;
    }
    if (run.length >= MIN_REPEATS) groups.push([...run]);
    // OLA AS, AS2 — no se desciende a funciones anidadas: los `if` hermanos de
    // un closure son del closure. Ver `walkOwnScope`.
    for (const child of namedChildren(node)) if (!bloqueadas.has(claveDeNodo(child))) visit(child);
  };
  visit(fnNode);
  return groups;
}



/* ── las dos formas ─────────────────────────────────────────────────────── */

/** FORMA A: >= 2 ramas de la MISMA cadena con cuerpo textualmente idéntico. */
/**
 * ¿El cuerpo compartido se puede unir cuando las ramas son `if` HERMANOS?
 *
 * ── EL FALSO QUE OBLIGÓ ESTA REGLA, encontrado JUZGANDO ────────────────────
 * `sqlalchemy lib/sqlalchemy/testing/fixtures/base.py:363 run_test`:
 *
 *     expected_committed = 0
 *     if begin_nested:  expected_committed += 1
 *     if not rollback:  expected_committed += 1
 *
 * Los dos cuerpos son el MISMO texto. Unirlos con `or` da **otro programa**:
 * cuando las dos condiciones valen, el original suma DOS y el consolidado
 * suma UNA. Y no es un caso raro — es la diferencia estructural entre una
 * ESCALERA y un grupo de HERMANOS: en la escalera las ramas son excluyentes
 * por construcción y a lo sumo corre una; entre hermanos pueden correr TODAS.
 *
 * La condición verificable, sin saber nada de la semántica:
 *   (a) el cuerpo TERMINA en un corte de flujo (`return`/`throw`/`break`/…),
 *       y entonces el original tampoco podía ejecutar más de uno; **o**
 *   (b) el cuerpo es sólo asignaciones IDEMPOTENTES: `=` pelado (nunca `+=`,
 *       `||=`, `<<=`) y sin ninguna invocación ni construcción, así que
 *       hacerlo dos veces y hacerlo una vez dan el mismo estado.
 *
 * (b) es lo que salva a `newtonsoft .../DefaultContractResolver.cs:1636`
 * (`allowNonPublicAccess = true;` en dos guardas seguidas), que es una
 * verdadera; (a) es lo que salva a las 12 guardas con `return` del corpus.
 * Lo que las dos rechazan es `context.report(...)` repetido en dos hermanos
 * (`eslint func-style.js:140`): ahí unir cambia cuántos reportes salen, y que
 * las dos condiciones sean excluyentes es una afirmación SEMÁNTICA que no se
 * puede verificar abriendo el archivo.
 */
const COMPOUND_ASSIGN = /(\+|-|\*|\/|%|&|\||\^|<<|>>|\*\*|\?\?|&&|\|\|)=[^=]/;

function cuerpoUnibleEntreHermanos(action: AstNode): boolean {
  const stmts = statementsOf(action);
  if (stmts.length === 0) return false;
  // (a) termina en un corte de flujo: a lo sumo una rama corría igual.
  if (FLOW_BREAK_WORD.test(stmts[stmts.length - 1]!.type)) return true;
  // (b) sólo asignaciones idempotentes.
  if (COMPOUND_ASSIGN.test(norm(action))) return false;
  let soloAsignaciones = true;
  for (const st of stmts) if (!/(^|_)assignment(_|$)/.test(st.type) && !/(^|_)expression_statement(_|$)/.test(st.type)) soloAsignaciones = false;
  if (!soloAsignaciones) return false;
  let hayEfecto = false;
  walkTree(action, (raw) => {
    const n = raw as AstNode;
    if (!hayEfecto && n.isNamed && (CALL_WORD.test(n.type) || /(^|_)(new|object_creation)(_|$)/.test(n.type))) hayEfecto = true;
  });
  return !hayEfecto;
}

/**
 * FORMA A: ramas CONSECUTIVAS de la misma cadena con el cuerpo textualmente
 * idéntico.
 *
 * ── LA ADYACENCIA, y los cuatro falsos que la obligaron ────────────────────
 * La versión vieja agrupaba por texto sin mirar la POSICIÓN, y unir dos ramas
 * que no son vecinas mueve una de ellas por encima de las del medio. Eso
 * cambia el programa cada vez que una rama del medio también podía dar:
 *
 *   · `eslint function-paren-newline.js:117` — `return hasLeftNewline` en la
 *     rama 1 y en la 3; la rama 2 del medio devuelve OTRA cosa y sus
 *     condiciones se solapan (`consistentOption` y `multilineOption` pueden
 *     ser las dos verdaderas). Unir 1 y 3 cambia qué devuelve.
 *   · `hugo resources/transform.go:607` — entre las dos ramas hay
 *     `tryFileCache = bcfg.UseResourceCache(err)`, que **muta lo que la
 *     segunda condición lee**.
 *   · `guava .../RegularImmutableMap.java:326` — `return null` en la rama 1 y
 *     en la 3; la del medio (`size == 1`) puede dar con `hashTableObject`
 *     nulo, y adelantar la 3 se la roba.
 *   · `Ghost .../relations/authors.js:375` — ramas 2 y 5 con
 *     `hasUserPermission = isOwner()`; que las del medio sean excluyentes es
 *     verdad SEMÁNTICA (roles y acciones), no de forma.
 *
 * Con la adyacencia exigida, esos cuatro se apagan y no se pierde ninguna de
 * las verdaderas: las 17 que sobrevivieron el juicio son todas vecinas.
 */
function formaA(branches: readonly Branch[], hermanos: boolean): { repeats: number; repeated: string; spots: { startLine: number; endLine: number }[] } | null {
  let best: { repeats: number; repeated: string; spots: { startLine: number; endLine: number }[] } | null = null;
  let i = 0;
  while (i < branches.length) {
    const b = branches[i]!;
    // El `else`/`default` no tiene condición que unir con nada.
    if (b.condition === null) { i += 1; continue; }
    const t = norm(b.action);
    if (t.length < MIN_BODY_CHARS) { i += 1; continue; }
    let j = i + 1;
    while (j < branches.length && branches[j]!.condition !== null && norm(branches[j]!.action) === t) j += 1;
    const run = branches.slice(i, j);
    if (run.length >= MIN_REPEATS && (!hermanos || cuerpoUnibleEntreHermanos(b.action)) && (!best || run.length > best.repeats)) {
      best = { repeats: run.length, repeated: t, spots: run.map((x) => ({ startLine: x.node.startPosition.row + 1, endLine: x.node.endPosition.row + 1 })) };
    }
    i = j > i + 1 ? j : i + 1;
  }
  return best;
}

/**
 * FORMA B: el primer o el último statement es el MISMO en TODAS las ramas.
 *
 * ── LA EXHAUSTIVIDAD, Y EL FALSO QUE LA OBLIGÓ ─────────────────────────────
 * Sacar el fragmento común AFUERA del condicional sólo conserva el
 * comportamiento si el condicional **cubre todos los casos**. Si no lo cubre,
 * el fragmento pasa a ejecutarse también cuando NINGUNA rama daba.
 *
 * Encontrado juzgando, no leyendo. `Ghost
 * koenig/koenig-lexical/src/components/ui/GifSelector.tsx:267 handleDown`
 * salió propuesto con la evidencia «las 2 ramas empiezan con el MISMO
 * fragmento: event.preventDefault()»:
 *
 *     function handleDown(event) {
 *       if (event.target.tagName === 'INPUT') { event.preventDefault(); ... }
 *       if (highlightedGif)                   { event.preventDefault(); ... }
 *     }
 *
 * Son dos `if` HERMANOS sin `else`. Subir `event.preventDefault()` arriba de
 * los dos lo llama en la tecla-abajo aunque no haya nada resaltado y el foco
 * no esté en el input: **cambia el comportamiento del navegador**. Y la
 * tentación estaba a diez líneas de distancia: `handleEnter`, en el mismo
 * archivo, SÍ lo tiene arriba — pero ésa es otra función con otra semántica.
 *
 * Por eso la forma B se aplica sólo a una escalera con `else` terminal o a un
 * `switch` con `default`. **Consecuencia declarada: la forma B queda apagada
 * para los grupos de `if` hermanos**, que es de donde salía este falso. La
 * forma A no necesita esta condición: unir dos ramas de la MISMA cadena no
 * agrega ningún caso nuevo.
 */
function formaB(branches: readonly Branch[], exhaustiva: boolean): { repeats: number; repeated: string; spots: { startLine: number; endLine: number }[] } | null {
  if (!exhaustiva) return null;
  if (branches.length < MIN_REPEATS) return null;
  const listas = branches.map((b) => statementsOf(b.action));
  if (listas.some((l) => l.length === 0)) return null;
  for (const extremo of ["first", "last"] as const) {
    const nodos = listas.map((l) => (extremo === "first" ? l[0]! : l[l.length - 1]!));
    // Una rama de UN solo statement que además es el fragmento común no es
    // "un fragmento repetido dentro de ramas distintas": es la forma A.
    if (listas.some((l) => l.length < 2)) continue;
    const textos = nodos.map(norm);
    if (textos[0]!.length < MIN_BODY_CHARS) continue;
    if (textos.every((t) => t === textos[0])) {
      return {
        repeats: branches.length,
        repeated: textos[0]!,
        spots: nodos.map((n) => ({ startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1 })),
      };
    }
  }
  return null;
}

function hallazgoDe(problem: Problem, ctx: HypothesisContext): Hallazgo | null {
  if (!ctx.file) return null;
  const fn = findEnclosingFunction(ctx.file, problem);
  if (!fn) return null;
  const sets = ctx.setsFor(ctx.file.language);
  const file = ctx.file.path;

  const cadenas: Cadena[] = [];
  // OLA AS, AS2 — `walkOwnScope`, no `walkTree`: una cadena que vive adentro de
  // un closure le pertenece al closure. Ver el docstring de `walkOwnScope`.
  const bloqueadas = reclamanCadena(fn, ctx.file, false);
  walkOwnScope(fn.node, bloqueadas, (raw) => {
    const node = raw as AstNode;
    if (!node.isNamed) return;
    if (sets.switchContainerNodes.has(node.type)) cadenas.push({ branches: switchBranches(node), exhaustiva: switchTieneDefault(node), hermanos: false });
    else if (isIfLike(node, sets) && node.childForFieldName("alternative")) {
      const branches = ladderBranches(node);
      // El `else` terminal entra en `ladderBranches` como una rama SIN
      // condición: su presencia ES la exhaustividad de la escalera.
      cadenas.push({ branches, exhaustiva: branches.some((b) => b.condition === null), hermanos: false });
    }
  });
  // Un grupo de `if` hermanos NUNCA es exhaustivo: no hay `else` que lo cierre.
  for (const g of siblingIfGroups(fn.node, sets, bloqueadas)) cadenas.push({ branches: g, exhaustiva: false, hermanos: true });

  let best: Hallazgo | null = null;
  for (const { branches, exhaustiva, hermanos } of cadenas) {
    if (branches.length < MIN_REPEATS) continue;
    const effectful = branches.filter(headerHasWork).length;
    const a = formaA(branches, hermanos);
    const b = a ? null : formaB(branches, exhaustiva);
    const hit = a ?? b;
    if (!hit) continue;
    const cand: Hallazgo = {
      forma: a ? "A" : "B",
      owner: ownerAnchor(fn),
      branches,
      repeats: hit.repeats,
      repeated: hit.repeated,
      effectful,
      fnName: fn.name,
      file,
      startLine: Math.min(...branches.map((x) => x.node.startPosition.row + 1)),
      endLine: Math.max(...branches.map((x) => x.node.endPosition.row + 1)),
      spots: hit.spots,
    };
    if (!best || cand.repeats > best.repeats) best = cand;
  }
  return best;
}

/* ── los checks ─────────────────────────────────────────────────────────── */

/**
 * EL ANCLA DUEÑA — el desempate, y por qué hace falta.
 *
 * MEDIDO, no supuesto: en la primera corrida sobre `corpus/cobra` la MISMA
 * repetición de `command.go:989-991` salió propuesta DOS VECES, una por el
 * `Finding` de `duplication` y otra por el de `complexity`, con texto
 * idéntico. Una función grande dispara varias anclas a la vez y sin desempate
 * el producto publica la misma propuesta N veces.
 *
 * La regla no pregunta "¿qué otras anclas dispararon?" (el vecindario llega
 * vacío en `build()`, ver `hypotheses/run.ts`): lee las MÉTRICAS de la función
 * encerrante, que son las MISMAS con las que los detectores deciden, y aplica
 * una prioridad fija. `duplication` queda de último porque su disparo no se
 * puede calcular desde la función (es inter-file, sobre huellas de clones):
 * es el dueño sólo cuando ninguna de las dos anclas calculables dispara.
 */
function ownerAnchor(fn: FunctionUnit): string {
  if (fn.metrics.chain >= CHAIN_FLOOR) return "conditional-chain"; // piso real de `detect/intra-function/conditional-chain.ts`
  if (fn.metrics.cognitive >= COMPLEXITY_FLOOR) return "complexity"; // `citado(15, SonarSource S3776)`
  return "duplication";
}

const SOURCE = "https://refactoring.guru/es/consolidate-conditional-expression";
const TO_CONFIRM: readonly string[] = [
  "¿las condiciones son de verdad UNA sola pregunta, o son independientes y mañana una va a hacer otra cosa? refactoring.guru lo dice explícitamente: si son independientes, unirlas las acopla.",
  "¿el cuerpo repetido es el mismo POR CASUALIDAD (dos `return null` sin relación) o porque las ramas responden lo mismo? La igualdad de texto no distingue las dos cosas.",
  "¿alguna condición depende del orden de evaluación de la anterior? Al unirlas con Y/O el cortocircuito cambia cuándo se evalúa cada una.",
];

type Ctx = { readonly h: Hallazgo | null };

const cuerpoRepetido: Check<Ctx, Graph> = {
  id: "cuerpo-repetido-identico",
  describe: `al menos ${MIN_REPEATS} ramas de la MISMA cadena comparten cuerpo textual idéntico (forma A), o todas comparten el mismo fragmento en un extremo (forma B)`,
  run: (c) =>
    !c.h
      ? { holds: false, evidence: "no se encontró ninguna cadena con cuerpo repetido (sin árbol vivo, sin función, o ninguna repetición): no demostrado." }
      : {
          holds: c.h.repeats >= MIN_REPEATS,
          evidence:
            c.h.forma === "A"
              ? `${c.h.repeats} ramas de la misma cadena tienen el MISMO cuerpo: «${c.h.repeated.slice(0, 80)}».`
              : `las ${c.h.repeats} ramas empiezan o terminan con el MISMO fragmento: «${c.h.repeated.slice(0, 80)}».`,
        },
};

const sinEfectosEnLasCondiciones: Check<Ctx, Graph> = {
  id: "sin-efectos-en-las-cabeceras",
  describe: "ninguna rama invoca, declara ni muta en su condición o en su inicializador (si lo hiciera, unirlas cambiaría qué se ejecuta — y en Go el modismo `if x := f(); err != nil` es exactamente eso)",
  run: (c) =>
    !c.h
      ? { holds: false, evidence: "sin hallazgo: no demostrado." }
      : { holds: c.h.effectful === 0, evidence: `${c.h.effectful}/${c.h.branches.length} ramas con invocación, declaración o mutación en su cabecera.` },
};

const cuerpoConSustancia: Check<Ctx, Graph> = {
  id: "cuerpo-con-sustancia",
  describe: `lo repetido tiene al menos ${MIN_BODY_CHARS} caracteres (dos \`return\` pelados coinciden por azar en cualquier archivo)`,
  run: (c) =>
    !c.h
      ? { holds: false, evidence: "sin hallazgo: no demostrado." }
      : { holds: c.h.repeated.length >= MIN_BODY_CHARS, evidence: `${c.h.repeated.length} caracteres, piso ${MIN_BODY_CHARS}.` },
};

function anclaDuena(problem: Problem): Check<Ctx, Graph> {
  return {
    id: "ancla-duena",
    describe: "este hallazgo es el ancla DUEÑA de este lugar (una función grande dispara varias anclas y sin desempate la misma propuesta sale repetida)",
    run: (c) =>
      !c.h
        ? { holds: false, evidence: "sin hallazgo: no demostrado." }
        : { holds: problem.kind === c.h.owner, evidence: `dueño "${c.h.owner}" (por las métricas de la función); este hallazgo es "${problem.kind}".` },
  };
}

const muchasRepeticiones: Check<Ctx, Graph> = {
  id: "muchas-repeticiones",
  describe: `${MANY_REPEATS} o más ramas involucradas`,
  run: (c) => (!c.h ? { holds: false, evidence: "sin hallazgo." } : { holds: c.h.repeats >= MANY_REPEATS, evidence: `${c.h.repeats} ramas (>= ${MANY_REPEATS} sube un peldaño).` }),
};

const cadenaCorta: Check<Ctx, Graph> = {
  id: "toda-la-cadena-involucrada",
  describe: "la repetición cubre TODAS las ramas de la cadena (no un par suelto dentro de una cadena larga)",
  run: (c) => (!c.h ? { holds: false, evidence: "sin hallazgo." } : { holds: c.h.repeats === c.h.branches.length, evidence: `${c.h.repeats} de ${c.h.branches.length} ramas.` }),
};

const cuerpoGrande: Check<Ctx, Graph> = {
  id: "repeticion-grande",
  describe: "lo repetido tiene más de 40 caracteres (cuanto más grande, menos plausible la coincidencia)",
  run: (c) => (!c.h ? { holds: false, evidence: "sin hallazgo." } : { holds: c.h.repeated.length > 40, evidence: `${c.h.repeated.length} caracteres.` }),
};

/** SIEMPRE `"ausente"` — ver la trampa #2 en el docstring del módulo. */
function appliedState(): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "la consolidación no está hecha",
        passed: true,
        why: "por definición: el `required` que dispara esta hipótesis es la EXISTENCIA de la repetición. Si estuviera consolidada, no habría repetición que encontrar y `build()` devolvería null.",
      },
    ],
  };
}

function buildSpec(problem: Problem): HypothesisSpec<Ctx, Graph> {
  return {
    pattern: "Consolidate Conditional",
    ceiling: "alta",
    needs: [],
    // `ancla-duena` va ÚLTIMO a propósito: el motor exige que TODOS pasen, así
    // que el orden no cambia ningún veredicto, pero `diesAt` de la traza es el
    // PRIMERO que falla y con el desempate adelante el embudo taparía dónde
    // muere de verdad la forma.
    required: [cuerpoRepetido, cuerpoConSustancia, sinEfectosEnLasCondiciones, anclaDuena(problem)],
    discriminators: [muchasRepeticiones, cadenaCorta, cuerpoGrande],
    appliedState: () => appliedState(),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── la traza ───────────────────────────────────────────────────────────── */

export interface ConsolidateTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly withFile: boolean;
  readonly forma: string;
  readonly owner: string;
  readonly repeats: number;
  readonly branches: number;
  readonly chars: number;
  readonly effectful: number;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly emitted: boolean;
}

let trace: ConsolidateTraceEntry[] | null = null;
export function startConsolidateTrace(): void {
  trace = [];
}
export function takeConsolidateTrace(): readonly ConsolidateTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function placesOf(h: Hallazgo): readonly RoleLocation[] {
  return h.spots.map((s, i) => ({
    file: h.file,
    startLine: s.startLine,
    endLine: s.endLine,
    symbol: h.fnName ?? undefined,
    role: h.forma === "A" ? `rama ${i + 1} de ${h.repeats} con el mismo cuerpo` : `fragmento repetido ${i + 1} de ${h.repeats}`,
  }));
}

export const hypothesis: HypothesisBuilder = {
  id: "consolidate-conditional",
  pattern: "Consolidate Conditional",
  layer: "refactorizacion",
  anchors: ["complexity", "conditional-chain", "duplication"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const h = hallazgoDe(problem, ctx);
    const c: Ctx = { h };
    const spec = buildSpec(problem);
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
        forma: h?.forma ?? "-",
        owner: h?.owner ?? "-",
        repeats: h?.repeats ?? 0,
        branches: h?.branches.length ?? 0,
        chars: h?.repeated.length ?? 0,
        effectful: h?.effectful ?? 0,
        checks,
        diesAt: checks.find((k) => !k.holds)?.id ?? null,
        emitted: outcome !== null,
      });
    }
    if (!outcome || !h) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(h),
      cost:
        h.forma === "A"
          ? "Unir las condiciones con O y dejar un solo cuerpo. Es una línea menos por rama y no toca ninguna firma; " +
            "el riesgo entero está en si las condiciones eran de verdad la misma pregunta."
          : "Sacar el fragmento común fuera del condicional (antes si está al principio, después si está al final). " +
            "No toca ninguna firma; el riesgo está en si el fragmento depende de algo que la rama define.",
    });
  },
};
