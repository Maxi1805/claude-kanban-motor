/**
 * Decompose Conditional — Ola AT, frente AT5 ("componiendo métodos").
 *
 * ── LA FORMA, Y POR QUÉ ES UN HECHO DEL CÓDIGO ─────────────────────────────
 * El criterio de diseño de esta ola es duro: *si la precondición no se puede
 * verificar abriendo el archivo, la familia repite el 18 % de los patrones*.
 * La de este archivo se verifica CONTANDO:
 *
 *     if (a && b || c && d) { … }        ⇒     if (esA(x) || esB(x)) { … }
 *
 * Una cadena booleana que MEZCLA `&&` con `||` (o `and` con `or`) colgando de
 * la MISMA raíz SIN paréntesis que ya la desambigüen obliga al lector a
 * recordar qué operador ata más fuerte para reconstruir la tabla de verdad.
 * Eso no es una opinión sobre el futuro: es SonarSource S864, y es el ancla
 * `boolean-complexity` (`detect/intra-function/boolean-complexity.ts`), cuyo
 * propio `advice.primary` ya nombra "Decompose Conditional" desde el nivel 1
 * — este archivo es el nivel 2 que ese consejo nunca tuvo.
 *
 * ── POR QUÉ ESTA ANCLA Y NO LA DE `Extract Method` ────────────────────────
 * El ancla es CHICA y se declara de entrada: **50 hallazgos de
 * `boolean-complexity` en los 21 repos** (medido sobre `scratchpad-int-al/
 * dumps21`: Ghost 16, gitea 17, jenkins 5, sqlalchemy 4, lodash 3, click 2,
 * hugo 1, netbox 1, redmine 1; 0 en los otros doce). Contra los 7.303 de
 * `Extract Method`, es un 0,7 %. Se eligió igual, y la razón es la regla de
 * escala del encargo: *"una familia que emite 5.000 propuestas al 40 % es
 * peor producto que una que emite 200 al 70 %"*. Acá el remedio es EXACTO
 * (dale un nombre a este grupo de términos), la precondición es un hecho
 * contable, y el ancla no la usa hoy ninguna otra hipótesis de esta capa
 * — `chain-of-responsibility.ts` la declara, pero su forma es otra.
 *
 * ── LAS TRES PRECONDICIONES ────────────────────────────────────────────────
 *   (1) MEZCLA CONFIRMADA CONTRA EL ÁRBOL, no contra el texto del `Finding`:
 *       se vuelve a recorrer la cadena por los campos `left`/`right` y se
 *       exige que junte las dos familias (AND y OR) con > 2 operadores. Un
 *       operando entre paréntesis en el fuente se parsea como un nodo de otra
 *       forma y la cadena se corta sola ahí — la mezcla ya resuelta por el
 *       autor nunca llega a contarse (mismo mecanismo que el detector).
 *   (2) SIN EFECTOS: ningún nodo de la condición asigna, incrementa,
 *       decrementa, espera ni cede. Sin esto, mover un grupo de términos a un
 *       predicado con nombre cambia CUÁNDO se evalúa el efecto — y el
 *       cortocircuito de `&&`/`||` hace que eso sea un cambio de
 *       comportamiento, no una reescritura.
 *   (3) HAY ALGO QUE NOMBRAR: la cadena mixta se descompone en sus
 *       sub-cadenas HOMOGÉNEAS maximales, y al menos una tiene >= 2 términos.
 *       **DECLARADO: este `required` se cumple POR CONSTRUCCIÓN** — una cadena
 *       que junta las dos familias tiene siempre al menos una sub-cadena
 *       homogénea de un operador, o sea de dos términos. No filtra nada, y no
 *       se lo presenta como si filtrara: existe por la misma razón que
 *       `nada-despues-de-la-guarda` en `guard-clauses.ts` y `base-estable` en
 *       `extract-variable.ts` — es la condición que decide QUÉ se extrae, y
 *       tiene que estar escrita en la evidencia que ve el usuario (nombra los
 *       grupos concretos), no sólo en el código. Los dos `required` que de
 *       verdad filtran son (1) y (2).
 *
 * ── LA TRAMPA #3 DE LA OLA: EL REMEDIO PUEDE YA ESTAR APLICADO ─────────────
 * `appliedState` no mira sólo el alcance del ancla: mira DÓNDE VIVIRÍA la
 * solución. Dos formas, las dos verificadas contra el árbol del archivo:
 *   · la condición ES el inicializador de un local con nombre
 *     (`const puedeEntrar = a && b || c && d;`) — el nombre YA está puesto y
 *     lo único que falta son paréntesis, que es otro consejo; y
 *   · el archivo ya declara una función cuyo cuerpo entero es exactamente
 *     esta expresión — el predicado con nombre ya existe y este sitio no lo
 *     usa.
 * En los dos casos el estado es `ya-aplicado` y la hipótesis deja de competir
 * como oportunidad.
 *
 * ── LA TRAMPA #2: NO LE BORRA LA PROPUESTA A NADIE ────────────────────────
 * `engine.ts#arbitrateRivalHypotheses` sólo retira una oportunidad ajena
 * frente a un estado CONFIRMADO (`ya-aplicado`/`aplicado-eludido`) de otro
 * patrón cuyos `places` solapan. El único estado confirmado que este archivo
 * puede producir es sobre `boolean-complexity`, un ancla que `Extract Method`
 * y `Value Object` NO declaran (`extract-method.ts` ancla en `long-function`/
 * `complexity`; `value-object.ts` en `primitive-obsession`), así que las 287
 * verdaderas expuestas de la Ola AS no pueden verse afectadas. El test lo
 * congela.
 *
 * ── LENGUAJES ─────────────────────────────────────────────────────────────
 * `needs: []`. Ninguna constante nombra un lenguaje: la cadena se ubica por
 * los campos genéricos `left`/`right`/`operator` (los mismos que el detector
 * ancla comprobó contra las siete gramáticas) y los efectos por palabra de
 * gramática compartida, aplicada idénticamente a todos.
 */
