/**
 * `many-returns` — demasiados puntos de retorno en una función (PLAN.md §4.1
 * "Muchos puntos de retorno | función | gramática").
 *
 * RELACIÓN (qué mide, sin jerga de AST): cuántos nodos "return" pertenecen
 * DIRECTAMENTE al cuerpo de esta función, por encima de un umbral.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: en las gramáticas soportadas (Ruby,
 * JS/TS/TSX/Vue vía TS, Python, Java, Go, C#) un `return` es, o bien el tipo
 * de nodo literal `return` (Ruby) o bien `return_statement` (todo el resto,
 * confirmado por sonda directa contra cada gramática) — una única regex
 * genérica (`RETURN_WORD`) aplicada IDÉNTICAMENTE a todos los lenguajes,
 * mismo estilo que `TERNARY_NAME`/`LOOP_WORD` de `code-grammar.ts`.
 * Duplicada acá a propósito en vez de importarla, mismo criterio que
 * `capabilities.ts#TERNARY_NAME`: no crear una dependencia de un módulo
 * compartido hacia un detalle que sólo le importa a este detector. Nunca se
 * decide por vocabulario de dominio.
 *
 * "PERTENECE DIRECTAMENTE": un `return` dentro de un closure/callback
 * anidado (otro nodo cuyo tipo está en `fn.sets.functionNodes`, distinto de
 * la propia función) NO cuenta para la función que lo envuelve — ese closure
 * es, en el extractor real, su PROPIO `FunctionUnit` y recibe su propio
 * conteo cuando el runner lo visite por separado; contarlo acá también sería
 * a la vez un falso positivo (la función exterior no tiene tantos caminos de
 * salida como parece) y una doble contabilización del mismo `return` en dos
 * hallazgos distintos. La exclusión se resuelve con DOS pasadas de
 * `walkTree` — nunca un recorrido propio con poda: `walkTree` no soporta
 * "no descender", así que en vez de reimplementarlo, la primera pasada
 * recolecta los nodos función-like anidados y la segunda descarta cualquier
 * `return` cuya posición cae DENTRO del rango de alguno de ellos (containment
 * por posición, con los mismos `startPosition`/`endPosition` que ya expone
 * `AstNode` — nunca por ancestría explícita, que `walkTree` tampoco expone).
 * Nota Ruby: un `block`/`do_block` (`items.each do |x| … end`) está
 * deliberadamente EXCLUIDO de `functionNodes` (`functionExclusions`,
 * `code-analyzer.ts`), así que NO actúa como límite acá — y eso es lo
 * correcto: un `return` dentro de un bloque Ruby retorna del MÉTODO que lo
 * contiene, no del bloque (a diferencia de un `return` en un lambda/arrow
 * real de otro lenguaje), así que debe seguir contando para la función
 * envolvente.
 *
 * REDEFINICIÓN (ola de precisión — medida: 3/8 = 38 % antes de esta ola →
 * 20/25 = 80 % después, muestra estratificada `tests/golden/precision`,
 * fresca sobre 4 lenguajes reales — java 5/6 (83 %), python 10/12 (83 %),
 * csharp 4/6 (67 %), ruby 1/1 —, confirmado además por RE-MUESTREO real
 * post-arreglo: de las 5 filas "falso" ya juzgadas antes de esta ola
 * (`click#readable`, `click#writable`, `jekyll#load_theme_configuration`,
 * `newtonsoft-json#IsDictionaryType`, todas guardas-clásicas secuenciales),
 * las 4 YA NO SE EMITEN — el analizador dejó de encontrarlas al re-correr
 * sobre el mismo código, confirmado por `stillPresent=false` en la planilla
 * — y la única que sigue viva, `click#__getattr__` (despacho plano con
 * cuerpos de varios statements, no guarda clásica), sigue "falso" tal cual
 * estaba, exactamente la consecuencia que predice la regla de abajo):
 * "muchos returns" ahora cuenta los `return` que aparecen DESPUÉS de que
 * empezó la lógica sustantiva de la función — no todos, plano. La versión
 * anterior contaba cada `return` por igual, sin distinguir una guarda
 * temprana de línea única (`if (x == null) return;`) de un `return` disperso
 * en medio de una rama con lógica real, pese a que la propia literatura
 * citada (Fowler/Kerievsky, "Replace Nested Conditional with Guard Clauses")
 * describe la PRIMERA forma como la práctica recomendada, no como el smell.
 * Medido real en la muestra juzgada (python/csharp/ruby, 5 de 5 "falso"
 * fueron exactamente esta forma): click `_compat.py#readable`/`#writable`
 * (2-3 guardas de una línea antes de un `try`/`except`), jekyll
 * `site.rb#load_theme_configuration` (4 guardas `return x if/unless cond`
 * seguidas, Ruby), Newtonsoft `CollectionUtils.IsDictionaryType` (3 `if
 * (...) { return true; }` seguidos de un `return false` final, C#).
 *
 * LA REGLA ESTRUCTURAL (genérica, sin vocabulario de dominio ni atajo por
 * lenguaje): se recorren los statements de NIVEL SUPERIOR del cuerpo de la
 * función, en orden. Mientras cada uno sea o bien (a) una "guarda clásica"
 * — un `if` (o el `if`/`unless` modifier de Ruby, misma forma de campos)
 * SIN rama alternativa (`else`/`elsif`/`unless` propio — campo `alternative`
 * ausente) cuyo ÚNICO contenido es un `return` — o bien (b) un statement
 * que no contiene NINGÚN `return` propio de esta función (una asignación,
 * una llamada, una declaración local: preparación tolerada, no lógica
 * sustantiva todavía), el `return` de (a) queda EXCLUIDO del conteo y el
 * recorrido sigue. El PRIMER statement que NO es (a) NI (b) — un `if` con
 * rama alternativa, un lazo, un `try`, cualquier cosa que SÍ contenga uno de
 * los `return` propios de la función sin ser una guarda de una sola línea —
 * cierra el prefijo: desde ahí, TODO `return` restante cuenta normal,
 * incluida cualquier guarda de forma idéntica que aparezca después (una
 * guarda que sigue a lógica real ya no es "salir temprano antes de
 * empezar", es un punto de salida disperso en medio del cuerpo). La forma en
 * sí (campos `condition`/`consequence`/`alternative`/`body` — mismo
 * mecanismo que `code-grammar.ts#isIfLike` y que
 * `flag-accumulator.ts#pickCandidate` ya usan) es idéntica en las 6
 * gramáticas soportadas — confirmado por sonda directa contra las 6 con la
 * forma sin llaves (`if (!a) return null;`, el `consequence` resuelve
 * DIRECTO al nodo `return`) y con llaves (`consequence` resuelve a un bloque
 * de UN solo hijo nombrado, ese hijo el `return`).
 *
 * QUÉ SIGUE SIENDO EL MISMO SMELL: una función DONDE la lógica sustantiva sí
 * empezó (una asignación seguida de trabajo real, un lazo, un `try`) y a
 * partir de ahí siguen apareciendo `return` — con forma de guarda o no — es
 * exactamente el caso que este detector debe seguir señalando. Confirmado
 * con casos reales marcados "verdadero" en la muestra: `cleanup-service.ts
 * #waitForPidDeath` (máquina de estados con señales/delays ENTRE cada
 * guarda — el primer `if (pid == null) return;` es preámbulo y se excluye,
 * pero el `while` que sigue de inmediato SÍ contiene retornos propios y
 * cierra el prefijo ahí, así que los 4 restantes cuentan) y
 * `_termui_impl.py#get_editor` (una cadena de estrategias de resolución en
 * orden de prioridad, cada rama con trabajo real distinto).
 *
 * FALSOS POSITIVOS CONOCIDOS QUE SIGUEN SIN ARREGLO (declarado, no
 * escondido): "despacho plano por valor" cuando cada rama NO es una guarda
 * de una sola línea — `click/__init__.py#__getattr__` (`if name == "X": ...
 * (import + warn); return Y`, repetido 6 veces): cada `if` tiene VARIOS
 * statements en su cuerpo, no sólo el `return`, así que no matchea la forma
 * de guarda-clásica de arriba y ninguno de los 6 se excluye. Distinguir esta
 * forma exigiría reconocer "estas 6 ramas son mutuamente excluyentes sobre
 * la MISMA variable" (el equivalente de un `switch` escrito a mano) — una
 * heurística de forma bastante más frágil que la de arriba (¿cuántas ramas?
 * ¿comparando la misma variable con qué operador?) y sin un caso confirmado
 * todavía en más de un lenguaje del corpus para justificar su costo; queda
 * documentado, no resuelto.
 *
 * LÍMITES DECLARADOS POR LENGUAJE: ninguno confirmado — todas las gramáticas
 * soportadas resuelven un nodo de retorno explícito bajo `RETURN_WORD`, y
 * las 6 resuelven la forma de guarda (arriba) de manera estructuralmente
 * idéntica.
 */
