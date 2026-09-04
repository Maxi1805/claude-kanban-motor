/**
 * Split Phase (Fowler, *Refactoring* 2ª ed., cap. 6) — Ola AT, frente AT4.
 *
 * NO ESTÁ EN refactoring.guru. Es la que el encargo llama *"la más difícil de
 * detectar y la de mejor recompensa: si sale, cubre código que `Extract
 * Method` no toca"*.
 *
 * ── LA FORMA, Y EN QUÉ SE DIFERENCIA DE `Extract Method` ───────────────────
 * `Extract Method` dice *"este BLOQUE tiene un nombre"*: recorta un pedazo y
 * lo saca. Split Phase dice otra cosa: *"esta función hace DOS cosas en
 * secuencia, y entre medio hay una FRONTERA DE DATOS estrecha"*. Lo que se
 * detecta no es un bloque con nombre: es el punto donde casi todo lo que la
 * primera mitad calculó DEJA DE USARSE.
 *
 *     function precio(pedido, plan) {          function precio(pedido, plan) {
 *       const base = …;                          const datos = leer(pedido);
 *       const desc = …;                    ⇒     return calcular(datos, plan);
 *       const items = …;                       }
 *       const total = …;      ← frontera
 *       let out = total * plan.iva;
 *       if (…) out += …;
 *       return out;
 *     }
 *
 * Las CUATRO condiciones se cuentan abriendo el archivo — ninguna opina sobre
 * el diseño:
 *
 *   (1) el cuerpo tiene al menos ocho sentencias de nivel superior, y existe
 *       un corte que deja al menos tres a cada lado;
 *   (2) la primera mitad declara al menos cuatro locales;
 *   (3) **de esas locales, entre UNA y DOS se siguen usando después del
 *       corte.** Ése es el número que define la refactorización: la frontera
 *       es estrecha (hay algo que cruza, y es poco). Cero no cuenta: sin nada
 *       que cruce, las dos mitades no son fases de un mismo cálculo sino dos
 *       funciones que casualmente comparten cuerpo;
 *   (4) la segunda mitad NO le escribe a ninguna local de la primera. Si
 *       escribiera, las dos mitades comparten estado mutable y separarlas
 *       dejaría de ser mecánico.
 *
 * ── POR QUÉ ESTO SÍ ES UN HECHO Y NO UNA INTENCIÓN ─────────────────────────
 * La regla de la Ola AS: *la precondición tiene que ser (1) un HECHO, (2)
 * VISIBLE EN LO QUE EL ANALIZADOR CARGA y (3) suficiente para que sea un
 * PROBLEMA*. Las tres se cumplen: contar declaraciones y usos de nombres
 * dentro de UN cuerpo es aritmética sobre el árbol que ya está cargado. **La
 * (3) es la que esta familia tiene que ganarse en la medición, y por eso se
 * mide: "hay una frontera estrecha" es un hecho; "vale la pena partir acá" es
 * la afirmación que hay que juzgar abriendo el archivo.**
 *
 * ── LO QUE ESTA FAMILIA NO INTENTA ─────────────────────────────────────────
 * No mira efectos. Una llamada de la primera mitad puede escribir en disco y
 * el árbol no lo dice; eso va a `toConfirm`, no a un check que no se puede
 * sostener. Y no propone el NOMBRE de las dos fases: nombrar es exactamente la
 * parte que un humano hace mejor, y una propuesta que invente el nombre suena
 * más segura de lo que es.
 *
 * ── TRAMPA #2 ──────────────────────────────────────────────────────────────
 * Ancla en `long-function` y `complexity`, las mismas de `Extract Method`,
 * `Guard Clauses` y `Replace Loop with Pipeline`. `appliedState` devuelve
 * SIEMPRE `"ausente"`: `arbitrateRivalHypotheses` sólo retira frente a un
 * estado CONFIRMADO, y ésta nunca lo tiene. Y el ancla DUEÑA (copiada de
 * `guard-clauses.ts`) evita que una función larga Y compleja publique la misma
 * propuesta dos veces.
 *
 * ── LENGUAJES ─────────────────────────────────────────────────────────────
 * `needs: []`. Ni una constante nombra un lenguaje: las declaraciones se
 * ubican por campos genéricos (`left`/`name`/`pattern`) y por tipo de nodo
 * declarador, igual que `detect/intra-file/data-clump.ts`.
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import type { AstNode, FileUnit, Finding, FunctionUnit, RoleLocation } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/* ── umbrales ────────────────────────────────────────────────────────────── */