import { walkTree } from "../detect/tree-walk.js";
import type { AstNode, FileUnit, Finding, FunctionUnit, RoleLocation } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/** Vocabulario lógico COMPARTIDO — idéntico al del detector ancla, aplicado igual a los seis lenguajes. */
const LOGICAL_OPERATOR_TOKEN = /^(&&|\|\||and|or)$/;
/** El piso del detector ancla (`citado(2, S864)`, disparo por `>`): la cadena mínima ambigua tiene 3. */
const MIN_OPERATORS = 3;
/** Una sub-cadena homogénea con un solo término no es un grupo: no hay nada que nombrar. */
const MIN_GROUP_TERMS = 2;
/** Cuatro o más operadores mezclados sube un peldaño. */
const DEEP_OPERATORS = 4;
/** Cuerpo "de una sola expresión": lo que un predicado con nombre ya existente ocuparía. */
const QUERY_BODY_LINES = 3;

/** Asignación/actualización por FORMA de nodo — palabra de gramática compartida, nunca una lista por lenguaje. */
const EFFECT_WORD = /(^|_)(assignment|augmented|update|increment|decrement|await|yield)(_|$)/;
/**
 * Asignación/actualización por TOKEN de operador — el complemento del anterior
 * para las gramáticas que no nombran el nodo. El `:?` del principio cubre la
 * asignación-expresión (`:=`), que es la única forma de efecto que puede vivir
 * DENTRO de una condición sin que el nodo se llame "assignment" en ninguna
 * gramática: extraer un grupo que la contenga movería el punto donde el nombre
 * queda ligado.
 */
const EFFECT_TOKEN = /^(:?([-+*/%&|^]|<<|>>|>>>|\*\*|\/\/|\?\?|\|\||&&)?=|\+\+|--)$/;

type Graph = CodeGraph | null;
type Family = "AND" | "OR";