import { citado } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "maxReturns";

/** `return` (Ruby) | `return_statement` (JS/TS/TSX/Vue/Python/Java/Go/C#) — ver docstring del módulo. */
const RETURN_WORD = /^return(_statement)?$/;

/** `true` si `position` cae dentro del rango `[start, end]` (inclusive) de `container`. */
function containsPosition(container: AstNode, position: { row: number; column: number }): boolean {
  const startsAtOrAfter =
    position.row > container.startPosition.row ||
    (position.row === container.startPosition.row && position.column >= container.startPosition.column);
  const endsAtOrBefore =
    position.row < container.endPosition.row ||
    (position.row === container.endPosition.row && position.column <= container.endPosition.column);
  return startsAtOrAfter && endsAtOrBefore;
}

/** `row:column` — clave de posición para comparar dos referencias a lo que
 *  puede ser el MISMO nodo obtenidas de recorridos distintos, sin depender
 *  de identidad de objeto (mismo criterio que ya usa `containsPosition`). */
function posKey(position: { row: number; column: number }): string {
  return `${position.row}:${position.column}`;
}

/** `while`/`for`/`until`/`do` — comparte la MISMA forma de campos
 *  (`condition`+`body`) que una guarda en varias gramáticas (el
 *  `if`/`unless` modifier de Ruby en particular: `expr if cond` y `expr
 *  while cond` resuelven idéntico) — hay que descartarlo por nombre de tipo
 *  antes de tratar un nodo como candidato a guarda. Mismo vocabulario que
 *  `flag-accumulator.ts#LOOP_NODE_TYPE`, duplicado acá a propósito (mismo
 *  criterio que `RETURN_WORD` arriba: sin dependencia cruzada entre
 *  detectores). */
