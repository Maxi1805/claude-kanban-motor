/**
 * `boolean-complexity` — condicional booleano complejo (PLAN.md §4.1
 * "Condicional booleano complejo | función | gramática", SonarSource S1067
 * "Expressions should not be too complex").
 *
 * REDEFINICIÓN (ola de precisión, ver `<docs del proyecto>/RAICES.md`):
 * la versión anterior de este detector contaba TODO operador lógico
 * encadenado, mezclado o no, y disparaba con el solo largo de la cadena.
 * Precisión medida: 0/18 en el veredicto humano de
 * `tests/golden/precision` — y al ampliar la muestra a 19 filas juzgadas
 * (agregando `ck-analyzer`), 19/19 "falso". El patrón en las 19 es uno
 * solo, repetido en JS/TS/Ruby/C#/Python/Go/Java: TODAS son cadenas
 * HOMOGÉNEAS (un solo operador, `&&` o `||`, nunca los dos mezclados en la
 * cadena contada) — guard clauses de precondiciones independientes
 * (`newtonsoft-json`, `click`), membership checks / enumeraciones
 * (`rubocop`, `nest`, `preact`, `hugo`, `sqlalchemy`), o el idiomatismo
 * `equals()` de Java comparando campo a campo (`guava`) — y ninguna
 * resultó difícil de leer para el juez humano pese a contar hasta 13
 * operadores (`hugo/commands/hugobuilder.go`). El propio docstring anterior
 * ya lo anticipaba en su sección "FALSOS POSITIVOS CONOCIDOS": "el defecto
 * real que la regla persigue es la MEZCLA de `&&` y `||` sin paréntesis que
 * oscurece la precedencia, no la sola longitud — este detector no
 * distingue una cosa de la otra, cuenta operadores, no ambigüedad de
 * precedencia." Diagnóstico: CRITERIO-NO-DESCRIBE-EL-FENÓMENO — el nombre
 * ("complejidad booleana") y el propio texto del hallazgo ya hablaban de
 * "tabla de verdad" y "mezcla... agrega ambigüedad de precedencia", pero la
 * implementación nunca comprobaba que hubiera mezcla, sólo contaba.
 *
 * DEFINICIÓN NUEVA: dentro de una función, una expresión booleana cuya
 * cadena de operadores lógicos ENCADENADOS (mismo criterio estructural de
 * siempre, ver más abajo) MEZCLA de verdad `&&`/`and` con `||`/`or` — al
 * menos un operador de cada familia colgando de la MISMA raíz booleana SIN
 * paréntesis explícitos que ya la desambigüen — y además supera el umbral
 * de cantidad total. Una cadena homogénea (todo `&&` o todo `||`, sin
 * importar cuán larga) YA NO dispara: leer N términos independientes del
 * mismo tipo, uno por uno, no exige reconstruir una tabla de verdad — leer
 * una mezcla sin paréntesis sí, porque hay que recordar qué operador ata
 * más fuerte. "Sin paréntesis explícitos que ya la desambigüen" no es una
 * salvedad textual: es estructural y gratis con el mismo mecanismo de
 * `isLogicalBinary` de abajo — un operando envuelto en paréntesis en el
 * código fuente se parsea como un nodo de OTRA forma (sin campos genéricos
 * `left`/`right`/`operator` en su nivel externo), así que la cadena ya se
 * detiene ahí sola: `(a && b) || (c && d) || (e && f)` cuenta como 2
 * operadores homogéneos (`||`) con dos hijos opacos, nunca como una mezcla
 * de 4. Confirmado con el propio caso de `hugo/tpl/transform/transform.go`
 * (`r == 0x9 || r == 0xA || r == 0xD || (r >= 0x20 && r <= 0xD7FF) || …`):
 * la cadena contada por el detector ANTERIOR ya daba 5 (todo `||`), no 8 —
 * la mezcla textual con `&&` ya estaba resuelta por los propios paréntesis
 * del autor antes de que este detector la viera, y por eso ni siquiera
 * hacía falta la regla nueva para descartar ese caso puntual (cae también
 * por homogeneidad); lo que la regla nueva agrega es exigir mezcla REAL
 * (no resuelta por paréntesis) como condición necesaria, no sólo
 * suficiente-por-longitud.
 *
 * "Encadenados" = todos los que cuelgan de la MISMA raíz booleana sin
 * paréntesis intermedios (`a && b || c && d`, SIN paréntesis en el fuente,
 * cuenta 3 operadores de una sola cadena — y esta SÍ mezcla `&&`/`||` de
 * verdad, porque la gramática arma ese árbol por PRECEDENCIA implícita, no
 * porque el autor haya agrupado nada a la vista: exactamente el caso que
 * obliga a recordar que `&&` ata más fuerte que `||` para leerlo bien).
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: un nodo se clasifica como "operador
 * lógico" únicamente por FORMA — expone los mismos dos campos genéricos
 * `left`/`right` que CUALQUIER operación binaria de las gramáticas
 * soportadas (aritmética, comparación, lógica: `binary_expression` en
 * JS/TS/TSX/Vue/Java/Go/C#, `binary` en Ruby, `boolean_operator` en Python)
 * MÁS un tercer campo genérico `operator` cuyo TOKEN resuelto se compara
 * contra una única regex de vocabulario aplicada IDÉNTICAMENTE a todos los
 * lenguajes (`LOGICAL_OPERATOR_TOKEN`) — nunca el nombre del nodo (que en la
 * mayoría de las gramáticas es COMPARTIDO entre aritmética/comparación/
 * lógica, así que no alcanza por sí solo) ni una lista de vocabulario por
 * lenguaje. Mismo criterio que `TERNARY_NAME`/`LOOP_WORD` en
 * `code-grammar.ts`: el vocabulario es compartido y mínimo (dos símbolos más
 * dos palabras), nunca una lista por lenguaje. Confirmado por sonda directa
 * contra las 7 gramáticas: Ruby resuelve `and`/`or` con la MISMA forma
 * (`left`/`right`/`operator`) que `&&`/`||` — a diferencia de lo que
 * documenta `code-grammar.ts` para su propio propósito (ahí "and"/"or" no
 * entran en `chainNodes`/`branchNodes` porque ese módulo los evalúa como
 * candidatos a PELDAÑO de una escalera if/elsif, un problema distinto), acá
 * SÍ hay campo que consultar y por eso Ruby cubre ambas formas sin excepción
 * de lenguaje.
 *
 * SIMPLIFICACIÓN DECLARADA: S1067, en su forma completa de SonarSource,
 * también cuenta el operador ternario (`?:`) como parte de la misma
 * complejidad de expresión. Este detector NO lo hace — el problema asignado
 * es específicamente "condición con demasiados operadores lógicos
 * encadenados", así que sólo se cuentan `&&`/`||`/`and`/`or`. Es una pata más
 * angosta que el S1067 completo, declarada así a propósito: no resta nada de
 * lo que la complejidad cognitiva (S3776, ya migrada a `FunctionMetrics.
 * cognitive`) penaliza — esta señal es ADICIONAL y más específica, nunca un
 * reemplazo ni una resta de aquélla.
 *
 * FALSOS POSITIVOS CONOCIDOS (qué forma legítima se confunde con esto):
 *   - Un guard clause de validación exhaustiva (`if (a == null || b == null
 *     || c == null || d == null) throw …`) era la forma legítima que más se
 *     confundía con la versión ANTERIOR del detector (cuenta pura, sin exigir
 *     mezcla) — las 19/19 filas juzgadas en `tests/golden/precision` fueron,
 *     todas, una variante de esto. La redefinición de arriba lo resuelve DE
 *     RAÍZ, no como excepción: una cadena homogénea nunca junta dos familias
 *     de operador, así que la condición de mezcla nunca se cumple para ella,
 *     sin importar cuán larga sea.
 *   - En C# (9+), la alternancia de patrones de tipo (`x is int or string or
 *     double`) se parsea con la MISMA forma (`left`/`right`/`operator`,
 *     token `or`) que una disyunción booleana real — confirmado por sonda
 *     directa (`or_pattern`). Sigue siendo cierto que este detector la
 *     contaría igual que una disyunción real (misma forma estructural), pero
 *     con la redefinición ya no importa en la práctica: una alternancia de
 *     patrones de tipo es casi siempre homogénea (`or` tras `or`), así que
 *     la exigencia de mezcla la deja afuera salvo que el propio patrón MEZCLE
 *     `and`/`or` sin paréntesis — caso en el que el mismo argumento de
 *     ambigüedad de precedencia aplica igual de bien a patrones que a bools.
 *   - Extraer la condición a una variable/función con nombre (el refactor
 *     recomendado) hace desaparecer el hallazgo aunque la lógica siga
 *     siendo exactamente la misma cantidad de comparaciones: la métrica mide
 *     la condición TAL COMO ESTÁ ESCRITA en este punto del código, no la
 *     complejidad esencial del problema que resuelve.
 *   - Sigue sin quedar cubierto (limitación declarada, no arreglada acá): una
 *     mezcla real de `&&`/`||` que el propio equipo considera parte de un
 *     idiomatismo estable del dominio (p.ej. una fórmula matemática con
 *     precedencia estándar bien conocida) puede seguir siendo un falso
 *     positivo — la regla nueva reduce drásticamente el universo de disparo
 *     pero no verifica legibilidad semántica, sólo la forma sintáctica de la
 *     mezcla.
 *
 * LÍMITES DECLARADOS POR LENGUAJE: ninguno confirmado — las 7 gramáticas
 * soportadas resuelven `left`/`right`/`operator` para su forma de `&&`/`||`
 * (o `and`/`or`), así que no hay un lenguaje soportado sin cobertura
 * estructural para este hallazgo.
 *
 * CORRECCIÓN DE UMBRAL (segunda ola, ver `RAICES.md` PENDIENTES §1-BIS "el
 * apagado"): la REDEFINICIÓN de arriba (exigir mezcla real) fue correcta,
 * pero quedó conjugada con el `max=3` heredado de S1067 (un umbral pensado
 * para el criterio VIEJO de conteo puro, nunca para "mezcla"). El caso
 * mínimo de mezcla real encadenada, `a && b || c && d` (3 operadores), no
 * superaba `> 3` y por lo tanto NUNCA disparaba — apagando el detector de
 * facto: 289 hallazgos → 10 en el corpus de 13 repos, doce repos en cero, y
 * los 10 sobrevivientes concentrados en dos archivos vendorizados de hugo.
 * El umbral pasa a citar S864 ("las expresiones que mezclan && y || deben
 * llevar paréntesis", sin `max` de cantidad en la regla de Sonar) con piso
 * en 2 — el mínimo que sigue dejando pasar el caso de 3 operadores. Ver el
 * comentario junto a `operatorCount` más abajo para el detalle completo.
 *
 * OLA O, FRENTE N10 — "CÓDIGO QUE NO ES PRODUCTO". Este detector consume la
 * primitiva compartida de esa raíz (`detect/primitivas/n10-no-es-producto.ts`)
 * para no acusar una condición escrita dentro de un ARNÉS DE TEST. Lo que
 * SÍ queda sin cubrir, y está medido en vez de supuesto: de los 9 hallazgos
 * que este detector produce hoy sobre los 13 repos del corpus, 7 están en
 * archivos VENDORIZADOS (`hugo/tpl/internal/go_templates/**`, la copia de
 * `text/template`+`html/template` de la stdlib de Go — 6; y
 * `hugo/livereload/livereload.js` — 1), y los 2 restantes (`click/src/click/
 * _textwrap.py`) son los juzgados VERDADEROS. La primitiva TIENE el criterio
 * estructural que reconoce los 6 primeros (procedencia declarada ajena), pero
 * NO se puede consultar desde acá: decide por ARCHIVO y necesita la cabecera
 * del archivo, que un detector `intra-function` no recibe (`FunctionUnit` trae
 * el nodo de la función, nunca el del archivo). Su lugar es la ingesta —
 * ver `claude-kanban-docs/ola-o/informes/N10.md`, "PIDO A OTRO FRENTE".
 */
