/**
 * `Remove Dead Code` — OLA AS, frente AS5. La familia con la precondición más
 * dura de toda la ola: **si es inalcanzable, es inalcanzable**. No hay opinión
 * de diseño que dos revisores puedan discutir, que es exactamente el criterio
 * que AR4 §5 dejó escrito para separar lo medible (`Extract Method`, 73,6 %)
 * de lo que no se distingue del ruido (los 17 patrones, 17,9 % con ±8-12
 * puntos de barra de juez).
 *
 * Tres anclas que YA existen, y **tres caminos que no comparten ni un check**
 * — mismo reparto que `extract-method.ts` hace entre `long-function` y
 * `complexity`, y por la misma razón: lo que hace verdadera a una propuesta
 * de "borrá estas sentencias" no se parece a lo que hace verdadera a una de
 * "borrá este símbolo".
 *
 *   A. `unreachable-code` — el flujo ya salió del bloque; lo que sigue no se
 *      ejecuta nunca.
 *   B. `unused-symbol`   — un símbolo declarado que nadie consume.
 *   C. `unused-variable` — una variable local declarada y nunca leída.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EL RIESGO DE ESTA FAMILIA NO ES LA PRECISIÓN: ES BORRAR API PÚBLICA
 * ═══════════════════════════════════════════════════════════════════════════
 * El encargo de la ola lo nombra con todas las letras: *"código 'muerto' que
 * en realidad es API pública de una biblioteca, exportado para consumidores
 * externos. En un corpus con 13 bibliotecas eso es enorme. Sin una compuerta
 * de visibilidad pública vas a proponer borrar la API de guava."*
 *
 * `unused-symbol.ts` ya midió por qué NO puede poner esa compuerta él mismo:
 * descartar los símbolos expuestos "dejaba java y csharp en UN hallazgo cada
 * uno", así que ahí la exposición es sólo una REBAJA DE CONFIANZA. Un
 * detector no puede permitirse quedarse sin volumen; **una hipótesis sí**, y
 * es la diferencia entre las dos capas: el detector afirma "nadie lo
 * referencia dentro del repo" (cierto) y la hipótesis afirma "se puede
 * borrar" (que es falso para todo símbolo exportado).
 *
 * ── LA COMPUERTA DE VISIBILIDAD ES UN DISCRIMINADOR, NO UN `required` ──────
 * **OLA AX, ATERRIZAJE — Y NO ES UNA OPINIÓN, ESTÁ MEDIDO.** El diseño
 * original de AS5 la puso como `required` #1 del camino B (`exposure ===
 * "confinada"` o silencio). AX2 la midió sobre el árbol real, los 21 repos y
 * los 280 hallazgos de `unused-symbol` que la PUERTA 8 dejó vivos:
 *
 *   · **CON la compuerta como `required`: 2 de 18 = 11,1 %**, y emite en UN
 *     lenguaje de seis — los dos repos de C#. Los cinco repos que miden
 *     70-100 % en el ancla reciben CERO propuestas.
 *   · **SIN ella: 47,2 % [40,3 · 54,2]** como remedio (58,5 % como hallazgo),
 *     **280 propuestas, 15 repos, los SEIS lenguajes**.
 *
 * LA CAUSA, y por eso la degradación es un arreglo y no un aflojamiento: la
 * compuerta **exige un dato que dos gramáticas no producen**. En
 * ruby/python/typescript/javascript la exposición sale `sin-dato` en **309 de
 * 309** candidatos, y `sin-dato` la reprueba. Ruby solo es el 52 % de la
 * población (146 de 280) y quedaba apagado entero. No es un umbral mal
 * puesto: es un `required` que le pide a la gramática algo que no tiene.
 *
 * Y NO ES UNA IDEA NUEVA: `unused-symbol.ts:144-158` ya había recorrido este
 * mismo camino en el DETECTOR y había degradado la misma regla de filtro a
 * rebaja de confianza, con su razón escrita ("descartar los expuestos dejaba
 * java y csharp en UN hallazgo cada uno"). Esta hipótesis la había vuelto a
 * ascender a `required` duro sin re-medirla.
 *
 * **DEGRADADA, NO BORRADA:** sigue viva como DISCRIMINADOR, o sea le BAJA la
 * confianza a la propuesta cuando el símbolo es superficie pública — que es
 * exactamente lo que la evidencia sostiene. El riesgo que el encargo de AS5
 * nombraba (proponer borrar la API de guava) no desaparece: **se marca en la
 * confianza y se dice en `toConfirm`, en vez de silenciar cuatro lenguajes.**
 * Y sobre `guava` en concreto el riesgo hoy es nulo por otra vía: tras la
 * PUERTA 8 el ancla emite **CERO hallazgos en guava** (AX2 §8.1).
 *
 * LO QUE ESTA DEGRADACIÓN **NO** ARRASTRA, dicho porque AX2 lo dejó escrito:
 * la EMISIÓN es idéntica a la que AX2 midió (midió con el interruptor
 * `medirSinCompuertaDeVisibilidad`, que hace **pasar** el cheque en vez de
 * sacarlo del `required`: misma condición de corte, y por eso el 1:1 con el
 * ancla vale), pero **la etiqueta de confianza `baja`/`media`/`alta` de cada
 * propuesta NO está re-medida** — con el interruptor el cheque contaba como
 * un `required` que pasó, y como discriminador suma o resta confianza.
 * La cuenta original de la compuerta está en `ola-as/informes/AS5.md`; la
 * medición que la degrada, en `ola-ax/informes/AX2.md` §16.2-16.3.
 *
 * ── LA OTRA COMPUERTA, LA DEL CAMINO C: EFECTOS OBSERVABLES ────────────────
 * refactoring.guru, en "Cuándo NO conviene" de la eliminación de código
 * muerto, dice lo mismo que cualquier revisor: `const x = hacerAlgo();` sin
 * uso NO es una línea que se borra — borrarla borra la LLAMADA, y la llamada
 * puede ser lo único que importa. El camino C exige que el inicializador de
 * la variable no contenga ninguna construcción con efecto (llamada,
 * instanciación, `await`, asignación): cuando lo contiene, el remedio correcto
 * es otro (extraer la llamada, no borrar la línea) y esta familia se calla.
 *
 * ── QUÉ NO PUEDE ESTA FAMILIA, DICHO ANTES DE MEDIR ────────────────────────
 * El camino A no tiene forma de `ya-aplicado`: si el tramo muerto ya se
 * hubiera borrado, no habría hallazgo. El camino B tampoco: un símbolo cuyo
 * reemplazo vivo existe en otro archivo sigue habiendo que borrarlo. Los dos
 * lo declaran en su `appliedState` con un check `applied` en `false` y la
 * razón escrita, en vez de fingir que se buscó algo. La única forma de
 * "solución que ya vive en otro lado" que sí es real —el tramo muerto es
 * copia de código VIVO en la misma función— entra como DISCRIMINADOR (sube la
 * confianza: borrar es seguro porque la copia viva queda), nunca como estado.
 *
 * ── NADA HARDCODEADO POR LENGUAJE ──────────────────────────────────────────
 * Cero listas de tipos de nodo por lenguaje. Los conjuntos salen de
 * `ctx.setsFor(language)`; la exposición sale de `CodeGraphNode.visibility`/
 * `exported` (que `graph/symbols.ts` ya deriva de la gramática) más la regla
 * de la ESPECIFICACIÓN de Go sobre la mayúscula inicial —la misma fuente y el
 * mismo criterio que `unused-symbol.ts#exposureOf` documenta—; y la única
 * superficie de vocabulario propia son dos regex GENÉRICAS sobre el TIPO de
 * nodo (`EFFECT_NODE_WORD`, `REFERENCE_NODE_TYPES`) aplicadas IDÉNTICAMENTE a
 * las nueve gramáticas, mismo estilo que `LOOP_WORD`/`EXCEPTION_WORD`/
 * `SWITCH_WORD` de `code-grammar.ts` y que el `JUMP_WORD` que
 * `unreachable-code.ts` ya usa y justifica.
 */