/** Menos de esto y no hay dos fases: hay una función con un par de pasos. */
const MIN_STATEMENTS = 8;
/** Cada mitad tiene que ser una fase, no una cola. */
const MIN_HALF_STATEMENTS = 3;
const MIN_HALF_LINES = 4;
/**
 * Y NINGUNA PUEDE SER UN TERCIO DE LA OTRA. **Esto era un discriminador y la
 * primera medición lo ascendió a requisito.** `nest · scanner.ts#scanForModules`
 * salió con 59 líneas de un lado y 8 del otro: la "segunda fase" eran tres
 * sentencias de retorno. Eso no es partir una función en dos fases, es
 * señalarle la cola. Fowler pide DOS fases, y una cola de tres líneas no lo es.
 */
const MIN_BALANCE = 1 / 3;
/** La primera fase tiene que CALCULAR algo: menos de cuatro locales no es una fase de cálculo. */
const MIN_DECLS = 4;
/** LA FRONTERA. Entre una y dos: hay algo que cruza, y es poco. */
const MIN_BRIDGE = 1;
const MAX_BRIDGE = 2;
/** Seis o más locales muertas en la frontera: el corte es rotundo (sube un peldaño). */
const MANY_DECLS = 6;
/** El piso REAL de `detect/intra-function/complexity.ts`: `citado(15, SonarSource S3776)`. */
const COMPLEXITY_FLOOR = 15;

/* ── vocabulario de gramática ───────────────────────────────────────────── */

const COMMENT_WORD = /(^|_)comment(_|$)/;
const BLOCK_WORD = /(^|_)(block|body|statement_list|suite|compound_statement)(_|$)/;
const PARAMS_WORD = /(^|_)(parameters|block_parameters|parameter_list)(_|$)/;
const IDENT_WORD = /(^|_)identifier(_|$)/;
const MEMBER_WORD = /(^|_)(member|field|selector|attribute|navigation|scoped)(_|$)/;
const CALL_WORD = /(^|_)(call|invocation)(_|$)/;
const ASSIGN_WORD = /(^|_)(assignment|assign|declarator|short_var_declaration|operator_assignment|augmented_assignment)(_|$)/;
const LIST_WORD = /(^|_)(list|expression_list|variable_declaration|declaration_list)(_|$)/;
const TYPE_CHILD = /(^|_)(type|type_annotation|type_identifier|predefined_type)(_|$)/;

type Problem = Finding;
type Graph = CodeGraph | null;

interface Corte {
  /** Índice de la primera sentencia de la SEGUNDA fase. */
  readonly k: number;
  readonly declaraciones: readonly string[];
  /** Las que cruzan la frontera. */
  readonly puente: readonly string[];
  readonly stmtsAntes: number;
  readonly stmtsDespues: number;
  readonly lineasAntes: number;
  readonly lineasDespues: number;
  /** Locales de la primera fase que la segunda REESCRIBE. */
  readonly reescritas: readonly string[];
  readonly corteLinea: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly fnName: string | null;
  readonly file: string;
}

/* ── lectura del árbol ───────────────────────────────────────────────────── */

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function field(node: AstNode, name: string): AstNode | null {
  return (node.childForFieldName(name) as AstNode | null) ?? null;
}

function statementsOf(node: AstNode): AstNode[] {
  const keep = (c: AstNode): boolean => !COMMENT_WORD.test(c.type) && !PARAMS_WORD.test(c.type);
  let cursor = node;
  for (let i = 0; i < 3; i++) {
    const kids = namedChildren(cursor).filter(keep);
    if (kids.length === 1 && BLOCK_WORD.test(kids[0]!.type)) cursor = kids[0]!;
    else break;
  }
  return namedChildren(cursor).filter(keep);
}

function unwrapSingle(node: AstNode | null): AstNode | null {
  let cursor = node;
  for (let i = 0; i < 3 && cursor; i++) {
    if (IDENT_WORD.test(cursor.type) || !LIST_WORD.test(cursor.type)) return cursor;
    const kids = namedChildren(cursor).filter((c) => !COMMENT_WORD.test(c.type));
    if (kids.length !== 1) return cursor;
    cursor = kids[0]!;
  }
  return cursor;
}

