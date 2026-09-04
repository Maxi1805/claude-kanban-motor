/**
 * Parameter Object (Introduce Parameter Object, y su hermana *Preserve Whole
 * Object*) — Ola AS, frente AS1. Anclas EXISTENTES:
 * `long-parameter-list` (intra-function) y `data-clump` (intra-file). **Cero
 * cambios en `detect/**`**: este archivo sólo lee lo que esos dos detectores
 * ya producen y lo que el grafo ya materializa.
 *
 * ── POR QUÉ ESTA FAMILIA Y NO UN PATRÓN DE DISEÑO ─────────────────────────
 * `ola-ar/informes/AR4.md` §5: `Extract Method` rinde 73,6 % y los 17
 * patrones de diseño 17,9 % con una barra de ±8-12 puntos. La diferencia no
 * es de esfuerzo: **la precondición de `Extract Method` es un HECHO DEL
 * CÓDIGO** ("esta función es larga y este bloque tiene un nombre"), y la de
 * un patrón es una OPINIÓN SOBRE EL FUTURO ("acá convendría Strategy").
 *
 * La precondición de esta familia es un hecho y se verifica abriendo el
 * archivo: **los mismos N argumentos viajan juntos a >= 2 sitios**. No hay
 * que creerle a nadie sobre cómo va a evolucionar el sistema.
 *
 * ── LO QUE EL ANCLA NO ALCANZA A DECIR (y por eso existe este archivo) ─────
 * `long-parameter-list` dispara con CONTAR 6 parámetros, y contar no es la
 * precondición de Fowler: una firma larga cuyos parámetros no viajan juntos a
 * ningún otro lado no tiene ningún objeto adentro esperando a nacer — tiene
 * demasiados parámetros, que es otro problema (y su remedio es otro:
 * partir la función). El nivel 2 pone la compuerta que falta:
 *
 *   > **>= `MIN_GROUP` (3) de los nombres de parámetro de esta firma aparecen
 *   > JUNTOS como parámetros de al menos otra firma DEL MISMO ARCHIVO.**
 *
 * **POR QUÉ DEL MISMO ARCHIVO Y NO DEL REPO ENTERO — es una corrección MEDIDA,
 * no una preferencia.** La primera versión de este archivo hacía la pregunta
 * sobre el repo entero, con el índice de portadores del grafo. Sobre el
 * fixture de tres lenguajes de esta misma ola el resultado fue inmediato:
 * `connect(a, b, c, d, e, f)` de TypeScript "compartía el grupo" con
 * `Connect(a, b, c, d, e, f)` de Go. **La identidad de un dato acá es su
 * NOMBRE, y los nombres genéricos (`a`, `i`, `err`, `ctx`, `opts`, `id`,
 * `name`, `value`) co-ocurren en cualquier repo grande por pura frecuencia,
 * no porque un grupo viaje junto.** El repo entero convierte esa compuerta en
 * un colador. El archivo es además el alcance que ESTE PROYECTO YA ELIGIÓ
 * para exactamente este fenómeno: `detect/intra-file/data-clump.ts` es
 * `intra-file` por diseño. No se inventa un alcance nuevo: se usa el que ya
 * está validado.
 *
 * `data-clump` ya trae esa compuerta puesta (>= 3 firmas del mismo archivo
 * con el mismo grupo de >= 3 nombres), así que por ese camino lo que agrega
 * el nivel 2 no es la compuerta sino **LA RESOLUCIÓN**. El camino
 * `long-parameter-list` es entonces la mitad que a `data-clump` le falta: el
 * grupo que aparece en DOS firmas (no tres) y que el usuario ya está viendo
 * señalado como "esta función recibe 6 parámetros".
 *
 * ── LA RESOLUCIÓN — la primera pregunta, antes que ninguna otra ────────────
 * De 21 casos en disputa de la Ola AP, en SIETE la solución YA EXISTÍA en el
 * código y el analizador no la vio. Para esta familia la pregunta es
 * literal: **¿ya hay un tipo en este repo cuyos campos son este grupo?** Se
 * contesta con el MISMO hecho del grafo que usa `value-object.ts`: nodos
 * `carrier` con `carrierForm: "field"`, agrupados por su símbolo contenedor.
 *
 *   - **NO CANDIDATA** — la CLASE QUE DECLARA la firma anclada ya guarda
 *     todos los nombres del grupo como campos propios. El objeto que los
 *     agrupa es esa clase: la firma está recibiendo de vuelta el estado que
 *     el objeto ya tiene. Proponer "creá un objeto" ahí sería proponer el que
 *     ya existe. **Se devuelve `null`, NUNCA `ya-aplicado`** — ver el check
 *     `el-objeto-no-es-ya-la-clase` para la medición que obligó a esa
 *     decisión (una confirmación acá le borraba una propuesta a `Builder`).
 *   - **`parcial`** — OTRO símbolo del repo ya declara todos los nombres del
 *     grupo como campos. **Ése es exactamente *Preserve Whole Object*:** el
 *     objeto existe, y estas firmas lo están desarmando en pedazos para
 *     volver a pasarlos sueltos. Es la propuesta más accionable de las tres,
 *     porque el tipo ya está escrito y nombrado.
 *   - **`ausente`** — ningún símbolo del repo agrupa esos datos: hay que
 *     crear el Parameter Object.
 *
 * **`ya-aplicado` y `aplicado-eludido` son inalcanzables acá, y lo digo en vez
 * de fabricarlos.** `aplicado-eludido` por la misma razón que en
 * `value-object.ts` (ninguna de las dos anclas expone una arista de puenteo);
 * `ya-aplicado` por una razón MEDIDA, que es lo más importante de este
 * archivo para el guardián: **una confirmación de esta familia le borra
 * propuestas a `Builder`** vía `arbitrateRivalHypotheses`. La lectura "el tipo
 * existe y esta firma lo esquiva" ya viaja como `parcial`, que es una
 * oportunidad y no entierra a nadie.
 *
 * ── DÓNDE TERMINA ESTA FAMILIA Y EMPIEZA `Value Object` ───────────────────
 * `value-object.ts` rinde 45,9 % y es una de las dos únicas celdas que
 * sobreviven a los cuatro jueces frescos: robarle verdaderas sería el peor
 * resultado posible de esta ola. La línea es la de refactoring.guru, y es
 * nítida:
 *
 *   > **`Value Object` es UN dato con reglas propias** (validación, formato,
 *   > unidad, comparación) que hoy se repiten en cada sitio que lo declara.
 *   > **`Parameter Object` son VARIOS datos que viajan juntos** sin reglas
 *   > compartidas: lo que se gana es una firma, no un invariante.
 *
 * Y la separación **no depende de que este archivo se porte bien**, porque
 * las ANCLAS SON DISJUNTAS: `value-object.ts` cuelga sólo de
 * `primitive-obsession`, y este archivo sólo de `long-parameter-list` y
 * `data-clump`. `engine.ts#arbitrateRivalHypotheses` sólo arbitra hipótesis
 * del MISMO `Finding`, así que **esta familia no puede retirarle una
 * propuesta a `Value Object` ni a `Extract Method` ni con grafo ni sin él**.
 * Lo que sí puede haber es solape de SITIO (dos hallazgos distintos sobre la
 * misma función); está medido en el informe de la ola.
 *
 * ── QUÉ NO CUBRE (declarado, no escondido) ────────────────────────────────
 *   - **Sin árbol vivo no se emite nada, por ninguno de los dos caminos.**
 *     Todas las preguntas de la compuerta son sobre los NOMBRES de las
 *     firmas, y esos viven en el árbol. Un `required` que aprueba por no
 *     poder mirar no es un `required` (`no-permissive-required.test.ts`).
 *   - **Sin grafo se emite igual, pero SIN RESOLUCIÓN.** La compuerta es del
 *     archivo, así que no necesita grafo; lo que necesita grafo es la
 *     pregunta "¿ya existe un tipo con estos campos?", y su check lo dice
 *     con todas las letras en vez de publicar un `ausente` que parezca
 *     verificado.
 *   - **La identidad de un dato es su NOMBRE**, no su significado: dos `id`
 *     de conceptos distintos cuentan como el mismo dato. Es comparación por
 *     identidad entre identificadores extraídos del propio repo — la misma
 *     que ya hacen `data-clump.ts` (agrupa por conjunto de nombres),
 *     `large-class.ts` (por `className`) y `value-object.ts`.
 *   - **Desestructuración** (`function f({a, b})`): `paramNames` devuelve
 *     `null` para la firma entera antes que fabricar un grupo parcial —
 *     mismo criterio, y por la misma razón, que `data-clump.ts`.
 *   - **Sobrecargas**: `graph/build.ts#addNode` se queda con el PRIMER nodo
 *     de un id repetido, así que dos sobrecargas colapsan en un dueño. El
 *     conteo de sitios es un PISO, nunca un techo.
 */