import { walkTree } from "../detect/tree-walk.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import { symbolNodeId } from "../graph/types.js";
import type { AstNode, Finding, FunctionUnit } from "../detect/types.js";
import type { CodeGraph, CodeGraphNode } from "../graph/types.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

const UNREACHABLE_KIND = "unreachable-code";
const UNUSED_SYMBOL_KIND = "unused-symbol";
const UNUSED_VARIABLE_KIND = "unused-variable";
const PATTERN = "Remove Dead Code";
const SOURCE = "https://refactoring.guru/es/smells/dead-code";

/**
 * Construcciones con EFECTO OBSERVABLE — regex GENÉRICA sobre el TIPO de
 * nodo, aplicada IDÉNTICAMENTE a las nueve gramáticas, nunca una lista por
 * lenguaje. Cubre, por sonda directa sobre las gramáticas reales:
 * `call_expression` (JS/TS/Go/Python), `call` (Ruby/Python),
 * `method_invocation` (Java), `invocation_expression` (C#),
 * `object_creation_expression` (Java/C#), `new_expression` (JS/TS),
 * `await_expression`, `yield`, `assignment_expression`/`assignment`,
 * `augmented_assignment`, `update_expression`.
 */
const EFFECT_NODE_WORD = /(^|_)(call|invocation|creation|new|await|yield|assignment|augmented|update)(_|$)/;

/** Referencia a un nombre ya ligado — mismo criterio (y misma justificación de
 *  `shorthand_property_identifier`) que `unused-variable.ts#USAGE_REFERENCE_TYPES`. */
const REFERENCE_NODE_TYPES: ReadonlySet<string> = new Set(["identifier", "shorthand_property_identifier"]);

/**
 * LAS DOS ARISTAS QUE NO SON UN USO — y la segunda casi mata esta familia
 * entera, medida sobre `click`.
 *
 *  · `contains` es "quién te declara", no "quién te usa" — la misma exclusión,
 *    por el mismo motivo, que `unused-symbol.ts` ya documenta.
 *  · `affects` sale de un nodo de HALLAZGO, no de código:
 *    `graph/finding-nodes.ts#attachFindingNodes` ensancha el grafo con un nodo
 *    por `Finding` y le cuelga un `affects` hacia el símbolo que ese hallazgo
 *    señala, ANTES de que las hipótesis corran (`code-analyzer.ts#crossAnalyze`).
 *    Consecuencia: **todo símbolo con un hallazgo tiene, por construcción, al
 *    menos un `affects` entrante** — y el símbolo de un `unused-symbol` SIEMPRE
 *    tiene uno. Medido: en `click`, los 17 candidatos tenían exactamente
 *    `affects/declared` ×1 a ×3 y NINGUNA otra arista; sin esta exclusión el
 *    camino B emitía CERO en todo el corpus por un artefacto del propio
 *    análisis, no por una propiedad del código.
 */
const ARTIFACT_EDGE_KINDS: ReadonlySet<string> = new Set(["contains", "affects"]);

/** Primera letra mayúscula Unicode — la regla de exportación de la
 *  especificación de Go (https://go.dev/ref/spec#Exported_identifiers), la
 *  misma fuente que `unused-symbol.ts#exposureOf` cita. */
const UPPERCASE_FIRST = /^\p{Lu}/u;

/**
 * Salto de control — regex GENÉRICA sobre el TIPO de nodo, la MISMA que
 * `unreachable-code.ts` usa y justifica (`return_statement`, `throw_statement`,
 * `raise_statement`, `break_statement`, `continue_statement`…). Se repite acá
 * porque ese módulo la tiene privada y esta ola no toca `detect/**`.
 */
const JUMP_WORD = /(^|_)(return|throw|raise|break|continue|goto)(_|$)/;

/**
 * CLÁUSULA DE MANEJO — regex GENÉRICA sobre el TIPO de nodo, aplicada
 * IDÉNTICAMENTE a las nueve gramáticas, y la compuerta que salva al camino A
 * de su peor falso positivo MEDIDO en esta ola.
 *
 * En Ruby el `rescue`/`ensure` de nivel de método es HERMANO de las sentencias
 * del cuerpo dentro del mismo `body_statement`, así que después de un
 * `return` el árbol lo deja como "el hermano siguiente a un salto" — que es
 * exactamente lo que `unreachable-code.ts` llama inalcanzable. Pero un
 * manejador NO se alcanza por caída secuencial: se alcanza cuando el cuerpo
 * levanta. Tres casos medidos, los tres proponiendo borrar el manejo de
 * errores de un método: `redmine/app/controllers/application_controller.rb:727`,
 * `redmine/app/jobs/destroy_project_job.rb:49` y
 * `redmine/app/models/webhook.rb:67`. Cubre además `finally`/`ensure` de las
 * otras gramáticas, con la misma regla y sin nombrar ningún lenguaje.
 */
const HANDLER_WORD = /(^|_)(rescue|ensure|except|catch|finally|else)(_|$)/;

/**
 * NODO QUE LA GRAMÁTICA NO PUDO ARMAR. `ERROR` es el tipo universal de
 * tree-sitter para un tramo que no encaja en ninguna regla — no es una lista
 * por lenguaje. Se excluye porque un tramo que el parser no entendió no es
 * una sentencia, y proponer borrarlo es proponer borrar texto que ni siquiera
 * se sabe qué es. Caso medido:
 * `ShareX/ShareX.ImageEditor/Presentation/EasterEggs/InfiniteFoldEffect.cs:135`,
 * donde el "código muerto" son las dos últimas líneas de un *shader* dentro de
 * una cadena literal cruda (`"""…"""`).
 */
const ERROR_NODE_TYPE = "ERROR";

/* ── UBICACIÓN EN EL ÁRBOL, SIN `.parent()` ─────────────────────────────────
 *
 * `ProbeNode` no expone padre ni hermanos (`code-grammar.ts:153-159`), y
 * `walkTree` recorre sin llevar el camino. `ancestorsOf` desciende SÓLO por
 * los hijos cuyo rango contiene al objetivo, así que devuelve la cadena de
 * ancestros exacta en O(profundidad) sin recorrer el árbol entero — es una
 * consulta dirigida, no un recorrido alternativo al de `tree-walk.ts` (que
 * sigue siendo el que se usa acá para todo lo que sí es "recorrer entero").
 * La contención se decide por (fila, columna), nunca sólo por línea: un
 * `try { f() } catch (e) {}` de una sola línea rompería cualquier
 * comparación por línea. */

