/**
 * `repeated-switch` — switch repetido sobre el mismo discriminante (F1: uno
 * de los tres `CodeFindingKind` declarados en `types.ts`/la UI que nadie
 * emitía nunca, CONTRATOS.md/PLAN.md §4.1 "Switch repetido | archivo |
 * gramática (llena `repeated-switch`)").
 *
 * Relación: el MISMO discriminante (texto normalizado del sujeto) decidido
 * por un switch/case/match en ≥2 lugares DISTINTOS del mismo archivo — cada
 * tipo/caso nuevo obliga a tocar todos ellos, la señal clásica de un
 * polimorfismo pendiente (Fowler, "Refused Bequest"/"Switch Statements").
 *
 * Deliberadamente sobre `switchContainerNodes` (F1, `code-grammar.ts`), NO
 * sobre `chainNodes` — ese conjunto fusiona if/elsif y switch/case bajo un
 * mismo "cuántos peldaños tiene la escalera", que es lo que la métrica de
 * cadena de condicionales necesita; "switch repetido" es específicamente
 * sobre switches reales, nunca una escalera de `if`.
 *
 * El "sujeto" se extrae por CAMPO, probando los nombres genéricos que las
 * gramáticas soportadas usan (confirmado por sonda directa): `value`
 * (JS/TS/Vue/Ruby/Go/C#), `subject` (el `match` de Python), `condition`
 * (el `switch` de Java) — nunca vocabulario de dominio, sólo nombres de
 * campo, la misma técnica que `extractSuperclass` ya usa en
 * `pattern-structural.ts`.
 *
 * EVIDENCIA (Ola N, frente A5b) — 41 juicios en la planilla de veredictos,
 * 28 "dudoso" y sólo 1 falso: el detector no está mal definido, no supo
 * EXPLICARSE. Nota repetida, textual, en 27 de los 28 dudosos: "no
 * verificado individualmente" / "no confirmado por tiempo" — casos reales
 * como `newtonsoft-json/JsonTextReader.cs#ParseReadString` ("readtype" en 7
 * lugares) o `guava/LongMath.java#pow` ("k" en 4 lugares): el `Finding`
 * sólo mostraba la PRIMERA ubicación como evidencia (`toPrecisionRow` lee
 * `locations[0]`), así que un juez no podía ver si las otras N-1 apariciones
 * realmente comparten los mismos CASOS (evidencia de un tipo/enum genuino
 * repartido) o sólo coinciden por casualidad en el nombre corto de una
 * variable (`k`, `c`, `t`) reusado sin relación. `switchCaseLabels` (abajo)
 * extrae, para CADA ubicación, el texto de sus propios brazos `case`/`when`
 * — usado únicamente para enriquecer `detail` (el campo que SÍ llega
 * completo a la planilla, ver `precision/sample.ts#toPrecisionRow`), nunca
 * para filtrar: agregar evidencia, no criterio, es exactamente lo que el
 * encargo de esta ola pide para este detector.
 *
 * COBERTURA DE TEST (Ola N, frente A5b, esta pasada): antes de esta pasada
 * `repeated-switch.test.ts` sólo ejercitaba 3 de las 6 gramáticas
 * (javascript/ruby/java, con un arnés propio que armaba `functions: []`
 * SIEMPRE — ningún test podía haber cubierto `enclosingFunctionName`). Migrado
 * al arnés compartido (`../testing.js#runIntraFile`) y agregadas las 3
 * gramáticas restantes (python/c#/go) más TypeScript (comparte `switch_case`
 * con JS, pero se prueba aparte igual — "ningún lenguaje es especial") y tests
 * dedicados a la evidencia de `switchCaseLabels` en `detail`/`role`. De paso
 * se encontró y arregló un hueco chico en la propia evidencia: el patrón
 * comodín de Python (`case _:`) es, estructuralmente, el MISMO tipo de nodo
 * que un caso normal (`case_clause`), a diferencia de Java/C#/Go que
 * distinguen el brazo de reserva por tipo de nodo o por el texto "default" —
 * sin filtrarlo, "_" se colaba como si fuera un caso real de la evidencia
 * (nunca afectó si el hallazgo disparaba, sólo lo que se MOSTRABA).
 *
 * LÍMITE DECLARADO: Vue no se prueba aparte (comparte la gramática TS/JS para
 * `switch`, sin motivo estructural para esperar diferencia — no medido sobre
 * el corpus por separado, se dice y no se estima).
 *
 * Nodo de BRAZO por lenguaje — confirmado por sonda directa contra las 6
 * gramáticas soportadas (mecanismo (B), nombre de nodo, igual que
 * `code-grammar.ts#TERNARY_NAME`/`CONSTRUCTOR_NODE_WORD`: ninguna de las 6
 * expone un campo uniforme para "soy un brazo de switch", así que field-shape
 * (A) no alcanza acá):
 *   - `switch_case` (JS/TS) — expone el campo `value` directo.
 *   - `switch_block_statement_group` (Java, agrupa la etiqueta Y las
 *     sentencias) — sin campo; su primer hijo nombrado es `switch_label`
 *     (sufijo `_label`, se desciende un salto más para llegar al literal).
 *   - `switch_section` (C#) — sin campo; primer hijo nombrado
 *     `case_switch_label`/`default_switch_label` (mismo desenvolvimiento).
 *   - `expression_case` (Go) — expone el campo `value` directo.
 *   - `when` (Ruby) — expone el campo `pattern` directo.
 *   - `case_clause` (Python) — sin campo; primer hijo nombrado es
 *     `case_pattern`.
 */