import { build as runEngine, toPatternHypothesis } from "./engine.js";
import type { AppliedStateResult, Check, HypothesisSpec } from "./engine.js";
import type { AstNode, Finding, FunctionUnit } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

const LONG_PARAMETER_LIST_KIND = "long-parameter-list";
const DATA_CLUMP_KIND = "data-clump";

/**
 * Tamaño mínimo de un grupo. **No es un número nuevo**: es EXACTAMENTE el
 * `minGroupSize` que `detect/intra-file/data-clump.ts` ya declara (`citado(3,
 * Fowler, Refactoring — "Data Clumps")`). Un piso propio más bajo que el del
 * ancla sería el desajuste mudo que `threshold-alignment.test.ts` existe para
 * atrapar.
 */
const MIN_GROUP = 3;

/**
 * Cuántas firmas distintas tienen que llevar el grupo junto por el camino
 * `long-parameter-list`. **2 = la anclada + al menos otra**: es la definición
 * literal de "viajan juntos", el mínimo que puede sostener la afirmación. Por
 * el camino `data-clump` el piso efectivo es 3, el `minRepeats` del propio
 * ancla, y este número no lo baja (la compuerta del ancla corre antes).
 */
const MIN_SITES_SIGNATURE = 2;

/* ── Vocabulario genérico para leer una firma. Mismo criterio, campo por
 *    campo, que `detect/intra-file/data-clump.ts` (no importado: ese archivo
 *    no exporta estas funciones y `hypotheses/` no debe depender del interior
 *    de un detector). Nunca un nombre de nodo por lenguaje. ─────────────── */