function before(aRow: number, aCol: number, bRow: number, bCol: number): boolean {
  return aRow < bRow || (aRow === bRow && aCol <= bCol);
}

/**
 * IDENTIDAD POR POSICIÓN, no por referencia. `AstNode.child(i)` puede
 * devolver un OBJETO NUEVO en cada llamada (la envoltura de `web-tree-sitter`
 * no garantiza identidad estable), así que `===` entre dos vistas del mismo
 * nodo del árbol es `false` — medido en el humo de esta ola: el discriminador
 * `declaracion-completamente-inerte` daba `false` sobre `const inert = 42`
 * porque el hijo `identifier` recuperado por `child(i)` no era `===` al
 * mismo `identifier` que había devuelto `walkTree`. Tipo + rango exacto
 * (fila, columna) identifica un nodo del árbol sin depender de eso.
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

function contains(outer: AstNode, inner: AstNode): boolean {
  return (
    before(outer.startPosition.row, outer.startPosition.column, inner.startPosition.row, inner.startPosition.column) &&
    before(inner.endPosition.row, inner.endPosition.column, outer.endPosition.row, outer.endPosition.column)
  );
}

function ancestorsOf(root: AstNode, target: AstNode): AstNode[] {
  const chain: AstNode[] = [];
  let current: AstNode = root;
  for (;;) {
    if (sameNode(current, target)) return chain;
    let next: AstNode | null = null;
    for (let i = 0; i < current.childCount; i++) {
      const child = current.child(i) as AstNode | null;
      if (!child) continue;
      if (sameNode(child, target) || contains(child, target)) {
        next = child;
        break;
      }
    }
    if (!next) return chain;
    chain.push(current);
    current = next;
  }
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child && child.isNamed) out.push(child);
  }
  return out;
}

/** La función del `FileUnit` que contiene el rango del hallazgo, la más chica
 *  cuando hay closures anidados. `null` = el hallazgo no cae dentro de
 *  ninguna función viva de esta corrida. */