function family(token: string): Family {
  return token === "&&" || token === "and" ? "AND" : "OR";
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function isLogicalBinary(node: AstNode): boolean {
  if (!node.isNamed) return false;
  if (!node.childForFieldName("left") || !node.childForFieldName("right")) return false;
  const operator = node.childForFieldName("operator") as AstNode | null;
  return operator !== null && LOGICAL_OPERATOR_TOKEN.test(operator.type);
}

interface ChainShape {
  readonly operators: number;
  readonly families: ReadonlySet<Family>;
}

/** Mismo recorrido que el detector: SÓLO por `left`/`right`, así un paréntesis corta la cadena solo. */
function shapeOf(node: AstNode): ChainShape {
  const op = node.childForFieldName("operator") as AstNode;
  let operators = 1;
  const families = new Set<Family>([family(op.type)]);
  for (const field of ["left", "right"] as const) {
    const child = node.childForFieldName(field) as AstNode | null;
    if (child && isLogicalBinary(child)) {
      const sub = shapeOf(child);
      operators += sub.operators;
      for (const f of sub.families) families.add(f);
    }
  }
  return { operators, families };
}

/** Un grupo NOMBRABLE: una sub-cadena homogénea maximal dentro de la cadena mixta. */
interface Group {
  readonly family: Family;
  /** Términos = operadores + 1 (una cadena de 2 `&&` tiene 3 términos). */
  readonly terms: number;
  readonly text: string;
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * Descompone la cadena MIXTA en sus sub-cadenas homogéneas maximales. Un
 * operando que no es cadena lógica (un término suelto) no forma grupo: no hay
 * nada que extraerle.
 */
function groupsOf(node: AstNode): Group[] {
  const shape = shapeOf(node);
  if (shape.families.size === 1) {
    const op = node.childForFieldName("operator") as AstNode;
    return [
      {
        family: family(op.type),
        terms: shape.operators + 1,
        text: node.text.replace(/\s+/g, " ").trim(),
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      },
    ];
  }
  const out: Group[] = [];
  for (const field of ["left", "right"] as const) {
    const child = node.childForFieldName(field) as AstNode | null;
    if (child && isLogicalBinary(child)) out.push(...groupsOf(child));
  }
  return out;
}

/** ¿Algún nodo de la condición asigna, incrementa, espera o cede? */
function effectsIn(node: AstNode): string | null {
  let found: string | null = null;
  walkTree(node, (n) => {
    if (found) return;
    const real = n as AstNode;
    if (EFFECT_WORD.test(real.type)) {
      found = real.type;
      return;
    }
    const op = real.childForFieldName?.("operator") as AstNode | null;
    if (op && EFFECT_TOKEN.test(op.type)) found = op.type;
  });
  return found;
}

/** Un operando NO trivial: algo más que un identificador o un literal suelto. */
function nonTrivialTerms(node: AstNode): number {
  let n = 0;
  const visit = (x: AstNode) => {
    for (const field of ["left", "right"] as const) {
      const child = x.childForFieldName(field) as AstNode | null;
      if (!child) continue;
      if (isLogicalBinary(child)) visit(child);
      else if (namedChildren(child).length >= 1) n += 1;
    }
  };
  visit(node);
  return n;
}

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

/**
 * La cadena que el hallazgo señala. Se busca por POSICIÓN (línea de inicio y
 * de fin, que es lo que el detector publica) dentro de la función encerrante,
 * nunca por texto: dos condiciones distintas pueden compartir texto.
 */
function chainAt(fn: FunctionUnit, startLine: number, endLine: number): AstNode | null {
  let best: AstNode | null = null;
  walkTree(fn.node, (n) => {
    const real = n as AstNode;
    if (!isLogicalBinary(real)) return;
    if (real.startPosition.row + 1 !== startLine || real.endPosition.row + 1 !== endLine) return;
    // la MÁS EXTERNA de las que calzan: el detector reclama la cadena entera.
    if (!best || real.text.length > (best as AstNode).text.length) best = real;
  });
  return best;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * TRAMPA #3, forma A — la condición YA tiene nombre acá mismo: es el valor de
 * un local (`const puedeEntrar = a && b || c && d`).
 */

/**
 * LA LIGADURA CON NOMBRE (`x = <expresión>`), por FORMA y no por gramática.
 *
 * Dos mecanismos, y el segundo NO es opcional: lo encontró el propio test de
 * los seis lenguajes. Cuatro de las seis gramáticas exponen la ligadura con
 * los campos genéricos (`name`/`value` en Java y JS/TS, `left`/`right` en
 * Python, Ruby y Go), pero **C# no expone ninguno**: su `variable_declarator`
 * tiene dos hijos nombrados sueltos —el identificador y un envoltorio que
 * arranca con `=`— y nada más (comprobado por sonda directa sobre el árbol,
 * `scratchpad-at5/probes/csharp.mts`). Con sólo el primer mecanismo, la
 * trampa #3 quedaba MUDA en C#: exactamente la clase de agujero por lenguaje
 * que `state.ts#SELF_PREFIX` dejó abierto durante varias olas sin que ningún
 * test lo agarrara. El segundo mecanismo es estructural —dos hijos nombrados,
 * el primero un identificador desnudo, un `=` entre ellos— y no nombra
 * ninguna gramática.
 */
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

function isNamedLocalInitializer(chain: AstNode, fn: FunctionUnit): string | null {
  let name: string | null = null;
  walkTree(fn.node, (n) => {
    if (name) return;
    const binding = namedBinding(n as AstNode);
    if (!binding) return;
    const { value, name: target } = binding;
    if (value.startPosition.row !== chain.startPosition.row || value.startPosition.column !== chain.startPosition.column) return;
    if (!/^[A-Za-z_@$][A-Za-z0-9_$]*$/.test(target.text.trim())) return;
    name = target.text.trim();
  });
  return name;
}

/**
 * TRAMPA #3, forma B — el predicado con nombre YA EXISTE en el archivo: alguna
 * función cuyo cuerpo, sin envoltorios, es exactamente esta expresión.
 */
/**
 * ¿El CUERPO de esta función es exactamente esta expresión —o sea, es la
 * consulta con nombre que estamos por proponer— y no simplemente otro sitio
 * que la usa entre otras cosas?
 *
 * La primera versión preguntaba `body.text.includes(expr)` y eso hacía que la
 * OTRA copia de la duplicación (`return this.config.retry.max * 2;`) contara
 * como "la consulta ya existe": la familia se callaba justo en el caso que
 * viene a señalar. Lo encontró el test de los seis lenguajes, en los seis a la
 * vez. Se comparan textos NORMALIZADOS, sacando el envoltorio de bloque y la
 * palabra de retorno —vocabulario compartido y mínimo, aplicado igual a todos
 * los lenguajes, mismo criterio que `FLOW_BREAK_WORD` en `guard-clauses.ts`—
 * y Ruby entra sin excepción porque su retorno es implícito.
 */
function bodyIsExactly(body: AstNode, expr: string): boolean {
  let t = norm(body.text);
  t = t.replace(/^\{\s*/, "").replace(/\s*\}$/, "");
  t = t.replace(/^(return|=>)\s+/, "");
  t = t.replace(/;$/, "").trim();
  return t === expr;
}

function existingPredicate(chain: AstNode, file: FileUnit, fn: FunctionUnit): string | null {
  const wanted = norm(chain.text);
  for (const other of file.functions) {
    if (other.startLine === fn.startLine && other.name === fn.name) continue;
    const body = (other.node.childForFieldName("body") ?? null) as AstNode | null;
    if (!body || !other.name) continue;
    if (body.endPosition.row - body.startPosition.row > QUERY_BODY_LINES) continue;
    if (bodyIsExactly(body, wanted)) return other.name;
  }
  return null;
}

/* ── el contexto de los checks ──────────────────────────────────────────── */

interface Ctx {
  readonly chain: AstNode | null;
  readonly operators: number;
  readonly mixed: boolean;
  readonly effect: string | null;
  readonly groups: readonly Group[];
  readonly nameable: readonly Group[];
  readonly nonTrivial: number;
  readonly lines: number;
  readonly localName: string | null;
  readonly predicateName: string | null;
  /** Nombre de la función que DIRECTAMENTE contiene la condición (`""` si es anónima). */
  readonly ownerName: string;
  /** Nombre de la función de la que este HALLAZGO es (`""` si es anónima). */
  readonly findingSymbol: string;
  readonly file: string;
  readonly fnName: string | null;
  readonly startLine: number;
  readonly endLine: number;
}

const SOURCE = "https://refactoring.guru/es/decompose-conditional";
const TO_CONFIRM: readonly string[] = [
  "¿los términos de cada grupo responden a UNA pregunta que se pueda nombrar, o el grupo junta cosas que sólo comparten el operador? Si es lo segundo, poner paréntesis alcanza y no hace falta un predicado nuevo.",
  "¿algún término del grupo depende de una variable local que no esté disponible fuera de esta función? El predicado con nombre tendría que recibirla como parámetro.",
  "¿el orden de evaluación importa por costo (un término caro que hoy se saltea por cortocircuito)? Extraer el grupo lo conserva, pero conviene mirarlo.",
];

const mezclaSinParentesis: Check<Ctx, Graph> = {
  id: "mezcla-sin-parentesis",
  describe: `la condición junta \`&&\` y \`||\` colgando de la misma raíz, sin paréntesis que agrupen, con al menos ${MIN_OPERATORS} operadores (SonarSource S864)`,
  run: (c) =>
    !c.chain
      ? { holds: false, evidence: "no se pudo ubicar la cadena booleana en el árbol (sin árbol vivo o sin función encerrante): no demostrado." }
      : {
          holds: c.mixed && c.operators >= MIN_OPERATORS,
          evidence: `${c.operators} operadores lógicos encadenados, ${c.mixed ? "de las DOS familias (AND y OR)" : "de una sola familia"}; piso ${MIN_OPERATORS} y mezcla obligatoria.`,
        },
};

const condicionSinEfectos: Check<Ctx, Graph> = {
  id: "condicion-sin-efectos",
  describe: "ningún término de la condición asigna, incrementa, espera ni cede (con efectos, mover un grupo cambia CUÁNDO se evalúa, y el cortocircuito lo vuelve un cambio de comportamiento)",
  run: (c) =>
    !c.chain
      ? { holds: false, evidence: "sin cadena: no demostrado." }
      : c.effect === null
        ? { holds: true, evidence: "ningún nodo de la condición asigna, actualiza, espera ni cede: extraer un grupo a un predicado conserva el resultado." }
        : { holds: false, evidence: `la condición contiene un efecto (\`${c.effect}\`): extraerlo movería el efecto fuera del cortocircuito.` },
};

const gruposNombrables: Check<Ctx, Graph> = {
  id: "grupos-nombrables",
  describe: `la cadena mixta se parte en sub-cadenas homogéneas y al menos una tiene ${MIN_GROUP_TERMS} términos o más (si todas tienen uno, el único remedio es nombrar la condición ENTERA, que es otra técnica)`,
  run: (c) =>
    !c.chain
      ? { holds: false, evidence: "sin cadena: no demostrado." }
      : {
          holds: c.nameable.length >= 1,
          evidence: `${c.groups.length} sub-cadenas homogéneas (${c.groups.map((g) => `${g.family}×${g.terms}`).join(", ") || "ninguna"}); ${c.nameable.length} con al menos ${MIN_GROUP_TERMS} términos.`,
        },
};

/**
 * EL ANCLA DUEÑA — y el número que la obligó, medido en la corrida real.
 *
 * `boolean-complexity` es `intra-function` y corre sobre CADA `FunctionUnit`:
 * una condición dentro de funciones anidadas produce **un hallazgo por cada
 * función que la contiene**. Medido: la condición de `lodash/lodash.js:1482`
 * salió con TRES hallazgos —dos de funciones anónimas y uno de
 * `runInContext`— y sin desempate esta hipótesis publicaba la MISMA propuesta
 * tres veces, con texto idéntico. Es el mismo defecto de producto que la Ola
 * AS ya pagó en `Guard Clauses` (2 de sus 8 primeras propuestas eran un
 * duplicado) y que `guard-clauses.ts`/`extract-variable.ts` resuelven con un
 * check del mismo nombre.
 *
 * La regla: el hallazgo tiene que ser el de la función que DIRECTAMENTE
 * contiene la condición — la más chica de las que la envuelven, que es la que
 * `findEnclosingFunction` devuelve. Se compara por nombre, que es lo único
 * que el `Finding` publica de su función.
 *
 * LÍMITE DECLARADO, medido en el mismo caso: cuando DOS funciones anidadas son
 * las dos ANÓNIMAS (`lodash.js`, un IIFE dentro de otro), las dos tienen
 * nombre vacío y el desempate no las distingue — el `Finding` no publica nada
 * más de su función. En ese caso quedan 2 propuestas en vez de 3, no 1.
 * Cerrarlo del todo exigiría que el hallazgo llevara el rango de su función,
 * que es un campo de `detect/types.ts` y no de este archivo.
 */
const anclaDuena: Check<Ctx, Graph> = {
  id: "ancla-duena",
  describe: "este hallazgo es el de la función que DIRECTAMENTE contiene la condición (una condición dentro de funciones anidadas dispara un hallazgo por cada una: sin esto la misma propuesta sale una vez por nivel)",
  run: (c) =>
    !c.chain
      ? { holds: false, evidence: "sin cadena: no demostrado." }
      : {
          holds: c.ownerName === c.findingSymbol,
          evidence: `la condición vive directamente en \`${c.ownerName || "(función anónima)"}\` y este hallazgo es de \`${c.findingSymbol || "(función anónima)"}\`.`,
        },
};

const cadenaLarga: Check<Ctx, Graph> = {
  id: "cadena-larga",
  describe: `la cadena tiene ${DEEP_OPERATORS} operadores o más`,
  run: (c) => ({ holds: c.operators >= DEEP_OPERATORS, evidence: `${c.operators} operadores (>= ${DEEP_OPERATORS} sube un peldaño).` }),
};

const condicionMultilinea: Check<Ctx, Graph> = {
  id: "condicion-multilinea",
  describe: "la condición no entra en una línea (el lector la reconstruye a pedazos)",
  run: (c) => ({ holds: c.lines >= 2, evidence: `la condición ocupa ${c.lines} línea(s).` }),
};

const terminosCompuestos: Check<Ctx, Graph> = {
  id: "terminos-compuestos",
  describe: "al menos dos términos son expresiones compuestas (una comparación, una llamada, un acceso encadenado), no identificadores sueltos",
  run: (c) => ({ holds: c.nonTrivial >= 2, evidence: `${c.nonTrivial} términos compuestos de ${c.groups.reduce((s, g) => s + g.terms, 0)} contados.` }),
};

function appliedState(c: Ctx): AppliedStateResult {
  if (c.localName !== null) {
    return {
      state: "ya-aplicado",
      checks: [
        {
          label: "la condición ya tiene nombre en este mismo lugar",
          passed: true,
          why: `la cadena es el valor inicial del local \`${c.localName}\`: el nombre ya está puesto, lo que falta son paréntesis (otro consejo, no éste).`,
        },
      ],
    };
  }
  if (c.predicateName !== null) {
    return {
      state: "ya-aplicado",
      checks: [
        {
          label: "el predicado con nombre ya existe en el archivo",
          passed: true,
          why: `\`${c.predicateName}\` ya encierra exactamente esta expresión: el remedio existe y este sitio no lo usa.`,
        },
      ],
    };
  }
  return {
    state: "ausente",
    checks: [
      {
        label: "la condición no tiene nombre en ninguna parte del archivo",
        passed: true,
        why: "ni es el valor de un local con nombre, ni hay una función del archivo cuyo cuerpo sea esta expresión: el predicado no existe todavía.",
      },
    ],
  };
}

function buildSpec(): HypothesisSpec<Ctx, Graph> {
  return {
    pattern: "Decompose Conditional",
    ceiling: "alta",
    needs: [],
    required: [mezclaSinParentesis, condicionSinEfectos, gruposNombrables, anclaDuena],
    discriminators: [cadenaLarga, condicionMultilinea, terminosCompuestos],
    appliedState: (c) => appliedState(c),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── la traza ───────────────────────────────────────────────────────────── */

export interface DecomposeConditionalTraceEntry {
  readonly findingId: string;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly withFile: boolean;
  readonly operators: number;
  readonly mixed: boolean;
  readonly groups: number;
  readonly nameable: number;
  readonly effect: string | null;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly state: string | null;
  readonly emitted: boolean;
}

let trace: DecomposeConditionalTraceEntry[] | null = null;
export function startDecomposeConditionalTrace(): void {
  trace = [];
}
export function takeDecomposeConditionalTrace(): readonly DecomposeConditionalTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function placesOf(c: Ctx): readonly RoleLocation[] {
  const out: RoleLocation[] = [
    {
      file: c.file,
      startLine: c.startLine,
      endLine: c.endLine,
      symbol: c.fnName ?? undefined,
      role: `condición que mezcla AND con OR sin paréntesis: ${c.operators} operadores encadenados, ${c.groups.length} grupo(s) homogéneo(s) adentro`,
    },
  ];
  for (const g of c.nameable) {
    out.push({
      file: c.file,
      startLine: g.startLine,
      endLine: g.endLine,
      symbol: c.fnName ?? undefined,
      role: `grupo de ${g.terms} términos unidos por ${g.family} — candidato a predicado con nombre`,
    });
  }
  return out;
}

export const hypothesis: HypothesisBuilder = {
  id: "decompose-conditional",
  pattern: "Decompose Conditional",
  layer: "refactorizacion",
  anchors: ["boolean-complexity"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const loc = problem.locations[0];
    const fn = ctx.file && loc ? findEnclosingFunction(ctx.file, problem) : null;
    const chain = fn && loc ? chainAt(fn, loc.startLine, loc.endLine) : null;
    const shape = chain ? shapeOf(chain) : null;
    const groups = chain ? groupsOf(chain) : [];
    const c: Ctx = {
      chain,
      operators: shape?.operators ?? 0,
      mixed: (shape?.families.size ?? 0) >= 2,
      effect: chain ? effectsIn(chain) : null,
      groups,
      nameable: groups.filter((g) => g.terms >= MIN_GROUP_TERMS),
      nonTrivial: chain ? nonTrivialTerms(chain) : 0,
      lines: chain ? chain.endPosition.row - chain.startPosition.row + 1 : 0,
      localName: chain && fn ? isNamedLocalInitializer(chain, fn) : null,
      predicateName: chain && fn && ctx.file ? existingPredicate(chain, ctx.file, fn) : null,
      file: loc?.file ?? "",
      fnName: fn?.name ?? loc?.symbol ?? null,
      ownerName: fn?.name ?? "",
      findingSymbol: loc?.symbol ?? "",
      startLine: chain ? chain.startPosition.row + 1 : (loc?.startLine ?? 0),
      endLine: chain ? chain.endPosition.row + 1 : (loc?.endLine ?? 0),
    };
    const spec = buildSpec();
    const outcome = runEngine(spec, ctx.capabilities, c, graph);
    if (trace) {
      const checks = spec.required.map((k) => ({ id: k.id, holds: k.run(c, graph).holds }));
      trace.push({
        findingId: problem.id,
        file: c.file,
        line: c.startLine,
        symbol: c.fnName ?? "",
        withFile: ctx.file !== null,
        operators: c.operators,
        mixed: c.mixed,
        groups: c.groups.length,
        nameable: c.nameable.length,
        effect: c.effect,
        checks,
        diesAt: checks.find((k) => !k.holds)?.id ?? null,
        state: outcome?.state ?? null,
        emitted: outcome !== null,
      });
    }
    if (!outcome || !chain) return null;
    const grupo = c.nameable[0];
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(c),
      cost:
        `Un cambio dentro de la misma condición: ${c.nameable.length === 1 ? "el grupo" : `cada uno de los ${c.nameable.length} grupos`} ` +
        `de términos unidos por el mismo operador pasa a ser un predicado con nombre` +
        (grupo ? ` (el más grande junta ${grupo.terms} términos con ${grupo.family})` : "") +
        ". No cambia ninguna firma ni mueve nada de lugar, y el resultado de la condición es el mismo porque ninguno de sus términos tiene efectos; " +
        "el trabajo real es elegir el nombre, no la reescritura.",
    });
  },
};