import type { ProbeNode } from "../../code-grammar.js";
import { arnesPorNombreDeDescubrimiento } from "../primitivas/n10-no-es-producto.js";
import { citado } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "operatorCount";

/**
 * Vocabulario COMPARTIDO, aplicado idénticamente a todo lenguaje: los dos
 * símbolos (`&&`/`||`, universales en toda gramática tipo-C y en Ruby) más
 * las dos palabras que Python usa siempre y que Ruby admite como alternativa
 * de baja precedencia — nunca una lista por lenguaje. Se compara contra el
 * TOKEN resuelto del campo `operator`, no contra el tipo del nodo contenedor.
 */
const LOGICAL_OPERATOR_TOKEN = /^(&&|\|\||and|or)$/;

/**
 * Familia del operador — la mitad de la definición nueva. `&&`/`and` son la
 * MISMA familia lógica (conjunción), `||`/`or` la otra (disyunción); una
 * cadena "mezcla de verdad" cuando junta las dos, no cuando junta el símbolo
 * con su forma-palabra (eso sigue siendo una sola familia). El nombre del
 * token ya viene filtrado por `LOGICAL_OPERATOR_TOKEN` en todo call-site real
 * (`isLogicalBinary`), así que sólo estas cuatro cadenas llegan acá.
 */