function enclosingFunction(ctx: HypothesisContext, startLine: number, endLine: number): FunctionUnit | null {
  const file = ctx.file;
  if (!file) return null;
  let best: FunctionUnit | null = null;
  let bestSpan = Number.POSITIVE_INFINITY;
  for (const fn of file.functions) {
    if (fn.startLine > startLine || fn.endLine < endLine) continue;
    const span = fn.endLine - fn.startLine;
    if (span < bestSpan) {
      best = fn;
      bestSpan = span;
    }
  }
  return best;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CAMINO A — `unreachable-code`
 * ═══════════════════════════════════════════════════════════════════════════ */

interface UnreachableShape {
  readonly treeAvailable: boolean;
  readonly spanLocated: boolean;
  /** Sentencias reales dentro del tramo inalcanzable, contadas sobre el árbol. */
  readonly deadStatements: number;
  /** Nombres DECLARADOS dentro del tramo que se referencian FUERA de él, dentro de la misma función. */
  readonly escapingNames: readonly string[];
  /** El tramo declara algún nombre (aunque no se use afuera). */
  readonly declaresNames: boolean;
  /** El tramo contiene lógica de verdad (rama, bucle o llamada), no sólo un retorno pelado. */
  readonly hasLogic: boolean;
  /** Alguna sentencia del tramo aparece, con el mismo texto normalizado, VIVA en la misma función. */
  readonly liveTwin: boolean;
  /** Algún nodo TOP del tramo es una cláusula de manejo (`rescue`/`ensure`/`finally`/…): no se alcanza por caída. */
  readonly deadSpanIsHandler: boolean;
  /** Algún nodo del tramo es un `ERROR` de la gramática: el parser no pudo armarlo. */
  readonly deadSpanHasError: boolean;
  /** Hay un salto de control, HERMANO y ANTERIOR al tramo dentro del mismo bloque — la afirmación del ancla, re-verificada. */
  readonly jumpBeforeInSameBlock: boolean;
}

const UNREACHABLE_UNKNOWN: UnreachableShape = {
  treeAvailable: false,
  spanLocated: false,
  deadStatements: 0,
  escapingNames: [],
  declaresNames: false,
  hasLogic: false,
  liveTwin: false,
  deadSpanIsHandler: false,
  deadSpanHasError: false,
  jumpBeforeInSameBlock: false,
};

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function analyzeUnreachable(problem: Finding, ctx: HypothesisContext): UnreachableShape {
  if (!ctx.file) return UNREACHABLE_UNKNOWN;
  const loc = problem.locations[0];
  const fn = enclosingFunction(ctx, loc.startLine, loc.endLine);
  if (!fn) return { ...UNREACHABLE_UNKNOWN, treeAvailable: true };

  const sets = ctx.setsFor(fn.language);
  const inSpan = (node: AstNode): boolean =>
    node.startPosition.row + 1 >= loc.startLine && node.endPosition.row + 1 <= loc.endLine;

  const deadTop: AstNode[] = [];
  const inSpanNodes: AstNode[] = [];
  const declaredInSpan = new Set<string>();
  const referencesOutside = new Map<string, number>();
  const liveTexts = new Set<string>();
  let hasLogic = false;
  let spanHasError = false;

  // Un solo recorrido de la función: el árbol vivo se paga una vez.
  walkTree(fn.node, (raw) => {
    const node = raw as AstNode;
    if (!node.isNamed) return;
    if (inSpan(node)) {
      inSpanNodes.push(node);
      if (node.type === ERROR_NODE_TYPE) spanHasError = true;
      if (node.childForFieldName("name") !== null) {
        const nameNode = node.childForFieldName("name") as AstNode;
        declaredInSpan.add(nameNode.text);
      }
      if (sets.branchNodes.has(node.type) || sets.chainNodes.has(node.type) || EFFECT_NODE_WORD.test(node.type)) {
        hasLogic = true;
      }
      return;
    }
    if (REFERENCE_NODE_TYPES.has(node.type)) {
      referencesOutside.set(node.text, (referencesOutside.get(node.text) ?? 0) + 1);
    }
    liveTexts.add(normalize(node.text));
  });

  // Las sentencias TOP del tramo: los nodos MAXIMALES entre los que caen
  // enteramente dentro del rango (los que ningún otro nodo del tramo
  // contiene). Se resuelve ordenando por posición, sin una segunda pasada
  // sobre el árbol y sin una cadena de ancestros por nodo.
  inSpanNodes.sort((a, b) => {
    if (a.startPosition.row !== b.startPosition.row) return a.startPosition.row - b.startPosition.row;
    if (a.startPosition.column !== b.startPosition.column) return a.startPosition.column - b.startPosition.column;
    if (a.endPosition.row !== b.endPosition.row) return b.endPosition.row - a.endPosition.row;
    return b.endPosition.column - a.endPosition.column;
  });
  for (const node of inSpanNodes) {
    const last = deadTop[deadTop.length - 1];
    if (last && contains(last, node)) continue;
    deadTop.push(node);
  }

  const escaping = [...declaredInSpan].filter((name) => (referencesOutside.get(name) ?? 0) > 0);
  const liveTwin = deadTop.some((s) => liveTexts.has(normalize(s.text)));
  // LA CLÁUSULA DE MANEJO — ver `HANDLER_WORD`. Se pregunta por las dos vías
  // que el proyecto ya usa para lo mismo: el conjunto que la propia gramática
  // derivó (`ctx.setsFor(...).exceptionNodes`, el mismo que usa
  // `handle-empty-catch.ts`) y la regex genérica sobre el tipo de nodo, que
  // agrega `ensure`/`finally` —que no llevan la palabra del `EXCEPTION_WORD`
  // de `code-grammar.ts`— sin nombrar ningún lenguaje.
  const deadSpanIsHandler = deadTop.some((n) => sets.exceptionNodes.has(n.type) || HANDLER_WORD.test(n.type));

  // LA AFIRMACIÓN DEL ANCLA, RE-VERIFICADA: tiene que existir un salto de
  // control HERMANO del tramo y ANTERIOR a él dentro del MISMO bloque. Es
  // literalmente lo que `unreachable-code.ts` dice haber encontrado, y sin
  // esto la hipótesis hereda ciegamente sus falsos positivos — dos de ellos
  // MEDIDOS en esta ola, los dos peligrosos porque proponen borrar el retorno
  // NORMAL de una función: `preact/debug/src/debug.js:53`
  // (`getClosestDomNodeParentName`, el `return` de caída) y
  // `preact/compat/src/hooks.js:77-81` (`useEffectEvent`, el único `return`
  // de la función). En los dos, los hermanos anteriores del tramo dentro del
  // bloque son declaraciones y condicionales, ningún salto.
  const first = deadTop[0];
  let jumpBefore = false;
  if (first) {
    const chain = ancestorsOf(fn.node, first);
    const block = chain[chain.length - 1];
    if (block) {
      for (const sibling of namedChildren(block)) {
        if (!before(sibling.endPosition.row, sibling.endPosition.column, first.startPosition.row, first.startPosition.column)) continue;
        if (JUMP_WORD.test(sibling.type)) jumpBefore = true;
      }
    }
  }

  return {
    treeAvailable: true,
    spanLocated: true,
    deadStatements: deadTop.length,
    escapingNames: escaping,
    declaresNames: declaredInSpan.size > 0,
    hasLogic,
    liveTwin,
    deadSpanIsHandler,
    deadSpanHasError: spanHasError,
    jumpBeforeInSameBlock: jumpBefore,
  };
}

interface UnreachableProblem {
  readonly finding: Finding;
  readonly shape: UnreachableShape;
}

const tramoVisible: Check<UnreachableProblem, CodeGraph | null> = {
  id: "tramo-inalcanzable-visible-en-el-arbol",
  describe: "El tramo que el hallazgo declara inalcanzable se ubica en el árbol y contiene sentencias reales",
  run(problem) {
    const s = problem.shape;
    if (!s.treeAvailable) return { holds: false, evidence: "el árbol del archivo no está vivo en esta corrida: nada que verificar." };
    if (!s.spanLocated) return { holds: false, evidence: "el rango del hallazgo no cae dentro de ninguna función viva de esta corrida." };
    if (s.deadStatements === 0) return { holds: false, evidence: "no hay ninguna sentencia completa dentro del rango reportado." };
    return { holds: true, evidence: `${s.deadStatements} sentencia(s) completas dentro del tramo: el intérprete nunca llega a ninguna.` };
  },
};

/**
 * `required` #2 del camino A — LA COMPUERTA DE SEGURIDAD. Un tramo
 * inalcanzable que DECLARA un nombre usado en otra parte de la función no se
 * puede borrar: la declaración se iza (o el lenguaje la resuelve por scope) y
 * el resto de la función depende de ella. `unreachable-code.ts` ya excluye
 * del RANGO las declaraciones izadas que reconoce, pero no puede excluir el
 * caso general — su `NON_EXECUTABLE_TYPE` mira el tipo de nodo, no si el
 * nombre se usa después. Acá sí se puede, porque el árbol de la función
 * entera está a la vista.
 */
const nadaDelTramoSeUsaAfuera: Check<UnreachableProblem, CodeGraph | null> = {
  id: "nada-declarado-en-el-tramo-se-usa-afuera",
  describe: "Ningún nombre declarado dentro del tramo muerto se referencia fuera de él: borrarlo no rompe el resto de la función",
  run(problem) {
    const escaping = problem.shape.escapingNames;
    if (escaping.length > 0) {
      return {
        holds: false,
        evidence: `el tramo declara ${escaping.slice(0, 3).map((n) => `"${n}"`).join(", ")}${escaping.length > 3 ? "…" : ""}, y ese nombre se referencia fuera del tramo: borrarlo cambiaría el comportamiento del resto de la función.`,
      };
    }
    return { holds: true, evidence: "ningún nombre declarado dentro del tramo aparece referenciado fuera de él dentro de la misma función." };
  },
};

/**
 * `required` #3 del camino A — LA RE-VERIFICACIÓN DE LA AFIRMACIÓN DEL ANCLA.
 * Ver `jumpBeforeInSameBlock` en `analyzeUnreachable` para los dos falsos
 * positivos medidos que esta compuerta ataja, y por qué son los peores
 * posibles de esta familia: los dos proponen borrar el retorno normal de una
 * función.
 */
const hayUnSaltoAntes: Check<UnreachableProblem, CodeGraph | null> = {
  id: "hay-un-salto-antes-en-el-mismo-bloque",
  describe: "Hay un salto de control anterior al tramo dentro del mismo bloque, y el tramo es código de verdad y no una cláusula de manejo: es lo que lo vuelve inalcanzable",
  run(problem) {
    const s = problem.shape;
    if (s.deadSpanIsHandler) {
      return { holds: false, evidence: "el tramo ES una cláusula de manejo (`rescue`/`ensure`/`finally`/…): al árbol le parece el hermano siguiente a un salto, pero no se alcanza por caída sino cuando el cuerpo levanta." };
    }
    if (s.deadSpanHasError) {
      return { holds: false, evidence: "el tramo contiene un nodo `ERROR` de la gramática: el parser no pudo armarlo, así que no se sabe siquiera si son sentencias." };
    }
    return s.jumpBeforeInSameBlock
      ? { holds: true, evidence: "un salto de control anterior, hermano del tramo dentro del mismo bloque, saca el flujo antes de llegar acá." }
      : { holds: false, evidence: "ningún hermano anterior del tramo, dentro de su mismo bloque, es un salto de control: nada prueba que el flujo no llegue." };
  },
};

const variasSentenciasMuertas: Check<UnreachableProblem, CodeGraph | null> = {
  id: "varias-sentencias-muertas",
  describe: "El tramo muerto tiene más de una sentencia: no es un descuido de una línea",
  run(problem) {
    const n = problem.shape.deadStatements;
    return n >= 2
      ? { holds: true, evidence: `${n} sentencias que nunca se ejecutan.` }
      : { holds: false, evidence: "una sola sentencia muerta." };
  },
};

const tramoConLogica: Check<UnreachableProblem, CodeGraph | null> = {
  id: "el-tramo-tiene-logica",
  describe: "El tramo muerto tiene ramas, bucles o llamadas: alguien lo lee como lógica viva",
  run(problem) {
    return problem.shape.hasLogic
      ? { holds: true, evidence: "el tramo contiene ramas, bucles o llamadas: quien lee el archivo lo toma por lógica en uso." }
      : { holds: false, evidence: "el tramo no contiene ramas, bucles ni llamadas." };
  },
};

const gemeloVivo: Check<UnreachableProblem, CodeGraph | null> = {
  id: "el-tramo-tiene-gemelo-vivo",
  describe: "Alguna sentencia del tramo muerto existe, idéntica, en la parte viva de la función: borrar no pierde nada",
  run(problem) {
    return problem.shape.liveTwin
      ? { holds: true, evidence: "una sentencia idéntica ya existe en la parte alcanzable de la función: el tramo es el resto de una refactorización, no lógica única." }
      : { holds: false, evidence: "ninguna sentencia del tramo aparece idéntica en la parte alcanzable de la función." };
  },
};

function unreachableAppliedState(): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "No existe forma de 'ya aplicado' para código inalcanzable",
        passed: false,
        why: "el remedio es la eliminación del tramo; si ya se hubiera eliminado no habría hallazgo. Se declara acá en vez de fingir una búsqueda: no hay otro lugar del repo donde esta solución pudiera estar viviendo.",
      },
    ],
  };
}