function plainName(node: AstNode | null): string | null {
  const n = unwrapSingle(node);
  return n && IDENT_WORD.test(n.type) ? n.text : null;
}

function lines(node: AstNode): number {
  return node.endPosition.row - node.startPosition.row + 1;
}

function bodyOf(fn: FunctionUnit): AstNode | null {
  const declared = field(fn.node, "body");
  if (declared) return declared;
  const kids = namedChildren(fn.node);
  return kids.length > 0 ? kids[kids.length - 1]! : null;
}

function findEnclosingFunction(file: FileUnit, problem: Problem): FunctionUnit | null {
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

/** Los nombres que ESTA sentencia declara (o asigna por primera vez). */
function targetsOf(stmt: AstNode): string[] {
  const out: string[] = [];
  const walk = (n: AstNode, depth: number): void => {
    if (depth > 4) return;
    if (ASSIGN_WORD.test(n.type)) {
      const l = field(n, "left") ?? field(n, "name") ?? namedChildren(n).find((k) => !TYPE_CHILD.test(k.type)) ?? null;
      const direct = plainName(l);
      if (direct) out.push(direct);
      else if (l) {
        // `const [a, b] = …` / `a, b := …`: varios destinos en un envoltorio.
        for (const kid of namedChildren(l)) {
          const n2 = plainName(kid);
          if (n2) out.push(n2);
        }
      }
    }
    for (const kid of namedChildren(n)) walk(kid, depth + 1);
  };
  walk(stmt, 0);
  return out;
}

/**
 * Los nombres LEÍDOS en el subárbol: identificadores sueltos, sin los nombres
 * de miembro que van después de un punto (`a.b` aporta `a`, nunca `b`) y sin
 * los destinos de asignación.
 */
function readsOf(node: AstNode): Set<string> {
  const out = new Set<string>();
  const visit = (n: AstNode): void => {
    if (IDENT_WORD.test(n.type)) {
      out.add(n.text);
      return;
    }
    if (MEMBER_WORD.test(n.type)) {
      const obj = field(n, "object") ?? field(n, "operand") ?? field(n, "expression") ?? namedChildren(n)[0] ?? null;
      if (obj) visit(obj);
      return;
    }
    if (CALL_WORD.test(n.type)) {
      const fn = field(n, "function") ?? field(n, "callee") ?? null;
      const recv = field(n, "receiver");
      if (recv) visit(recv);
      if (fn) visit(fn);
      const args = field(n, "arguments");
      if (args) for (const a of namedChildren(args)) visit(a);
      if (!fn && !recv && !args) for (const kid of namedChildren(n)) visit(kid);
      return;
    }
    if (ASSIGN_WORD.test(n.type)) {
      const r = field(n, "right");
      const l = field(n, "left") ?? field(n, "name");
      // Un destino que NO es un nombre suelto (`a.b = …`, `a[i] = …`) también LEE `a`.
      if (l && !plainName(l)) visit(l);
      if (r) visit(r);
      if (!r) for (const kid of namedChildren(n)) visit(kid);
      return;
    }
    for (const kid of namedChildren(n)) visit(kid);
  };
  visit(node);
  return out;
}

/** Los nombres a los que el subárbol ESCRIBE. */
function writesOf(node: AstNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: AstNode): void => {
    if (ASSIGN_WORD.test(n.type)) {
      const l = field(n, "left") ?? field(n, "name");
      const direct = plainName(l);
      if (direct) out.add(direct);
      else if (l) for (const kid of namedChildren(l)) {
        const n2 = plainName(kid);
        if (n2) out.add(n2);
      }
    }
    for (const kid of namedChildren(n)) walk(kid);
  };
  walk(node);
  return out;
}

/**
 * EL CORTE. Se prueban todos los puntos que dejan al menos
 * `MIN_HALF_STATEMENTS` a cada lado y se elige el que MÁS locales mata: el que
 * maximiza `declaradas − puente`. Empate: el más cercano al medio (un corte
 * balanceado deja dos fases, no una fase y una cola).
 */