import { presencia } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FileUnit, FunctionUnit, IntraFileDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "minRepeats";

const SUBJECT_FIELDS = ["value", "subject", "condition"];

/** Ver "EVIDENCIA" en el docstring del módulo: tipos de nodo de BRAZO
 *  confirmados por sonda directa contra las 6 gramáticas soportadas. */
const SWITCH_ARM_NODE_TYPES = new Set(["switch_case", "switch_block_statement_group", "switch_section", "expression_case", "when", "case_clause"]);
/** El brazo de reserva (`default`/Ruby `else`) nunca aporta un CASO — se
 *  reconoce por nombre de nodo (JS/Go/C# lo exponen como un tipo DISTINTO
 *  del brazo normal) o, para Java (mismo tipo de nodo para ambos, sólo el
 *  texto difiere), se filtra más abajo por el propio texto extraído. */
const SWITCH_ARM_FALLBACK_NODE_TYPES = /^(switch_default|default_case|default_switch_label)$/;
const ARM_LABEL_FIELDS = ["value", "pattern"];
/** Máximo de brazos a mostrar por ubicación — evidencia, no un límite que
 *  cambie qué dispara: un switch de 40 casos sigue disparando igual, sólo se
 *  trunca lo que se MUESTRA. */
const MAX_ARM_LABELS = 6;
const MAX_LABEL_LENGTH = 40;

function truncateLabel(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_LABEL_LENGTH ? `${flat.slice(0, MAX_LABEL_LENGTH)}…` : flat;
}

/** Texto del caso de UN brazo ya localizado — campo directo si la gramática
 *  lo expone (`value`/`pattern`), si no el primer hijo nombrado, descendiendo
 *  un salto más cuando ese hijo es el envoltorio "_label" que Java/C# usan
 *  para tag one (mismo criterio que `code-grammar.ts` ya documenta para
 *  `switch_label`/`case_switch_label`: agrupan la etiqueta pero no deciden
 *  nada por sí mismos). */