const UNREACHABLE_TO_CONFIRM: readonly string[] = [
  "Confirmar con el historial que el tramo no es una rama que se quiso dejar 'por las dudas' y que hay que reactivar.",
  "Correr la suite después de borrar: ningún test puede cubrir estas líneas, así que la suite tiene que quedar exactamente igual.",
];

function unreachableSpec(): HypothesisSpec<UnreachableProblem, CodeGraph | null> {
  return {
    pattern: PATTERN,
    ceiling: "alta",
    needs: [],
    required: [tramoVisible, nadaDelTramoSeUsaAfuera, hayUnSaltoAntes],
    discriminators: [variasSentenciasMuertas, tramoConLogica, gemeloVivo],
    appliedState: () => unreachableAppliedState(),
    toConfirm: UNREACHABLE_TO_CONFIRM,
    source: SOURCE,
  };
}

function buildFromUnreachable(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const shaped: UnreachableProblem = { finding: problem, shape: analyzeUnreachable(problem, ctx) };
  const spec = unreachableSpec();
  const outcome = runEngine(spec, ctx.capabilities, shaped, graph);
  if (!outcome) {
    record(problem, null, { ...shaped.shape, escapingNames: shaped.shape.escapingNames.join("|") });
    return null;
  }
  const built = toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: problem.locations,
    cost: "Borrar el tramo. No cambia ninguna firma ni ningún comportamiento observable: por definición, nada llega a ejecutarlo.",
  });
  record(problem, built, { ...shaped.shape, escapingNames: shaped.shape.escapingNames.join("|"), state: built.state, confidence: built.confidence });
  return built;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CAMINO B — `unused-symbol`. LA COMPUERTA DE VISIBILIDAD PÚBLICA VIVE ACÁ,
 * COMO DISCRIMINADOR (ver el docstring de cabecera: medida, 11,1 % contra
 * 47,2 %, y ciega en cuatro de los seis lenguajes)
 * ═══════════════════════════════════════════════════════════════════════════ */

type Exposure = "expuesta" | "confinada" | "sin-dato";

/** MISMO criterio y MISMAS dos fuentes que `unused-symbol.ts#exposureOf`
 *  (visibilidad declarada por la gramática; regla de exportación de la
 *  especificación de Go), re-derivado acá porque esa función es privada de su
 *  módulo y esta ola no toca `detect/**`. */
function exposureOf(node: CodeGraphNode, language: string | null): Exposure {
  if (node.visibility === "public" || node.visibility === "protected") return "expuesta";
  if (node.visibility === "private" || node.visibility === "internal") return "confinada";
  if (node.symbolPath.length === 1 && node.exported === false) return "confinada";
  if (language === "go") {
    const name = node.symbolPath[node.symbolPath.length - 1] ?? "";
    return UPPERCASE_FIRST.test(name) ? "expuesta" : "sin-dato";
  }
  return "sin-dato";
}

interface UnusedSymbolShape {
  readonly nodeFound: boolean;
  readonly exposure: Exposure;
  readonly visibilityDeclared: boolean;
  readonly topLevel: boolean;
  /** Aristas entrantes de cualquier tipo salvo las DOS que no son un uso — ver `ARTIFACT_EDGE_KINDS`. */
  readonly incomingNonContaining: number;
  /** Las mismas, pero descontando las AMBIGUAS (`provenance: "ambiguous"`). */
  readonly incomingConfident: number;
  /** `kind/provenance` de cada arista entrante, para la traza del embudo. */
  readonly incomingKinds: string;
  readonly language: string | null;
}

const UNUSED_SYMBOL_UNKNOWN: UnusedSymbolShape = {
  nodeFound: false,
  exposure: "sin-dato",
  visibilityDeclared: false,
  topLevel: false,
  incomingNonContaining: 0,
  incomingConfident: 0,
  incomingKinds: "",
  language: null,
};

function analyzeUnusedSymbol(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): UnusedSymbolShape {
  if (!graph) return UNUSED_SYMBOL_UNKNOWN;
  const loc = problem.locations[0];
  const anchor = loc.anchor;
  const id = anchor ? symbolNodeId(anchor.file, anchor.symbolPath) : null;
  if (!id) return UNUSED_SYMBOL_UNKNOWN;
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return UNUSED_SYMBOL_UNKNOWN;

  const language = ctx.file?.language ?? problem.language;
  let incoming = 0;
  let confident = 0;
  const kinds = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.to !== id || ARTIFACT_EDGE_KINDS.has(edge.kind)) continue;
    incoming++;
    if (edge.provenance !== "ambiguous") confident++;
    const key = `${edge.kind}/${edge.provenance}`;
    kinds.set(key, (kinds.get(key) ?? 0) + 1);
  }

  return {
    nodeFound: true,
    exposure: exposureOf(node, language),
    visibilityDeclared: node.visibility !== undefined,
    topLevel: node.symbolPath.length === 1,
    incomingNonContaining: incoming,
    incomingConfident: confident,
    incomingKinds: [...kinds].map(([k, n]) => `${k}x${n}`).join(" "),
    language,
  };
}

interface UnusedSymbolProblem {
  readonly finding: Finding;
  readonly shape: UnusedSymbolShape;
  /** Cuando es `true`, la compuerta de visibilidad no se aplica — SÓLO para medir su costo (ver `MEDICION_SIN_COMPUERTA`). */
  readonly bypassVisibilityGate: boolean;
}