function corteDe(fn: FunctionUnit, file: string): Corte | null {
  const body = bodyOf(fn);
  if (!body) return null;
  const stmts = statementsOf(body);
  if (stmts.length < MIN_STATEMENTS) return null;

  let mejor: Corte | null = null;
  let mejorPuntaje = -1;
  for (let k = MIN_HALF_STATEMENTS; k <= stmts.length - MIN_HALF_STATEMENTS; k++) {
    const antes = stmts.slice(0, k);
    const despues = stmts.slice(k);

    const declaradas: string[] = [];
    for (const s of antes) for (const t of targetsOf(s)) if (!declaradas.includes(t)) declaradas.push(t);
    if (declaradas.length < MIN_DECLS) continue;

    const leidasDespues = new Set<string>();
    for (const s of despues) for (const n of readsOf(s)) leidasDespues.add(n);
    const puente = declaradas.filter((d) => leidasDespues.has(d));
    if (puente.length < MIN_BRIDGE || puente.length > MAX_BRIDGE) continue;

    const escritasDespues = new Set<string>();
    for (const s of despues) for (const n of writesOf(s)) escritasDespues.add(n);
    const reescritas = declaradas.filter((d) => escritasDespues.has(d));

    const lineasAntes = antes[antes.length - 1]!.endPosition.row - antes[0]!.startPosition.row + 1;
    const lineasDespues = despues[despues.length - 1]!.endPosition.row - despues[0]!.startPosition.row + 1;
    if (lineasAntes < MIN_HALF_LINES || lineasDespues < MIN_HALF_LINES) continue;
    if (Math.min(lineasAntes, lineasDespues) / Math.max(lineasAntes, lineasDespues) < MIN_BALANCE) continue;

    const puntaje = (declaradas.length - puente.length) * 100 - Math.abs(k - stmts.length / 2);
    if (puntaje <= mejorPuntaje) continue;
    mejorPuntaje = puntaje;
    mejor = {
      k,
      declaraciones: declaradas,
      puente,
      stmtsAntes: antes.length,
      stmtsDespues: despues.length,
      lineasAntes,
      lineasDespues,
      reescritas,
      corteLinea: despues[0]!.startPosition.row + 1,
      startLine: antes[0]!.startPosition.row + 1,
      endLine: despues[despues.length - 1]!.endPosition.row + 1,
      fnName: fn.name,
      file,
    };
  }
  return mejor;
}

/* ── los checks ─────────────────────────────────────────────────────────── */

const SOURCE = "Fowler, *Refactoring* 2ª ed., cap. 6 — «Split Phase»";
const TO_CONFIRM: readonly string[] = [
  "¿alguna sentencia de la primera fase tiene efectos que la segunda necesita que ya hayan ocurrido (escribir un archivo, tocar la base, mutar un objeto compartido)? El árbol no lo ve y el orden dejaría de estar garantizado por la forma.",
  "¿las dos mitades son de verdad DOS TEMAS (leer/interpretar, después calcular), o es un solo cálculo largo? Si es uno solo, `Extract Method` sobre un pedazo es más barato que partir la función.",
  "¿el valor que cruza la frontera tiene un nombre que dé para un tipo intermedio? Si no lo tiene, la segunda función va a recibir un argumento sin significado.",
];

type Ctx = {
  readonly corte: Corte | null;
  readonly kind: string;
  readonly owner: string | null;
  readonly cognitive: number;
};

const dosFases: Check<Ctx, Graph> = {
  id: "dos-fases",
  describe: `el cuerpo tiene al menos ${MIN_STATEMENTS} sentencias de nivel superior y existe un corte con al menos ${MIN_HALF_STATEMENTS} sentencias y ${MIN_HALF_LINES} líneas a cada lado`,
  run: (c) =>
    !c.corte
      ? { holds: false, evidence: "no se encontró ningún corte con una frontera de datos estrecha (sin árbol vivo, cuerpo corto, o ningún punto donde las locales de la primera mitad dejen de usarse): no demostrado." }
      : { holds: true, evidence: `corte en la línea ${c.corte.corteLinea}: ${c.corte.stmtsAntes} sentencias (${c.corte.lineasAntes} líneas) antes, ${c.corte.stmtsDespues} (${c.corte.lineasDespues} líneas) después.` },
};