function armLabelText(armNode: AstNode): string | null {
  for (const field of ARM_LABEL_FIELDS) {
    const v = armNode.childForFieldName(field) as AstNode | null;
    if (v) return truncateLabel(v.text);
  }
  const namedChildrenOf = (n: AstNode): AstNode[] => {
    const out: AstNode[] = [];
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i) as AstNode | null;
      if (c?.isNamed) out.push(c);
    }
    return out;
  };
  let candidate = namedChildrenOf(armNode)[0] ?? null;
  if (candidate && /(^|_)label$/.test(candidate.type)) {
    candidate = namedChildrenOf(candidate)[0] ?? candidate;
  }
  return candidate ? truncateLabel(candidate.text) : null;
}

/** Los textos de caso de TODOS los brazos de UN switch/case/match ya
 *  localizado — evidencia para `detail`, nunca usado para agrupar ni para
 *  filtrar hallazgos (ver "EVIDENCIA" en el docstring del módulo). No
 *  desciende dentro de un brazo ya encontrado (un `switch` anidado en el
 *  CUERPO de un caso es de OTRO discriminante, no un brazo de éste). */
function switchCaseLabels(containerNode: AstNode): string[] {
  const labels: string[] = [];
  const visit = (n: AstNode): void => {
    if (labels.length >= MAX_ARM_LABELS) return;
    if (SWITCH_ARM_FALLBACK_NODE_TYPES.test(n.type)) return;
    if (SWITCH_ARM_NODE_TYPES.has(n.type)) {
      const label = armLabelText(n);
      // Java reusa el MISMO tipo de nodo para el brazo normal y el de
      // reserva (`switch_block_statement_group` con un `switch_label` cuyo
      // único hijo con nombre está ausente) — el texto "default" es lo único
      // que distingue el caso de reserva ahí, así que se filtra por texto,
      // no por tipo de nodo (el resto de las gramáticas ya lo excluyeron
      // arriba por tipo). Python's `match` tiene el MISMO problema con su
      // brazo comodín (`case _:`): confirmado por sonda directa que
      // `case_clause` es el ÚNICO tipo de nodo, normal o comodín — sin
      // envoltorio "default" propio como Java/C#/Go — así que el patrón
      // literal "_" es lo único que lo distingue, misma técnica de filtro
      // por texto (Ola N, frente A5b: EVIDENCIA, no criterio — esto sólo
      // decide qué se MUESTRA, nunca si el hallazgo dispara).
      if (label && label !== "default" && label !== "else" && label !== "_") labels.push(label);
      return;
    }
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i) as AstNode | null;
      if (c?.isNamed) visit(c);
    }
  };
  for (let i = 0; i < containerNode.childCount; i++) {
    const c = containerNode.child(i) as AstNode | null;
    if (c?.isNamed) visit(c);
  }
  return labels;
}

/** Texto del sujeto de un switch/case/match, normalizado (sin paréntesis/espacio sobrante), o `null` si ningún campo conocido resuelve. */
function switchSubjectText(node: AstNode): string | null {
  for (const field of SUBJECT_FIELDS) {
    const subject = node.childForFieldName(field);
    if (subject) {
      // `AstNode`'s inherited `childForFieldName()` (from `ProbeNode`, what
      // `walkTree` iterates) returns `ProbeNode`, not `AstNode` — a real
      // tree's child IS `AstNode`-shaped at runtime (same parser, same node
      // kind) even though the declared return type is the narrower
      // `ProbeNode`; every consumer of a real tree either casts or only
      // reads the `ProbeNode` surface while walking and casts ONCE, at the
      // leaf, only where `.text`/position is actually needed.
      const text = (subject as AstNode).text.replace(/[()]/g, "").trim();
      return text || null;
    }
  }
  return null;
}

/** La función (si alguna) cuyo rango de líneas contiene `line` — sólo para decorar el `role` con un nombre, nunca para agrupar. */
function enclosingFunctionName(functions: readonly FunctionUnit[], line: number): string | undefined {
  return functions.find((fn) => fn.startLine <= line && line <= fn.endLine)?.name ?? undefined;
}