/**
 * **DISCRIMINADOR del camino B — LA COMPUERTA DE VISIBILIDAD PÚBLICA.** Fue
 * `required` #1 en el diseño de AS5 y la Ola AX la degradó con el número
 * puesto (11,1 % como `required` contra 47,2 % como discriminador; `sin-dato`
 * en 309 de 309 candidatos de ruby/python/typescript/javascript). Ver el
 * docstring de cabecera, sección "LA COMPUERTA DE VISIBILIDAD ES UN
 * DISCRIMINADOR".
 *
 * Como discriminador dice lo mismo que decía —"el lenguaje lo declara
 * alcanzable desde afuera, así que sus consumidores pueden vivir fuera del
 * repo"— pero lo dice BAJANDO LA CONFIANZA en vez de callándose. El caso
 * `sin-dato` sigue contando en contra, y es lo correcto: no saber la
 * visibilidad es una razón para desconfiar de la propuesta, no para creerle.
 */
const noEsSuperficiePublica: Check<UnusedSymbolProblem, CodeGraph | null> = {
  id: "el-lenguaje-lo-declara-confinado",
  describe: "El propio lenguaje declara el símbolo inalcanzable desde fuera del repo: borrarlo no puede romper a un consumidor externo",
  run(problem) {
    const s = problem.shape;
    if (!s.nodeFound) return { holds: false, evidence: "el símbolo del hallazgo no se encontró en el grafo de esta corrida: su exposición es desconocida." };
    if (problem.bypassVisibilityGate) {
      return { holds: true, evidence: `medición sin compuerta (exposición real: ${s.exposure}).` };
    }
    if (s.exposure === "expuesta") {
      return { holds: false, evidence: "el lenguaje lo declara alcanzable desde afuera (visibilidad pública/protegida, o identificador exportado): sus consumidores pueden vivir fuera del repo y este análisis no los ve." };
    }
    if (s.exposure === "sin-dato") {
      return { holds: false, evidence: "la gramática no declara la visibilidad de este símbolo: sin ese dato, proponer borrarlo es apostar a que nadie lo importa desde afuera." };
    }
    return { holds: true, evidence: "el lenguaje lo declara confinado (visibilidad privada/interna, o símbolo de nivel superior que su archivo no exporta): ningún consumidor externo puede alcanzarlo." };
  },
};

/** `required` #2 del camino B: ninguna arista entrante de ninguna clase (salvo
 *  la de contención, que es "quién te declara", no "quién te usa"). Es más
 *  estricto que las nueve aristas de consumo que el ancla mira. */
const sinNingunaAristaEntrante: Check<UnusedSymbolProblem, CodeGraph | null> = {
  id: "sin-ninguna-arista-entrante",
  describe: "El grafo no tiene NINGUNA relación entrante hacia el símbolo, de ninguna clase",
  run(problem) {
    const n = problem.shape.incomingNonContaining;
    return n === 0
      ? { holds: true, evidence: "ninguna relación del grafo apunta a este símbolo, ni de llamada, ni de referencia, ni de herencia." }
      : { holds: false, evidence: `${n} relación(es) del grafo apuntan a este símbolo: hay algo que lo nombra.` };
  },
};

const visibilidadEscritaAMano: Check<UnusedSymbolProblem, CodeGraph | null> = {
  id: "visibilidad-escrita-por-el-autor",
  describe: "El autor escribió la visibilidad restringida a mano, no se dedujo de la ausencia de `export`",
  run(problem) {
    return problem.shape.visibilityDeclared
      ? { holds: true, evidence: "la declaración lleva un modificador de visibilidad restringida escrito por el autor." }
      : { holds: false, evidence: "la restricción se deduce de que el archivo no exporta el símbolo, no de un modificador escrito." };
  },
};

const simboloDeNivelSuperior: Check<UnusedSymbolProblem, CodeGraph | null> = {
  id: "simbolo-de-nivel-superior",
  describe: "Es una declaración de nivel superior completa, no un miembro suelto",
  run(problem) {
    return problem.shape.topLevel
      ? { holds: true, evidence: "es una función o clase de nivel superior: borrarla saca un bloque entero del archivo." }
      : { holds: false, evidence: "es un miembro dentro de otra declaración." };
  },
};

function unusedSymbolAppliedState(): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "No existe forma de 'ya aplicado' para un símbolo sin consumidores",
        passed: false,
        why: "el remedio es la eliminación del símbolo; si ya se hubiera eliminado no habría hallazgo. Un reemplazo vivo en otro archivo no cambia el remedio: sigue habiendo que borrar éste.",
      },
    ],
  };
}

/** La primera línea es la que carga el riesgo que la compuerta de visibilidad
 *  dejó de silenciar (ver el docstring de cabecera): si el símbolo es
 *  superficie pública, el consumidor puede vivir fuera del repo y este
 *  análisis no lo ve. Se dice acá y se marca en la confianza; ya no se calla
 *  la propuesta. */
const UNUSED_SYMBOL_TO_CONFIRM: readonly string[] = [
  "Confirmar que el símbolo no es API pública consumida desde FUERA del repo: este análisis sólo ve los consumidores de este repositorio.",
  "Confirmar que nada lo invoca por reflexión, por convención de framework o desde una configuración: el grafo no ve esas vías.",
  "Confirmar que no lo usan los tests del propio repo si esta corrida los excluyó.",
];

function unusedSymbolSpec(): HypothesisSpec<UnusedSymbolProblem, CodeGraph | null> {
  return {
    pattern: PATTERN,
    ceiling: "media",
    needs: [],
    required: [sinNingunaAristaEntrante],
    discriminators: [noEsSuperficiePublica, visibilidadEscritaAMano, simboloDeNivelSuperior],
    appliedState: () => unusedSymbolAppliedState(),
    toConfirm: UNUSED_SYMBOL_TO_CONFIRM,
    source: SOURCE,
  };
}

/**
 * Interruptor SÓLO de medición, apagado en producción. Nació para publicar
 * cuánto emitía el camino B con la compuerta de visibilidad como `required` y
 * cuánto sin ella; con la compuerta ya degradada a DISCRIMINADOR (Ola AX) lo
 * que hace hoy es forzar que el discriminador cuente a favor, para poder
 * medir su aporte a la CONFIANZA por separado. **No cambia la emisión: desde
 * la degradación, la compuerta no puede silenciar ninguna propuesta.** No hay
 * `process.env` en el camino de análisis — invariante de `analyze-cache.ts`:
 * se prende llamando a esta función desde un script de medición.
 */
let sinCompuertaDeVisibilidad = false;
export function medirSinCompuertaDeVisibilidad(on: boolean): void {
  sinCompuertaDeVisibilidad = on;
}