const PARAM_LIKE = /identifier|parameter|pattern/;
const NAME_FIELDS = ["name", "pattern", "left"] as const;
const TYPE_CHILD_TYPES = new Set(["type", "type_annotation"]);
/** El receptor propio nunca es un DATO — mismo vocabulario de dos palabras que ya usa `data-clump.ts`. */
const SELF_WORDS = new Set(["this", "self"]);

function paramName(node: AstNode): string | null {
  if (node.type === "identifier") return node.text.trim() || null;
  for (const field of NAME_FIELDS) {
    const named = node.childForFieldName(field) as AstNode | null;
    if (!named) continue;
    const resolved = paramName(named);
    if (resolved) return resolved;
  }
  const namedChildren: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child && child.isNamed && !TYPE_CHILD_TYPES.has(child.type)) namedChildren.push(child);
  }
  const only = namedChildren.length === 1 ? namedChildren[0] : undefined;
  return only ? paramName(only) : null;
}

/** Nombres de parámetro de una firma, o `null` si alguno no se puede nombrar
 *  con confianza. Un grupo parcial es peor que ninguno. */
function paramNames(fnNode: AstNode): readonly string[] | null {
  const params = fnNode.childForFieldName("parameters") ?? fnNode.childForFieldName("parameter_list");
  if (!params) return null;
  const names: string[] = [];
  let position = 0;
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i) as AstNode | null;
    if (!child || !PARAM_LIKE.test(child.type)) continue;
    const name = paramName(child);
    if (name === null) return null;
    if (!(position === 0 && SELF_WORDS.has(name))) names.push(name);
    position++;
  }
  return names.length > 0 ? names : null;
}

/** La función de `ctx.file` que empieza en esta línea (o la que la contiene, la más interna). */
function functionAt(ctx: HypothesisContext, startLine: number, endLine: number): FunctionUnit | null {
  const file = ctx.file;
  if (!file) return null;
  const exact = file.functions.find((f) => f.startLine === startLine && f.endLine === endLine);
  if (exact) return exact;
  let best: FunctionUnit | null = null;
  let bestSpan = Number.POSITIVE_INFINITY;
  for (const f of file.functions) {
    if (startLine < f.startLine || startLine > f.endLine) continue;
    const span = f.endLine - f.startLine;
    if (span < bestSpan) {
      bestSpan = span;
      best = f;
    }
  }
  return best;
}

/* ══════════════════════════════════════════════════════════════════════════
 * EL HECHO DEL GRAFO — un índice por repo, construido UNA vez.
 * ══════════════════════════════════════════════════════════════════════════ */

interface RepoIndex {
  /** nombre de parámetro → dueños (símbolo contenedor) que lo declaran como parámetro. */
  readonly paramOwners: ReadonlyMap<string, ReadonlySet<string>>;
  /** dueño → nombres de parámetro que declara. */
  readonly ownerParams: ReadonlyMap<string, ReadonlySet<string>>;
  /** dueño (una CLASE/struct) → nombres de sus CAMPOS. */
  readonly ownerFields: ReadonlyMap<string, ReadonlySet<string>>;
  /** dueño → dónde está declarado (para poder nombrarlo en la evidencia). */
  readonly ownerWhere: ReadonlyMap<string, { readonly file: string; readonly line: number }>;
}