export const detector: IntraFileDetector<ThresholdKey, "repeated-switch"> = {
  id: "repeated-switch",
  kind: "repeated-switch",
  scope: "intra-file",
  title: "Switch repetido",
  needs: [],
  thresholds: {
    // R3 (auditoría de umbrales inventados): binario por definición del
    // hallazgo, no un piso elegido a mano — "¿aparece el discriminante en
    // MÁS de un lugar?" no tiene una magnitud intermedia que calibrar.
    // Antes `pisoDeclarado(2, …)`.
    minRepeats: presencia({
      rationale:
        "un discriminante que se decide con switch UNA sola vez en el archivo no es evidencia de nada; a partir de la segunda aparición ya está disperso en más de un lugar — la señal misma del hallazgo.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const bySubject = new Map<string, { node: AstNode; line: number }[]>();

    walkTree(file.root, (node) => {
      if (!node.isNamed || !file.sets.switchContainerNodes.has(node.type)) return;
      const real = node as AstNode;
      const subject = switchSubjectText(real);
      if (!subject) return;
      const key = subject.toLowerCase();
      const list = bySubject.get(key) ?? [];
      list.push({ node: real, line: real.startPosition.row + 1 });
      bySubject.set(key, list);
    });

    const threshold = ctx.threshold("minRepeats");
    const findings: RawFinding[] = [];

    for (const [subject, occurrences] of bySubject) {
      // `threshold.value` es 1 (`presencia()`, R3): `> 1` es exactamente `>= 2`.
      if (occurrences.length <= threshold.value) continue;

      // EVIDENCIA (ver docstring del módulo): los casos de CADA ubicación,
      // para que un juez (o cualquier consumidor del hallazgo) pueda ver si
      // realmente comparten vocabulario sin abrir el archivo.
      const caseLabelsByOccurrence = occurrences.map((o) => switchCaseLabels(o.node));

      const locations = occurrences.map((o, i) => {
        const labels = caseLabelsByOccurrence[i] ?? [];
        const caseSummary = labels.length > 0 ? ` — casos: ${labels.join(", ")}` : "";
        return {
          file: file.path,
          startLine: o.line,
          endLine: o.node.endPosition.row + 1,
          symbol: enclosingFunctionName(file.functions, o.line),
          role: (i === 0 ? "primer switch sobre este discriminante" : `repetición #${i}`) + caseSummary,
        };
      });
      // `readonly [RoleLocation, ...RoleLocation[]]` is a non-empty tuple —
      // `.map()` alone only ever types as `T[]`; destructuring the first
      // element (guaranteed to exist: `occurrences.length > threshold.value
      // (1) >= 1`) is what lets the compiler see the tuple, not a cast.
      const [firstLocation, ...restLocations] = locations;
      if (!firstLocation) continue;

      const caseEvidence = occurrences
        .map((o, i) => {
          const labels = caseLabelsByOccurrence[i] ?? [];
          return `#${i + 1} (línea ${o.line}): ${labels.length > 0 ? labels.join(", ") : "(sin casos legibles)"}`;
        })
        .join(" · ");

      findings.push({
        title: `"${subject}" se decide con switch en ${occurrences.length} lugares distintos de este archivo`,
        detail:
          "El mismo discriminante aparece en múltiples switches separados: cada caso nuevo obliga a tocar todos " +
          "ellos, la señal clásica de un polimorfismo pendiente en vez de repetir la decisión. " +
          `Casos por ubicación — ${caseEvidence}.`,
        trigger: [{ label: "apariciones", value: occurrences.length, threshold }],
        locations: [firstLocation, ...restLocations],
        severity: Math.min(100, 40 + occurrences.length * 10),
        advice: {
          primary: {
            name: "Replace Conditional with Polymorphism",
            kind: "refactorizacion",
            why: "Un discriminante que se decide en varios lugares separados es el mismo síntoma repetido: unificarlo en un solo punto de despacho evita tener que actualizar todos los switches cuando aparece un caso nuevo.",
            source: "https://refactoring.guru/es/design-patterns/factory-method",
          },
        },
      });
    }

    return findings;
  },
};