function buildFromUnusedSymbol(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const shaped: UnusedSymbolProblem = {
    finding: problem,
    shape: analyzeUnusedSymbol(problem, graph, ctx),
    bypassVisibilityGate: sinCompuertaDeVisibilidad,
  };
  const spec = unusedSymbolSpec();
  const outcome = runEngine(spec, ctx.capabilities, shaped, graph);
  if (!outcome) {
    record(problem, null, { ...shaped.shape, bypass: shaped.bypassVisibilityGate });
    return null;
  }
  const built = toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: problem.locations,
    cost: "Borrar la declaración entera. Si algo la invoca por reflexión o por convención de framework, el grafo no lo ve: eso es lo que hay que confirmar antes.",
  });
  record(problem, built, { ...shaped.shape, bypass: shaped.bypassVisibilityGate, state: built.state, confidence: built.confidence });
  return built;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CAMINO C — `unused-variable`, con LA COMPUERTA DE EFECTOS OBSERVABLES
 * ═══════════════════════════════════════════════════════════════════════════ */

interface UnusedVariableShape {
  readonly treeAvailable: boolean;
  readonly declarationFound: boolean;
  /** El inicializador de la declaración contiene alguna construcción con efecto. */
  readonly initializerHasEffect: boolean;
  /** La declaración no tiene inicializador (o es un literal pelado). */
  readonly initializerIsInert: boolean;
  /** El nombre no aparece en NINGÚN otro lugar del archivo, ni fuera de la función. */
  readonly unusedInWholeFile: boolean;
}

const UNUSED_VARIABLE_UNKNOWN: UnusedVariableShape = {
  treeAvailable: false,
  declarationFound: false,
  initializerHasEffect: false,
  initializerIsInert: false,
  unusedInWholeFile: false,
};

function analyzeUnusedVariable(problem: Finding, ctx: HypothesisContext): UnusedVariableShape {
  const file = ctx.file;
  if (!file) return UNUSED_VARIABLE_UNKNOWN;
  const loc = problem.locations[0];
  const fn = enclosingFunction(ctx, loc.startLine, loc.endLine);
  if (!fn) return { ...UNUSED_VARIABLE_UNKNOWN, treeAvailable: true };
  const name = loc.symbol;
  if (!name) return { ...UNUSED_VARIABLE_UNKNOWN, treeAvailable: true };

  // El nodo que el detector reportó es el IDENTIFICADOR del nombre (ver
  // `unused-variable.ts#buildFinding`, que toma `site.node` = el nombre).
  let nameNode: AstNode | null = null;
  walkTree(fn.node, (raw) => {
    const node = raw as AstNode;
    if (nameNode || !node.isNamed) return;
    if (node.startPosition.row + 1 !== loc.startLine) return;
    if (!REFERENCE_NODE_TYPES.has(node.type) && node.type !== "property_identifier") return;
    if (node.text !== name) return;
    nameNode = node;
  });
  if (!nameNode) return { ...UNUSED_VARIABLE_UNKNOWN, treeAvailable: true };

  // LA DECLARACIÓN es el PADRE DIRECTO del nombre — el declarador. Si ese
  // padre no tiene más hijos que el nombre, se sube EXACTAMENTE un nivel más
  // y se para ahí.
  //
  // DEFECTO MEDIDO Y ARREGLADO (Ola AS, sobre `lodash.js:12` y
  // `perf/perf.js:8`, las dos `var undefined;`): la versión anterior subía
  // por la cadena hasta el primer ancestro con dos hijos nombrados, y para
  // una declaración SIN inicializador ese ancestro terminaba siendo el
  // BLOQUE entero de la función — así que el chequeo de efectos miraba todas
  // las sentencias hermanas y daba `true` siempre. Resultado: el camino C
  // emitía CERO en todo el corpus, y por un artefacto del recorrido, no por
  // una propiedad del código. Un ascenso ACOTADO no puede volver a hacer eso.
  const chain = ancestorsOf(fn.node, nameNode);
  let declaration: AstNode | null = chain[chain.length - 1] ?? null;
  if (declaration && namedChildren(declaration).length <= 1) {
    const grandparent = chain[chain.length - 2];
    if (grandparent && !sameNode(grandparent, fn.node)) declaration = grandparent;
  }
  if (declaration && sameNode(declaration, fn.node)) declaration = null;

  let hasEffect = false;
  let namedInInitializer = 0;
  if (declaration) {
    for (const child of namedChildren(declaration)) {
      if (sameNode(child, nameNode)) continue;
      namedInInitializer++;
      walkTree(child, (raw) => {
        const node = raw as AstNode;
        if (node.isNamed && EFFECT_NODE_WORD.test(node.type)) hasEffect = true;
      });
      if (EFFECT_NODE_WORD.test(child.type)) hasEffect = true;
    }
  }

  let occurrencesInFile = 0;
  walkTree(file.root, (raw) => {
    const node = raw as AstNode;
    // POR HOJA, NO POR TIPO DE NODO. Contar sólo `identifier` deja MUDA a
    // toda gramática que le da tipo propio a un token: tree-sitter-javascript
    // tipa `undefined` como `undefined` (no como `identifier`), y por eso
    // `lodash.js:12` —el `var undefined;` que la propia línea de arriba
    // documenta como "safe reference for `undefined`"— salía con
    // `unusedInWholeFile: true` y 264 apariciones en el archivo. Una HOJA
    // nombrada cuyo texto es exactamente el nombre es la pregunta correcta y
    // no nombra ningún lenguaje: cubre `identifier`, `undefined`,
    // `property_identifier`, el `constant` de Ruby y el `instance_variable`
    // de Ruby con la MISMA regla. Y yerra hacia el silencio, que es el lado
    // correcto para una propuesta de borrar.
    if (node.isNamed && node.childCount === 0 && node.text === name) occurrencesInFile++;
  });

  return {
    treeAvailable: true,
    declarationFound: declaration !== null,
    initializerHasEffect: hasEffect,
    initializerIsInert: !hasEffect && namedInInitializer <= 1,
    unusedInWholeFile: occurrencesInFile <= 1,
  };
}

interface UnusedVariableProblem {
  readonly finding: Finding;
  readonly shape: UnusedVariableShape;
}

/** `required` #1 del camino C. Un PARÁMETRO sin uso no se borra: la firma es
 *  un contrato con quien llama, con quien hereda y con quien implementa. El
 *  remedio ahí es otro (cambiar la firma, con todos sus llamadores), y esta
 *  familia no lo propone. El dato sale de la `variant` que el propio detector
 *  publica, no de leer su prosa. */
const esVariableLocal: Check<UnusedVariableProblem, CodeGraph | null> = {
  id: "es-una-variable-local-no-un-parametro",
  describe: "Es una variable local, no un parámetro: borrarla no toca ninguna firma",
  run(problem) {
    return problem.finding.variant === "variable-local"
      ? { holds: true, evidence: "es una declaración local: su alcance empieza y termina dentro de la función." }
      : { holds: false, evidence: "es un parámetro: la firma es un contrato con quien llama, con quien hereda y con quien implementa; el remedio no es borrar la línea." };
  },
};

/**
 * `required` #2 del camino C — LA COMPUERTA DE EFECTOS OBSERVABLES, que es la
 * sección "Cuándo NO conviene" de esta técnica en refactoring.guru.
 * `const x = hacerAlgo();` sin uso no es una línea que se borra: borrarla
 * borra la llamada. Cuando el inicializador tiene efecto, el remedio correcto
 * es otro y esta familia se calla en vez de proponer un cambio de
 * comportamiento.
 */