type OperatorFamily = "AND" | "OR";
function operatorFamily(token: string): OperatorFamily {
  return token === "&&" || token === "and" ? "AND" : "OR";
}

function hasField(node: ProbeNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

/** `true` cuando `node` es una operación binaria (`left`+`right`+`operator`, forma genérica) cuyo operador resuelve al vocabulario lógico compartido. */
function isLogicalBinary(node: ProbeNode): boolean {
  if (!node.isNamed || !hasField(node, "left") || !hasField(node, "right")) return false;
  const operator = node.childForFieldName("operator");
  return operator !== null && LOGICAL_OPERATOR_TOKEN.test(operator.type);
}

/** Ancla de identidad por posición — nunca por referencia de objeto (el binding de `web-tree-sitter` no garantiza identidad estable entre dos accesos al mismo nodo). */
function nodeKey(node: AstNode): string {
  return `${node.startPosition.row}:${node.startPosition.column}:${node.endPosition.row}:${node.endPosition.column}`;
}

/** Resultado de recorrer una cadena: cuántos operadores tiene y qué familias (AND/OR) aparecieron. */
interface ChainShape {
  readonly count: number;
  readonly families: ReadonlySet<OperatorFamily>;
}

/**
 * Recorre la cadena que cuelga de `node` (ya confirmado lógico), siguiendo
 * ÚNICAMENTE los campos genéricos `left`/`right` — no un recorrido de árbol
 * completo: una cadena booleana no se ramifica hacia hijos que no forman
 * parte de la MISMA expresión (p.ej. un argumento de una llamada anidada).
 * Un operando entre paréntesis en el fuente se parsea como un nodo de OTRA
 * forma (sin `left`/`right`/`operator` en su nivel externo) y por lo tanto
 * falla `isLogicalBinary`: la cadena se detiene ahí SOLA, sin lógica
 * adicional — así una mezcla ya resuelta por paréntesis nunca llega a
 * juntarse en el mismo `ChainShape.families`. Marca cada nodo consumido en
 * `claimed` para que el `walkTree` exterior no lo procese una segunda vez
 * como cadena propia cuando lo visite más abajo — así una cadena de N
 * operadores produce UN solo hallazgo con conteo N, nunca N-1 hallazgos
 * anidados con conteos decrecientes.
 */
function walkChain(node: AstNode, claimed: Set<string>): ChainShape {
  claimed.add(nodeKey(node));
  const operatorField = node.childForFieldName("operator") as AstNode;
  let count = 1;
  const families = new Set<OperatorFamily>([operatorFamily(operatorField.type)]);
  for (const field of ["left", "right"] as const) {
    const child = node.childForFieldName(field) as AstNode | null;
    if (child && isLogicalBinary(child)) {
      const sub = walkChain(child, claimed);
      count += sub.count;
      for (const family of sub.families) families.add(family);
    }
  }
  return { count, families };
}

export const detector: IntraFunctionDetector<ThresholdKey, "boolean-complexity"> = {
  id: "boolean-complexity",
  kind: "boolean-complexity",
  scope: "intra-function",
  title: "Condicional booleano complejo",
  needs: [],
  thresholds: {
    // CORRECCIÓN (ver `<docs del proyecto>/RAICES.md`, PENDIENTES
    // §1-BIS "el apagado"): este umbral citaba antes S1067 con `max=3`
    // — el "max" por defecto de Sonar para la complejidad DE CONTEO, una
    // regla que nunca exigió mezcla. Al agregar la exigencia de mezcla real
    // (ver docstring de cabecera) SIN bajar ese `max`, quedó conjugado un
    // requisito de FORMA (mezcla) con un umbral de MAGNITUD pensado para el
    // criterio viejo (conteo puro) — y el caso mínimo de mezcla real,
    // `a && b || c && d`, tiene exactamente 3 operadores: con `max=3` y
    // disparo por `> threshold.value`, ESE CASO NUNCA DISPARABA. Medido:
    // 289 hallazgos → 10, doce de trece repos del corpus en cero, y los 10
    // sobrevivientes concentrados en dos archivos vendorizados de hugo — un
    // detector apagado, no arreglado (precisión post-cambio indemostrable,
    // 0/4 veredictos vivos, bajo el mínimo de base de `MIN_JUDGED_FOR_SIGNAL`).
    //
    // El ancla correcta para "mezcla sin paréntesis" es SonarSource S864
    // ("las expresiones que mezclan && y || deben llevar paréntesis") — regla
    // que persigue exactamente esta MEZCLA ambigua y que Sonar publica SIN
    // `max` de cantidad: cualquier mezcla real sin paréntesis ya es motivo de
    // aviso. Este detector conserva un piso de MAGNITUD (no lo elimina del
    // todo, a diferencia de Sonar) porque sigue exigiendo "cadena
    // ENCADENADA" (ver docstring de cabecera) y una mezcla de sólo 2
    // operadores en 2 términos (`a && b || c`, el caso más chico posible) es
    // indistinguible en la práctica de una precedencia obvia de 2 términos;
    // el piso de 2 es el mínimo que sigue dejando pasar el caso mínimo de
    // TRES operadores encadenados que S864 sí describe como ambiguo
    // (`a && b || c && d`, 3 operadores: `3 > 2` dispara). Mismo criterio de
    // disparo que el resto del catálogo (`> threshold.value`, no `>=`; igual
    // que `many-returns`/S1142).
    operatorCount: citado(2, {
      work: "SonarSource",
      rule: "S864",
      url: "https://rules.sonarsource.com/rspec/S864",
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    // Ola O / N10 — ver el docstring del módulo. Una condición dentro de un
    // método de arnés no describe una regla del producto: describe el caso
    // que el arnés está montando, y nadie la va a refactorizar.
    if (arnesPorNombreDeDescubrimiento(fn)) return [];

    const threshold = ctx.threshold("operatorCount");
    const findings: RawFinding[] = [];
    const claimed = new Set<string>();

    walkTree(fn.node, (node) => {
      if (!isLogicalBinary(node)) return;
      const real = node as AstNode;
      if (claimed.has(nodeKey(real))) return; // ya contado como parte de una cadena exterior

      const { count, families } = walkChain(real, claimed);
      if (count <= threshold.value) return;
      if (families.size < 2) return; // cadena homogénea (todo && o todo ||): sin mezcla no hay ambigüedad de precedencia que señalar

      const startLine = real.startPosition.row + 1;
      const endLine = real.endPosition.row + 1;
      findings.push({
        title: `Condición con ${count} operadores lógicos mezclados (&&/||) sin paréntesis en "${fn.name ?? "función anónima"}"`,
        detail:
          "Una expresión booleana que mezcla && con || (o and/or) sin paréntesis explícitos que agrupen cada " +
          "parte obliga al lector a recordar qué operador ata más fuerte para reconstruir mentalmente la tabla " +
          "de verdad; el mismo largo con un solo tipo de operador no tiene ese problema, se lee término a término.",
        trigger: [{ label: "operadores lógicos mezclados en la cadena", value: count, threshold }],
        locations: [
          {
            file: fn.file,
            startLine,
            endLine,
            symbol: fn.name ?? undefined,
            role: "condición que mezcla && y || sin paréntesis explícitos",
          },
        ],
        severity: Math.min(100, 30 + count * 10),
        advice: {
          primary: {
            name: "Decompose Conditional",
            kind: "refactorizacion",
            why: "Extraer sub-condiciones con nombre (o toda la expresión a una función que describa qué pregunta responde) reduce la cadena visible a un solo término por vez, sin cambiar el comportamiento.",
            source: "https://refactoring.guru/es/decompose-conditional",
          },
        },
      });
    });

    return findings;
  },
};