const INDEX_CACHE = new WeakMap<CodeGraph, RepoIndex>();

function indexOf(graph: CodeGraph): RepoIndex {
  const cached = INDEX_CACHE.get(graph);
  if (cached) return cached;

  const paramOwners = new Map<string, Set<string>>();
  const ownerParams = new Map<string, Set<string>>();
  const ownerFields = new Map<string, Set<string>>();
  const ownerWhere = new Map<string, { file: string; line: number }>();

  for (const n of graph.nodes) {
    if (n.kind !== "carrier") continue;
    const path = n.symbolPath;
    if (!path || path.length < 2) continue;
    const declared = path[path.length - 1];
    if (declared === undefined) continue;
    const owner = `${n.file ?? ""}#${path.slice(0, -1).join(".")}`;
    if (n.carrierForm === "parameter") {
      const owners = paramOwners.get(declared) ?? new Set<string>();
      owners.add(owner);
      paramOwners.set(declared, owners);
      const params = ownerParams.get(owner) ?? new Set<string>();
      params.add(declared);
      ownerParams.set(owner, params);
    } else if (n.carrierForm === "field") {
      const fields = ownerFields.get(owner) ?? new Set<string>();
      fields.add(declared);
      ownerFields.set(owner, fields);
    } else {
      continue;
    }
    if (!ownerWhere.has(owner)) ownerWhere.set(owner, { file: n.file ?? "", line: n.startLine ?? 0 });
  }

  const index: RepoIndex = { paramOwners, ownerParams, ownerFields, ownerWhere };
  INDEX_CACHE.set(graph, index);
  return index;
}

/* ══════════════════════════════════════════════════════════════════════════
 * LA MEDICIÓN
 * ══════════════════════════════════════════════════════════════════════════ */

interface ParameterObjectProblem {
  readonly finding: Finding;
  readonly via: "clump" | "signature";
  /** El grupo que viaja junto — vacío cuando no se pudo derivar. */
  readonly group: readonly string[];
  /** Cuántas firmas distintas llevan el grupo junto (la anclada incluida). */
  readonly sites: number;
  /** Parámetros de la firma anclada (0 = no se pudo leer). */
  readonly signatureSize: number;
  readonly withGraph: boolean;
  readonly withTree: boolean;
  /** Símbolo del repo que ya declara TODOS los nombres del grupo como campos. */
  readonly groupingType: { readonly owner: string; readonly file: string; readonly line: number } | null;
  /** `true` cuando ese símbolo es la propia clase que declara la firma anclada. */
  readonly groupingIsSelf: boolean;
}

/** Clave de dueño de la CLASE que declara la función anclada, o `null`. */
function declaringOwner(fn: FunctionUnit | null): string | null {
  if (!fn || fn.symbolPath.length < 2) return null;
  return `${fn.file}#${fn.symbolPath.slice(0, -1).join(".")}`;
}

/** El símbolo del repo cuyos CAMPOS cubren todo el grupo, o `null`. Prefiere
 *  la propia clase declarante — la lectura "el objeto ya es `this`". */
function findGroupingType(
  index: RepoIndex,
  group: readonly string[],
  selfOwner: string | null,
): { owner: string; file: string; line: number; isSelf: boolean } | null {
  if (group.length === 0) return null;
  const covers = (owner: string): boolean => {
    const fields = index.ownerFields.get(owner);
    return fields !== undefined && group.every((g) => fields.has(g));
  };
  if (selfOwner !== null && covers(selfOwner)) {
    const where = index.ownerWhere.get(selfOwner) ?? { file: "", line: 0 };
    return { owner: selfOwner, file: where.file, line: where.line, isSelf: true };
  }
  for (const [owner, fields] of index.ownerFields) {
    if (fields.size < group.length) continue;
    if (!covers(owner)) continue;
    const where = index.ownerWhere.get(owner) ?? { file: "", line: 0 };
    return { owner, file: where.file, line: where.line, isSelf: false };
  }
  return null;
}