const LOOP_NODE_TYPE = /^(while|for|until|do)(_statement|_in_statement)?$/;

function isLoopNode(node: AstNode): boolean {
  return LOOP_NODE_TYPE.test(node.type);
}

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

/**
 * El `return` que `stmt` protege si (y sólo si) `stmt` es una guarda
 * clásica: tiene `condition`, NO tiene `alternative` (ninguna rama else), no
 * es un lazo (mismo campo `condition`+`body` que un `if`/`unless` modifier
 * de Ruby — ver `LOOP_NODE_TYPE`), y su rama única (`consequence` o, a falta
 * de ese campo, `body` — el modifier-if de Ruby sólo resuelve `body`)
 * contiene EXACTAMENTE un `return` y ningún otro statement. `null` si
 * cualquiera de esas condiciones no se cumple — ver el docstring del módulo.
 */
function guardedReturn(stmt: AstNode): AstNode | null {
  if (!hasField(stmt, "condition") || isLoopNode(stmt) || hasField(stmt, "alternative")) return null;
  const consequence =
    (stmt.childForFieldName("consequence") as AstNode | null) ?? (stmt.childForFieldName("body") as AstNode | null);
  if (!consequence) return null;
  if (RETURN_WORD.test(consequence.type)) return consequence;
  const kids = namedChildren(consequence);
  return kids.length === 1 && RETURN_WORD.test(kids[0]!.type) ? kids[0]! : null;
}

/**
 * Claves de posición (`posKey`) de los `return`, dentro de `ownReturns`, que
 * quedan excluidos del conteo por ser parte del PREFIJO inicial de guardas
 * clásicas del cuerpo de `fn` — ver "LA REGLA ESTRUCTURAL" en el docstring
 * del módulo. `ownReturns` ya llegó filtrado de closures anidados; esta
 * función sólo decide, de ESE conjunto, cuáles todavía son preámbulo.
 */