const primeraFaseCalcula: Check<Ctx, Graph> = {
  id: "primera-fase-calcula",
  describe: `la primera mitad declara al menos ${MIN_DECLS} locales (una fase que no calcula nada no es una fase)`,
  run: (c) =>
    !c.corte
      ? { holds: false, evidence: "sin corte: no demostrado." }
      : { holds: c.corte.declaraciones.length >= MIN_DECLS, evidence: `${c.corte.declaraciones.length} locales declaradas antes del corte (${c.corte.declaraciones.slice(0, 6).join(", ")}), piso ${MIN_DECLS}.` },
};

const fronteraEstrecha: Check<Ctx, Graph> = {
  id: "frontera-estrecha",
  describe: `entre ${MIN_BRIDGE} y ${MAX_BRIDGE} de esas locales cruzan el corte, y el resto muere ahí: eso es lo que hace que las dos mitades sean fases y no un cuerpo entrelazado`,
  run: (c) =>
    !c.corte
      ? { holds: false, evidence: "sin corte: no demostrado." }
      : {
          holds: c.corte.puente.length >= MIN_BRIDGE && c.corte.puente.length <= MAX_BRIDGE,
          evidence: `cruzan ${c.corte.puente.length} de ${c.corte.declaraciones.length} locales (${c.corte.puente.join(", ")}); las otras ${c.corte.declaraciones.length - c.corte.puente.length} no se vuelven a usar.`,
        },
};

const sinEscrituraHaciaAtras: Check<Ctx, Graph> = {
  id: "sin-escritura-hacia-atras",
  describe: "la segunda mitad no le escribe a ninguna local de la primera (si escribiera, las dos mitades comparten estado mutable y separarlas dejaría de ser mecánico)",
  run: (c) =>
    !c.corte
      ? { holds: false, evidence: "sin corte: no demostrado." }
      : {
          holds: c.corte.reescritas.length === 0,
          evidence: c.corte.reescritas.length === 0 ? "ninguna local de la primera fase se reescribe después del corte." : `${c.corte.reescritas.length} local(es) reescritas después del corte: ${c.corte.reescritas.join(", ")}.`,
        },
};

/** El ancla DUEÑA — copiado de `guard-clauses.ts`. */
function ownerAnchor(fn: FunctionUnit): string {
  return fn.metrics.cognitive >= COMPLEXITY_FLOOR ? "complexity" : "long-function";
}

const anclaDuena: Check<Ctx, Graph> = {
  id: "ancla-duena",
  describe: "este hallazgo es el ancla DUEÑA de esta función (larga Y compleja dispara las dos anclas; sin esto la misma propuesta sale dos veces)",
  run: (c) =>
    c.owner === null
      ? { holds: false, evidence: "no se pudo ubicar la función encerrante: no demostrado." }
      : { holds: c.owner === c.kind, evidence: `dueño "${c.owner}" (complejidad cognitiva ${c.cognitive}, piso ${COMPLEXITY_FLOOR}); este hallazgo es "${c.kind}".` },
};

const corteRotundo: Check<Ctx, Graph> = {
  id: "corte-rotundo",
  describe: `al menos ${MANY_DECLS} locales mueren en la frontera`,
  run: (c) => (!c.corte ? { holds: false, evidence: "sin corte." } : { holds: c.corte.declaraciones.length - c.corte.puente.length >= MANY_DECLS, evidence: `${c.corte.declaraciones.length - c.corte.puente.length} locales muertas en el corte.` }),
};

const fasesEquilibradas: Check<Ctx, Graph> = {
  id: "fases-equilibradas",
  describe: `ninguna de las dos fases es menos de un ${Math.round(1 / MIN_BALANCE)} de la otra (un corte al borde señala una COLA, no una segunda fase)`,
  run: (c) => {
    if (!c.corte) return { holds: false, evidence: "sin corte con una frontera estrecha Y dos mitades comparables: no demostrado." };
    const a = c.corte.lineasAntes;
    const b = c.corte.lineasDespues;
    const ratio = Math.min(a, b) / Math.max(a, b);
    return { holds: ratio >= MIN_BALANCE, evidence: `${a} vs ${b} líneas (${Math.round(ratio * 100)} %, piso ${Math.round(MIN_BALANCE * 100)} %).` };
  },
};