const inicializadorSinEfecto: Check<UnusedVariableProblem, CodeGraph | null> = {
  id: "la-declaracion-no-tiene-efecto-observable",
  describe: "El valor que se asigna no ejecuta nada: borrar la declaración no puede cambiar el comportamiento",
  run(problem) {
    const s = problem.shape;
    if (!s.treeAvailable) return { holds: false, evidence: "el árbol del archivo no está vivo en esta corrida: nada que verificar." };
    if (!s.declarationFound) return { holds: false, evidence: "la declaración no se ubicó en el árbol de la función." };
    if (s.initializerHasEffect) {
      return { holds: false, evidence: "el valor asignado ejecuta algo (llamada, instanciación, asignación o espera): borrar la línea borraría esa ejecución. El remedio correcto es separar la llamada del nombre, no eliminar la declaración." };
    }
    return { holds: true, evidence: "el valor asignado no ejecuta nada: la declaración es puro nombre sobre un valor inerte." };
  },
};

/**
 * `required` #3 del camino C — OLA AS, PROMOVIDO DE DISCRIMINADOR A `required`
 * con la medición en la mano. Como discriminador dejaba pasar el peor falso
 * de este camino: `eslint/docs/_examples/custom-rule-tutorial-code/example.js`
 * declara `const foo` en DOS funciones del mismo archivo —una es el ejemplo
 * correcto y la otra el ejemplo con el defecto, comentado `// Problem!`— y la
 * familia proponía borrar el defecto que el tutorial existe para mostrar. El
 * nombre reaparece en el archivo, así que el "nadie lo lee" del ancla ya no
 * es verificable con lo que esta hipótesis ve; como toda la tesis del camino C
 * es "borrar esta línea no cambia nada", sin ese dato hay que callarse.
 */
const invisibleEnTodoElArchivo: Check<UnusedVariableProblem, CodeGraph | null> = {
  id: "el-nombre-no-aparece-en-todo-el-archivo",
  describe: "El nombre no aparece ni una sola vez más en todo el archivo, no sólo dentro de la función",
  run(problem) {
    return problem.shape.unusedInWholeFile
      ? { holds: true, evidence: "el nombre aparece una sola vez en el archivo entero: su declaración." }
      : { holds: false, evidence: "el nombre vuelve a aparecer en otra parte del archivo (otra función, otro alcance)." };
  },
};

const declaracionInerte: Check<UnusedVariableProblem, CodeGraph | null> = {
  id: "declaracion-completamente-inerte",
  describe: "La declaración no tiene inicializador o asigna un valor pelado",
  run(problem) {
    return problem.shape.initializerIsInert
      ? { holds: true, evidence: "la declaración asigna un valor pelado o no asigna nada: borrarla es una eliminación pura." }
      : { holds: false, evidence: "la declaración asigna una expresión compuesta, aunque sin efectos." };
  },
};

function unusedVariableAppliedState(): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "No existe forma de 'ya aplicado' para una variable declarada y nunca leída",
        passed: false,
        why: "el remedio es la eliminación de la declaración; si ya se hubiera eliminado no habría hallazgo.",
      },
    ],
  };
}

const UNUSED_VARIABLE_TO_CONFIRM: readonly string[] = [
  "Confirmar que el nombre no lo consume una macro, una anotación o una convención de serialización que el árbol no ve.",
];

function unusedVariableSpec(): HypothesisSpec<UnusedVariableProblem, CodeGraph | null> {
  return {
    pattern: PATTERN,
    ceiling: "alta",
    needs: [],
    required: [esVariableLocal, inicializadorSinEfecto, invisibleEnTodoElArchivo],
    discriminators: [declaracionInerte],
    appliedState: () => unusedVariableAppliedState(),
    toConfirm: UNUSED_VARIABLE_TO_CONFIRM,
    source: SOURCE,
  };
}

function buildFromUnusedVariable(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const shaped: UnusedVariableProblem = { finding: problem, shape: analyzeUnusedVariable(problem, ctx) };
  const spec = unusedVariableSpec();
  const outcome = runEngine(spec, ctx.capabilities, shaped, graph);
  if (!outcome) {
    record(problem, null, { ...shaped.shape, variant: problem.variant ?? null });
    return null;
  }
  const built = toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: problem.locations,
    cost: "Borrar la línea de la declaración. Nada más la lee y el valor que asigna no ejecuta nada.",
  });
  record(problem, built, { ...shaped.shape, variant: problem.variant ?? null, state: built.state, confidence: built.confidence });
  return built;
}

/* ── LA TRAZA DEL EMBUDO ────────────────────────────────────────────────────
 *
 * Mismo mecanismo, y por la misma razón, que `engine.ts#startArbitrationTrace`:
 * ningún `process.env` en el camino de análisis (invariante de
 * `analyze-cache.ts`), se prende desde un script de medición y en producción
 * es `null` — costo cero, ni una rama de más por hipótesis. Existe porque
 * `analyzeRepo` devuelve la PROYECCIÓN de cliente de cada `Finding`
 * (`shared/types.ts#CodeFinding`), que no lleva `variant` ni `anchor`: sin
 * esto, un cero medido sobre el corpus no se puede explicar. */
export interface RemoveDeadCodeTraceEntry {
  kind: string;
  file: string;
  startLine: number;
  symbol?: string;
  emitted: boolean;
  /** `label → passed` de cada `required`, en orden. */
  required: Record<string, boolean>;
  detail: Record<string, string | number | boolean | null>;
}

let trace: RemoveDeadCodeTraceEntry[] | null = null;
export function startRemoveDeadCodeTrace(): void {
  trace = [];
}
export function takeRemoveDeadCodeTrace(): readonly RemoveDeadCodeTraceEntry[] {
  const out = trace ?? [];
  trace = null;
  return out;
}

function record(
  problem: Finding,
  built: PatternHypothesisDraft | null,
  detail: Record<string, string | number | boolean | null>,
): void {
  if (!trace) return;
  const loc = problem.locations[0];
  const required: Record<string, boolean> = {};
  for (const c of built?.checks ?? []) if (c.role !== "applied") required[c.label] = c.passed;
  trace.push({
    kind: problem.kind,
    file: loc.file,
    startLine: loc.startLine,
    symbol: loc.symbol,
    emitted: built !== null,
    required,
    detail,
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "remove-dead-code",
  pattern: PATTERN,
  layer: "refactorizacion",
  anchors: [UNREACHABLE_KIND, UNUSED_SYMBOL_KIND, UNUSED_VARIABLE_KIND],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    // Tres caminos que no comparten ni un check, ni un `required`, ni una
    // rama de `appliedState` — mismo reparto que `extract-method.ts`.
    if (problem.kind === UNUSED_SYMBOL_KIND) return buildFromUnusedSymbol(problem, graph, ctx);
    if (problem.kind === UNUSED_VARIABLE_KIND) return buildFromUnusedVariable(problem, graph, ctx);
    if (problem.kind === UNREACHABLE_KIND) return buildFromUnreachable(problem, graph, ctx);
    return null;
  },
};