function leadingGuardExclusions(fn: FunctionUnit, ownReturns: readonly AstNode[]): Set<string> {
  const excluded = new Set<string>();
  const body =
    (fn.node.childForFieldName("body") as AstNode | null) ?? (fn.node.childForFieldName("consequence") as AstNode | null);
  if (!body) return excluded;

  for (const stmt of namedChildren(body)) {
    const guarded = guardedReturn(stmt);
    if (guarded) {
      excluded.add(posKey(guarded.startPosition));
      continue; // sigue siendo preámbulo — otra guarda puede seguir.
    }
    // ¿Este statement contiene alguno de los `return` PROPIOS de `fn`? Si
    // ninguno, es preparación tolerada (asignación, llamada, declaración) y
    // el prefijo sigue; si contiene al menos uno, la lógica sustantiva ya
    // empezó y el prefijo termina ACÁ — todo lo que sigue cuenta normal.
    const containsOwnReturn = ownReturns.some((r) => containsPosition(stmt, r.startPosition));
    if (containsOwnReturn) break;
  }
  return excluded;
}

export const detector: IntraFunctionDetector<ThresholdKey, "many-returns"> = {
  id: "many-returns",
  kind: "many-returns",
  scope: "intra-function",
  title: "Muchos puntos de retorno",
  needs: [],
  thresholds: {
    // SonarSource S1142 ("Methods should not contain too many return
    // statements"): parámetro `max` con valor por defecto 3 — la regla se
    // dispara cuando la cantidad REAL de `return` EXCEDE ese máximo, así que
    // el disparo abajo es `> threshold.value`, no `>=`.
    maxReturns: citado(3, {
      work: "SonarSource",
      rule: "S1142",
      url: "https://rules.sonarsource.com/rspec/S1142",
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("maxReturns");

    // Primera pasada: closures/callbacks función-like anidados DENTRO de esta
    // función — sus propios `return` no le pertenecen a `fn` (ver docstring).
    const nested: AstNode[] = [];
    walkTree(fn.node, (node) => {
      if (node === fn.node) return; // la propia función también matchea `functionNodes`; no es "anidada" de sí misma.
      if (node.isNamed && fn.sets.functionNodes.has(node.type)) nested.push(node as AstNode);
    });

    // Segunda pasada: todo `return` cuya posición no cae dentro de ninguno de
    // los closures recolectados arriba.
    const ownReturns: AstNode[] = [];
    walkTree(fn.node, (node) => {
      if (!node.isNamed || !RETURN_WORD.test(node.type)) return;
      const real = node as AstNode;
      if (nested.some((n) => containsPosition(n, real.startPosition))) return;
      ownReturns.push(real);
    });

    // Tercera pasada (REDEFINICIÓN — ver docstring): descarta el PREFIJO
    // inicial de guardas clásicas del cuerpo — no cuentan como "muchos
    // caminos de salida", cuentan como el estilo recomendado por
    // Fowler/Kerievsky para resolver casos borde antes de que empiece la
    // lógica sustantiva.
    const excludedKeys = leadingGuardExclusions(fn, ownReturns);
    const countedReturns = ownReturns.filter((r) => !excludedKeys.has(posKey(r.startPosition)));

    if (countedReturns.length <= threshold.value) return [];

    return [
      {
        title: `"${fn.name ?? "función anónima"}" tiene ${countedReturns.length} puntos de retorno`,
        detail:
          "Tantos caminos de salida distintos obligan a reconstruir mentalmente todo el recorrido " +
          "posible de la función para saber qué devuelve en cada caso, en vez de poder leerla de arriba a abajo.",
        trigger: [{ label: "puntos de retorno", value: countedReturns.length, threshold }],
        locations: [
          {
            file: fn.file,
            startLine: fn.startLine,
            endLine: fn.endLine,
            symbol: fn.name ?? undefined,
            role: "función con exceso de puntos de retorno",
          },
        ],
        severity: Math.min(100, 30 + countedReturns.length * 10),
        advice: {
          primary: {
            name: "Consolidate Conditional Expression",
            kind: "refactorizacion",
            why: "Concentrar la decisión en una única variable de resultado (o extraer cada rama a su propia función) deja un solo punto de salida por el que pasa cualquier lector.",
            source: "https://refactoring.guru/es/consolidate-conditional-expression",
          },
        },
      },
    ];
  },
};