/** Las dos fases tienen que tener cuerpo: cinco sentencias o más cada una. */
const ambasConCuerpo: Check<Ctx, Graph> = {
  id: "ambas-con-cuerpo",
  describe: "las dos fases tienen al menos 5 sentencias",
  run: (c) => (!c.corte ? { holds: false, evidence: "sin corte." } : { holds: Math.min(c.corte.stmtsAntes, c.corte.stmtsDespues) >= 5, evidence: `${c.corte.stmtsAntes} y ${c.corte.stmtsDespues} sentencias.` }),
};

const unSoloValorCruza: Check<Ctx, Graph> = {
  id: "un-solo-valor-cruza",
  describe: "cruza UN solo valor: la segunda fase se puede escribir como una función de un argumento",
  run: (c) => (!c.corte ? { holds: false, evidence: "sin corte." } : { holds: c.corte.puente.length === 1, evidence: `${c.corte.puente.length} valor(es) cruzan.` }),
};

/** SIEMPRE `"ausente"` — trampa #2. */
function appliedState(c: Ctx): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "las dos fases siguen en la misma función",
        passed: true,
        why: c.corte ? `${c.corte.stmtsAntes} + ${c.corte.stmtsDespues} sentencias en un solo cuerpo; si ya estuvieran separadas no habría corte que encontrar.` : "sin corte.",
      },
    ],
  };
}

function buildSpec(): HypothesisSpec<Ctx, Graph> {
  return {
    pattern: "Split Phase",
    ceiling: "media",
    needs: [],
    required: [dosFases, primeraFaseCalcula, fronteraEstrecha, sinEscrituraHaciaAtras, fasesEquilibradas, anclaDuena],
    discriminators: [corteRotundo, ambasConCuerpo, unSoloValorCruza],
    appliedState: (c) => appliedState(c),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── la traza ───────────────────────────────────────────────────────────── */

export interface SplitPhaseTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly withFile: boolean;
  readonly language: string;
  readonly corteLinea: number;
  readonly declaraciones: number;
  readonly puente: readonly string[];
  readonly reescritas: number;
  readonly stmtsAntes: number;
  readonly stmtsDespues: number;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly emitted: boolean;
}

let trace: SplitPhaseTraceEntry[] | null = null;
export function startSplitPhaseTrace(): void {
  trace = [];
}
export function takeSplitPhaseTrace(): readonly SplitPhaseTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function placesOf(c: Corte): readonly RoleLocation[] {
  return [
    {
      file: c.file,
      startLine: c.startLine,
      endLine: c.corteLinea - 1,
      symbol: c.fnName ?? undefined,
      role: `primera fase: ${c.stmtsAntes} sentencias que declaran ${c.declaraciones.length} locales, de las que sólo ${c.puente.join(", ")} sobrevive(n)`,
    },
    {
      file: c.file,
      startLine: c.corteLinea,
      endLine: c.endLine,
      symbol: c.fnName ?? undefined,
      role: `segunda fase: ${c.stmtsDespues} sentencias que sólo necesitan ${c.puente.join(", ")}`,
    },
  ];
}

export const hypothesis: HypothesisBuilder = {
  id: "split-phase",
  pattern: "Split Phase",
  layer: "refactorizacion",
  anchors: ["complexity", "long-function"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const fn = ctx.file ? findEnclosingFunction(ctx.file, problem) : null;
    const corte = fn && ctx.file ? corteDe(fn, ctx.file.path) : null;
    const c: Ctx = { corte, kind: problem.kind, owner: fn ? ownerAnchor(fn) : null, cognitive: fn?.metrics.cognitive ?? 0 };
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
        language: ctx.file?.language ?? "",
        corteLinea: corte?.corteLinea ?? 0,
        declaraciones: corte?.declaraciones.length ?? 0,
        puente: corte?.puente ?? [],
        reescritas: corte?.reescritas.length ?? 0,
        stmtsAntes: corte?.stmtsAntes ?? 0,
        stmtsDespues: corte?.stmtsDespues ?? 0,
        checks,
        diesAt: checks.find((k) => !k.holds)?.id ?? null,
        emitted: outcome !== null,
      });
    }
    if (!outcome || !corte) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(corte),
      cost:
        `Dos funciones donde hoy hay una: la primera devuelve ${corte.puente.join(", ")} y la segunda lo recibe. ` +
        "Ninguna firma pública cambia si la función original se queda como la que las encadena. El trabajo real es " +
        "elegir los dos nombres y decidir si lo que cruza merece un tipo propio; el análisis no lo propone a propósito.",
    });
  },
};