function measure(problem: Finding, ctx: HypothesisContext, graph: CodeGraph | null): ParameterObjectProblem {
  const g = graph ?? ctx.repo.graph ?? null;
  const index = g ? indexOf(g) : null;
  const first = problem.locations[0];
  const anchorFn = first ? functionAt(ctx, first.startLine, first.endLine) : null;
  const anchorNames = anchorFn ? paramNames(anchorFn.node) : null;
  const signatureSize = anchorNames?.length ?? 0;
  const selfOwner = declaringOwner(anchorFn);

  const base = {
    finding: problem,
    signatureSize,
    withGraph: g !== null,
    withTree: ctx.file !== null,
  } as const;

  if (problem.kind === DATA_CLUMP_KIND) {
    /* EL GRUPO SE RE-DERIVA DEL ÁRBOL, no del TÍTULO del hallazgo. Leer el
     * título es lo que hacía el spec viejo de `strategy.ts` y lo que AN1 tuvo
     * que desarmar: un título es texto de producto y puede cambiar sin que
     * nadie note que una hipótesis dejó de funcionar. La INTERSECCIÓN de los
     * nombres de parámetro de las firmas que el propio ancla señala es el
     * mismo hecho, leído de donde vive. */
    const sets: (readonly string[])[] = [];
    for (const loc of problem.locations) {
      const fn = functionAt(ctx, loc.startLine, loc.endLine);
      const names = fn ? paramNames(fn.node) : null;
      if (names) sets.push(names);
    }
    const firstSet = sets[0];
    let group: string[] = [];
    if (firstSet) {
      group = [...new Set(firstSet)].filter((n) => sets.every((s) => s.includes(n)));
    }
    const grouping = index ? findGroupingType(index, group, selfOwner) : null;
    return {
      ...base,
      via: "clump",
      group,
      sites: sets.length,
      groupingType: grouping ? { owner: grouping.owner, file: grouping.file, line: grouping.line } : null,
      groupingIsSelf: grouping?.isSelf ?? false,
    };
  }

  /* CAMINO `long-parameter-list`: la compuerta propia. ¿>= MIN_GROUP de estos
   * nombres aparecen JUNTOS en otra firma DEL MISMO ARCHIVO? (ver el
   * docstring: repo entero convierte esto en un colador por co-ocurrencia de
   * nombres genéricos, medido). */
  if (!ctx.file || !anchorNames || !anchorFn) {
    return { ...base, via: "signature", group: [], sites: 0, groupingType: null, groupingIsSelf: false };
  }
  const own = new Set(anchorNames);
  let bestGroup: string[] = [];
  let sharers = 0;
  for (const other of ctx.file.functions) {
    if (other.startLine === anchorFn.startLine && other.endLine === anchorFn.endLine) continue;
    /* LA FIRMA QUE ACOMPAÑA TIENE QUE SER OTRA OPERACIÓN, NO LA MISMA CON OTRA
     * CARA. Es la MISMA regla que `detect/intra-file/data-clump.ts` ya aplica
     * por su cuenta (`distinctOperationNames`), y no está acá por simetría:
     * está porque sin ella el camino `long-parameter-list` emitía dos falsos
     * positivos ESTRUCTURALES que se ven abriendo el archivo —los dos medidos
     * en `corpus/click`—:
     *
     *   1. **SOBRECARGAS DE TIPO.** `termui.py` declara `prompt` tres veces
     *      (dos `@t.overload` y la implementacion) y `progressbar` otras tres.
     *      Son UNA operacion escrita tres veces, no tres firmas que comparten
     *      datos: el grupo "viaja" a ninguna parte.
     *   2. **EL CONSTRUCTOR Y EL DE SU CLASE BASE.** `Option.__init__` y
     *      `Parameter.__init__` (`core.py`), `FloatRange.__init__` e
     *      `IntRange.__init__` (`types.py`), y las `__init__` de
     *      `exceptions.py` comparten el grupo porque una DELEGA en la otra con
     *      `super().__init__(...)`. Ahi el remedio correcto ya esta aplicado
     *      —se llama herencia— y proponer un objeto de parametros es proponer
     *      deshacerlo.
     *
     * Las dos formas comparten la firma exacta: **el mismo NOMBRE de
     * operacion**. Un grupo que solo aparece dos veces bajo el mismo nombre no
     * viaja: se repite. */
    if (other.name !== null && anchorFn.name !== null && other.name === anchorFn.name) continue;
    const names = paramNames(other.node);
    if (!names) continue;
    const shared = [...new Set(names)].filter((n) => own.has(n));
    if (shared.length < MIN_GROUP) continue;
    sharers++;
    if (shared.length > bestGroup.length) bestGroup = shared.sort();
  }
  const grouping = index ? findGroupingType(index, bestGroup, selfOwner) : null;
  return {
    ...base,
    via: "signature",
    group: bestGroup,
    sites: sharers > 0 ? sharers + 1 : 0,
    groupingType: grouping ? { owner: grouping.owner, file: grouping.file, line: grouping.line } : null,
    groupingIsSelf: grouping?.isSelf ?? false,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * LOS CHECKS
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * REQUIRED — LA ÚNICA PUERTA, y es la precondición de Fowler entera: **los
 * mismos >= 3 datos viajan juntos a >= 2 firmas**. Las ramas que no pueden
 * mirar devuelven `holds: false`.
 */
const grupoViajaJunto: Check<ParameterObjectProblem, CodeGraph | null> = {
  id: "grupo-viaja-junto",
  describe:
    `Los mismos >= ${MIN_GROUP} datos aparecen JUNTOS en >= ${MIN_SITES_SIGNATURE} firmas del mismo archivo — la precondición literal de ` +
    "Introduce Parameter Object. Una firma larga cuyos parámetros no viajan juntos a ningún otro lado no tiene un objeto adentro.",
  run(problem) {
    if (!problem.withTree) {
      return { holds: false, evidence: "Sin árbol vivo del archivo no se pueden leer los nombres de la firma. No candidata." };
    }
    if (problem.group.length < MIN_GROUP) {
      return {
        holds: false,
        evidence:
          problem.via === "signature"
            ? `Ninguna otra firma de este archivo comparte ${MIN_GROUP} o más nombres de parámetro con ésta (el mejor solape es de ` +
              `${problem.group.length}): la firma es larga, pero sus datos no viajan juntos a ninguna otra parte del archivo. El ` +
              "remedio no es un objeto de parámetros — es que la función hace demasiadas cosas."
            : `La intersección de nombres entre las ${problem.sites} firmas del grupo es de ${problem.group.length} < ${MIN_GROUP}: ` +
              "el árbol vivo no confirma un grupo del tamaño que el ancla midió (firmas con desestructuración, o no se pudo ubicar alguna).",
      };
    }
    if (problem.sites < MIN_SITES_SIGNATURE) {
      return { holds: false, evidence: `El grupo aparece en ${problem.sites} firma(s): sin una segunda, no "viaja".` };
    }
    return {
      holds: true,
      evidence:
        `(${problem.group.join(", ")}) — ${problem.group.length} datos que aparecen juntos en ${problem.sites} firmas. ` +
        "Cada dato nuevo del grupo obliga a tocar todas: eso es lo que un objeto de parámetros deja de costar.",
    };
  },
};

/** DISCRIMINADOR — el grupo es de 4 o más: cuanto más grande, más firma reemplaza el objeto. */
const grupoDeCuatroOMas: Check<ParameterObjectProblem, CodeGraph | null> = {
  id: "grupo-de-cuatro-o-mas",
  describe: `El grupo tiene más de ${MIN_GROUP} datos — el objeto reemplaza más lista de parámetros de la que el piso exige.`,
  run(problem) {
    const holds = problem.group.length > MIN_GROUP;
    return { holds, evidence: `${problem.group.length} datos en el grupo (piso ${MIN_GROUP}).` };
  },
};

/** DISCRIMINADOR — el grupo aparece en el doble de firmas que el piso. */
const grupoEnMuchasFirmas: Check<ParameterObjectProblem, CodeGraph | null> = {
  id: "grupo-en-muchas-firmas",
  describe: `El grupo viaja a >= ${MIN_SITES_SIGNATURE * 2} firmas — cada dato nuevo obliga a tocarlas todas.`,
  run(problem) {
    const holds = problem.sites >= MIN_SITES_SIGNATURE * 2;
    return { holds, evidence: `${problem.sites} firmas llevan el grupo (${holds ? ">=" : "<"} ${MIN_SITES_SIGNATURE * 2}).` };
  },
};

/**
 * DISCRIMINADOR — el grupo es la MITAD O MÁS de la firma anclada: el objeto
 * no agrega un parámetro más, reemplaza la mayor parte de la lista. Es la
 * forma en la que el refactor de verdad acorta la firma en vez de sólo
 * reordenarla.
 */
const grupoDominaLaFirma: Check<ParameterObjectProblem, CodeGraph | null> = {
  id: "grupo-domina-la-firma",
  describe: "El grupo es la mitad o más de los parámetros de la firma anclada — el objeto acorta la firma, no la reordena.",
  run(problem) {
    if (problem.signatureSize === 0) return { holds: false, evidence: "No se pudo leer la firma anclada: no evaluado." };
    const holds = problem.group.length * 2 >= problem.signatureSize;
    return { holds, evidence: `${problem.group.length} de ${problem.signatureSize} parámetros de la firma anclada.` };
  },
};

/**
 * REQUIRED — **EL OBJETO NO PUEDE SER YA LA PROPIA CLASE.** Y este check no
 * está acá por prolijidad conceptual: está porque el A/B del guardián midió
 * que sin él **esta familia le borra una propuesta a `Builder`**, que es uno
 * de los 19 patrones congelados.
 *
 * EL MECANISMO, VERIFICADO: `engine.ts#arbitrateRivalHypotheses` retira una
 * OPORTUNIDAD (`ausente`/`parcial`) cuando otro patrón sobre el MISMO
 * `Finding` está en `ya-aplicado`/`aplicado-eludido` y sus `places` solapan.
 * `Parameter Object` cuelga de `long-parameter-list`, que es también un ancla
 * de `Builder` y de `Decorator`. La primera versión de este archivo devolvía
 * `ya-aplicado` cuando la clase declarante ya guardaba el grupo como campos
 * propios — y eso, sobre `corpus/click`, **enterró la oportunidad de `Builder`
 * en `src/click/core.py:2944`** (`Option.__init__`, 19 parámetros: el
 * constructor telescópico que Builder existe para resolver). Medido con dos
 * árboles congelados que difieren SÓLO en las líneas de registro:
 * `scratchpad-as1/ab/click-{A,B}.json`.
 *
 * LA CORRECCIÓN, y por qué ésta y no otra: en vez de publicar una
 * CONFIRMACIÓN —que es lo único que el arbitraje usa para enterrar rivales—,
 * esta familia se declara **NO CANDIDATA**. No se pierde ninguna propuesta
 * (una confirmación nunca fue una propuesta: `engine.ts` le pone
 * `confidence: null` justamente para que no compita) y **el arbitraje deja de
 * tener con qué borrarle nada a nadie.** Consecuencia declarada:
 * `ya-aplicado` y `aplicado-eludido` son INALCANZABLES en esta familia, igual
 * que `aplicado-eludido` en `value-object.ts`, y por una razón escrita en vez
 * de fabricada.
 */
const elObjetoNoEsYaLaClase: Check<ParameterObjectProblem, CodeGraph | null> = {
  id: "el-objeto-no-es-ya-la-clase",
  describe:
    "La clase que declara esta firma NO guarda ya todos los datos del grupo como campos propios — si los guardara, el objeto que " +
    "los agrupa sería esa clase y proponer uno nuevo sería proponer el que ya existe.",
  run(problem) {
    if (problem.groupingIsSelf) {
      return {
        holds: false,
        evidence:
          `La clase que declara esta firma ya guarda como campos propios los ${problem.group.length} datos del grupo ` +
          `(${problem.group.join(", ")}): el objeto que los agrupa es esa clase, y la firma está recibiendo de vuelta el estado que ` +
          "el objeto ya tiene. No candidata.",
      };
    }
    return { holds: true, evidence: "La clase declarante no guarda todos estos datos como campos propios (o la firma no vive en una clase)." };
  },
};

const APPLIED_LABEL =
  "¿La clase que declara esta firma ya guarda TODOS los datos del grupo como campos propios — el objeto que los agrupa YA es esa clase?";
const PARTIAL_LABEL =
  "¿Algún otro símbolo del repo ya declara TODOS los datos del grupo como campos — el objeto existe y estas firmas lo desarman en pedazos (Preserve Whole Object)?";

function appliedState(problem: ParameterObjectProblem): AppliedStateResult {
  if (!problem.withGraph) {
    return {
      state: "ausente",
      checks: [
        {
          label: PARTIAL_LABEL,
          passed: false,
          why:
            "Esta corrida no tiene grafo del repo: no se pudo mirar si el tipo que agrupa estos datos ya existe en alguna parte. " +
            "Se publica como `ausente` porque es lo que se puede sostener, no porque se haya verificado que no existe — la pasada " +
            "con grafo es la que decide.",
          role: "applied",
        },
      ],
    };
  }

  /* La rama `ya-aplicado` NO existe: la corta el `required`
   * `el-objeto-no-es-ya-la-clase`, ANTES de que haya una confirmación que el
   * arbitraje pueda usar para enterrar a `Builder` o a `Decorator`. Ver ese
   * check para la medición. */
  const t = problem.groupingType;
  if (t && !problem.groupingIsSelf) {
    return {
      state: "parcial",
      checks: [
        {
          label: PARTIAL_LABEL,
          passed: true,
          why:
            `El repo ya declara un símbolo con TODOS estos campos (${t.file}${t.line ? `:${t.line}` : ""}): el objeto de ` +
            "parámetros existe y está escrito. Lo que falta no es crearlo — es pasarlo entero en vez de desarmarlo en sus datos " +
            "sueltos (Preserve Whole Object).",
          role: "applied",
        },
      ],
    };
  }
  return {
    state: "ausente",
    checks: [
      {
        label: APPLIED_LABEL,
        passed: false,
        why: "La clase declarante no guarda todos estos datos como campos propios.",
        role: "applied",
      },
      {
        label: PARTIAL_LABEL,
        passed: false,
        why: `Ningún símbolo del repo declara los ${problem.group.length} datos del grupo como campos: el objeto que los agruparía no existe todavía.`,
        role: "applied",
      },
    ],
  };
}

const SOURCE =
  "Fowler, Refactoring, «Introduce Parameter Object» y «Preserve Whole Object» — refactoring.guru/es/introduce-parameter-object " +
  "y refactoring.guru/es/preserve-whole-object; el olor es refactoring.guru/es/smells/data-clumps.";

const TO_CONFIRM: readonly string[] = [
  "Confirmar que los datos del grupo son del MISMO concepto: la identidad acá es el nombre del parámetro, no su significado — dos " +
    "`id` de conceptos distintos cuentan como el mismo dato.",
  "Si la firma está IMPUESTA desde afuera (implementa una interfaz de un tercero, es un handler que un framework invoca, es la " +
    "traducción directa de una API externa), el objeto de parámetros no puede cruzar ese borde y el remedio no aplica.",
  "Si los datos del grupo son independientes entre sí y nunca cambian juntos, el objeto sólo agrega una indirección: el refactor " +
    "paga cuando el grupo es un concepto, no cuando es una coincidencia de firmas.",
  "Si el objeto que se crearía sería un contenedor sin comportamiento y el lenguaje ya ofrece argumentos con nombre, nombrar los " +
    "argumentos resuelve la legibilidad más barato — refactoring.guru, «cuándo NO conviene».",
];

function buildSpec(problem: ParameterObjectProblem): HypothesisSpec<ParameterObjectProblem, CodeGraph | null> {
  return {
    pattern: "Parameter Object",
    ceiling: "alta",
    needs: [],
    required: [grupoViajaJunto, elObjetoNoEsYaLaClase],
    discriminators: [grupoDeCuatroOMas, grupoEnMuchasFirmas, grupoDominaLaFirma],
    appliedState: () => appliedState(problem),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * LA TRAZA DEL EMBUDO — mismo mecanismo, misma forma y mismo default que
 * `value-object.ts#startValueObjectTrace` y `engine.ts#startArbitrationTrace`:
 * `null` en producción ⇒ costo cero, no cambia ningún comportamiento.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface ParameterObjectTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly via: string;
  readonly withGraph: boolean;
  readonly withTree: boolean;
  readonly group: readonly string[];
  readonly sites: number;
  readonly signatureSize: number;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly appliedState: string;
  readonly emitted: boolean;
}

let trace: ParameterObjectTraceEntry[] | null = null;

export function startParameterObjectTrace(): void {
  trace = [];
}

export function takeParameterObjectTrace(): readonly ParameterObjectTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

export const hypothesis: HypothesisBuilder = {
  id: "parameter-object",
  pattern: "Parameter Object",
  layer: "refactorizacion",
  anchors: [LONG_PARAMETER_LIST_KIND, DATA_CLUMP_KIND],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const po = measure(problem, ctx, graph);
    const spec = buildSpec(po);
    const outcome = runEngine(spec, ctx.capabilities, po, graph);
    if (trace) {
      const checks = spec.required.map((c) => ({ id: c.id, holds: c.run(po, graph).holds }));
      const loc = problem.locations[0];
      trace.push({
        findingId: problem.id ?? "",
        kind: problem.kind,
        file: loc?.file ?? "",
        line: loc?.startLine ?? 0,
        symbol: loc?.symbol ?? "",
        via: po.via,
        withGraph: po.withGraph,
        withTree: po.withTree,
        group: po.group,
        sites: po.sites,
        signatureSize: po.signatureSize,
        checks,
        diesAt: checks.find((c) => !c.holds)?.id ?? null,
        appliedState: spec.appliedState(po, graph).state,
        emitted: outcome !== null,
      });
    }
    if (!outcome) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: problem.locations,
      cost:
        "Un tipo nuevo, chico, con los datos del grupo adentro. Se paga una vez: cada firma que hoy los repite pasa a recibir uno " +
        "solo, y agregar un dato más al grupo deja de obligar a tocar todas las firmas. El precio es una indirección más al leer " +
        "cada llamada, y que el tipo hay que nombrarlo bien o el remedio empeora la lectura.",
    });
  },
};
