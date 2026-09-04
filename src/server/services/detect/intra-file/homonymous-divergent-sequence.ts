/**
 * `homonymous-divergent-sequence` — OLA AC, frente AC3. EL ANCLA-FUERZA DE
 * TEMPLATE METHOD (segundo y último caso de la prueba de la ola; el primero,
 * `State`, es `enumerated-field-dispatch`, refutado y medido por AC2).
 *
 * ─── QUÉ FUERZA NOMBRA, Y POR QUÉ NO ES LA ESTRUCTURA ──────────────────────
 *
 * LA FUERZA que Template Method resuelve: **dos o más unidades emparentadas
 * escriben, cada una por su cuenta, la MISMA secuencia de pasos, con algunos
 * pasos distintos — y esa secuencia está repetida en cada una en vez de estar
 * UNA SOLA VEZ arriba.**
 *
 * LA ESTRUCTURA del patrón ya aplicado es otra cosa: el esqueleto vive una
 * sola vez en el ancestro y los subtipos sólo redefinen los pasos variables.
 * **Este detector no puede confundir una con la otra por construcción: exige
 * que ≥2 hermanos DECLAREN el homónimo, y en el patrón aplicado el homónimo
 * lo declara el ancestro y NINGÚN hermano.** Lo que sí puede pasar —y se mide,
 * no se supone— es que dispare sobre los GANCHOS de una plantilla ya aplicada
 * (los pasos variables SÍ los declara cada hermano). Por eso este detector
 * **no filtra por "el ancestro ya lo declara"**: esa pregunta es la de la
 * RESOLUCIÓN y la contesta `hypotheses/template-method.ts#appliedState`, sin
 * un solo cambio. El ancla detecta la fuerza; la hipótesis verifica que la
 * resolución esté ausente. El reparto `ausente`/`parcial` contra `ya-aplicado`
 * es el resultado de la medición, no una propiedad de la definición.
 *
 * ─── LAS CUATRO CONDICIONES, CON LA INTENCIÓN DE CADA UNA ──────────────────
 *
 * (1) HERMANDAD DECLARADA — ≥ `unidades` unidades-tipo de ESTE archivo
 *     declaran el mismo ancestro (por el grafo, aristas `extends`/`mixes-in`;
 *     o, sin grafo/sin arista, por el nombre de superclase que la gramática
 *     escribió).
 *     INTENCIÓN: *"existe un ARRIBA donde el esqueleto podría vivir una sola
 *     vez"*. Sin ancestro común no hay "en vez de estar arriba": la
 *     mitigación del patrón no tiene dónde aterrizar. Un ancestro existe tanto
 *     si el patrón está puesto como si no — por eso es fuerza y no estructura.
 *
 * (2) EL HOMÓNIMO ESTÁ ESCRITO N VECES — ≥ `unidades` de esos hermanos
 *     DECLARAN un miembro del mismo nombre, con aridad declarada igual y sin
 *     desacuerdo escrito de tipo de retorno.
 *     INTENCIÓN: *"es la MISMA operación, escrita más de una vez"*. El mismo
 *     nombre en hermanos de una familia es la evidencia de forma de que las
 *     dos declaraciones ocupan el mismo lugar del contrato; la aridad y el
 *     tipo de retorno son la evidencia de que unificarlas es siquiera posible
 *     (el falso medido `BsonObject.Add(string,BsonToken)` /
 *     `BsonArray.Add(BsonToken)`, y el falso medido
 *     `GetEnumerator(): IEnumerator<BsonProperty>` /
 *     `IEnumerator<BsonToken>`, los dos ya documentados en
 *     `hypotheses/template-method.ts`).
 *
 * (3) LA SECUENCIA COINCIDE EN PARTE Y DIFIERE EN PARTE — cada declaración
 *     invoca ≥ `llamadasPorCopia` nombres; ≥ `pasosComunes` nombres son
 *     invocados por TODAS; y ≥ 2 declaraciones invocan además al menos un
 *     nombre que no invocan todas.
 *     INTENCIÓN: *"el mismo algoritmo con un paso que varía"*, que es
 *     literalmente lo que el patrón resuelve. Las dos mitades cortan los dos
 *     falsos opuestos, y ninguna sobra:
 *       - sin pasos COMUNES son dos algoritmos distintos que comparten un
 *         nombre genérico (`init`/`run`/`process`) — el primer `toConfirm`
 *         que `hypotheses/template-method.ts` ya declaraba y que ninguna de
 *         sus anclas viejas podía contestar;
 *       - sin pasos PROPIOS no hay paso variable: es duplicación pura, y su
 *         mitigación es subir el método entero (Pull Up Method), no una
 *         plantilla con ganchos.
 *     La divergencia se exige MUTUA (≥2 declaraciones con paso propio): que
 *     una sola agregue algo es una extensión, no una variación compartida.
 *
 * (4) EL ORDEN DE LOS PASOS COMUNES ES EL MISMO EN TODAS — la subsecuencia de
 *     los nombres comunes, en orden de aparición, es idéntica en cada
 *     declaración.
 *     INTENCIÓN: *"es una SECUENCIA, no un conjunto de llamadas"*. Lo que la
 *     plantilla fija en la base es el ORDEN; dos cuerpos que invocan los
 *     mismos nombres en orden distinto no comparten un esqueleto, comparten
 *     un vocabulario. Es la única de las cuatro condiciones que necesita el
 *     árbol vivo y no se puede contestar desde el grafo (ver abajo).
 *
 * ─── POR QUÉ EL ÁRBOL VIVO Y NO SÓLO EL GRAFO — MEDIDO, NO SUPUESTO ────────
 *
 * El encargo pedía construir esta ancla "usando el grafo". Se midió primero:
 * las aristas `calls` del grafo COLAPSAN las ocurrencias (`weight`) y no
 * llevan posición, así que **no expresan una secuencia**; y sólo existen
 * cuando la llamada RESUELVE a un símbolo del repo, así que son ralas. Medido
 * sobre los volcados de grafo de los 16 repos (sonda `scratchpad-ac3/
 * ac3-dump-grafo.mts`): en `guava`, 393 familias y **2.138** pares
 * (ancestro, miembro homónimo) con ≥2 hermanos que lo declaran, de los que
 * la regla de arriba, leída SÓLO del grafo, confirma **8**. En `click` y
 * `eslint`, **0**. Un ancla con esa población no llega nunca a n≥12.
 *
 * Por eso el reparto es: **la HERMANDAD la aporta el grafo** (aristas
 * `extends`/`mixes-in`, con el ancestro en CUALQUIER archivo — 323 de los 871
 * pares de guava con ≥2 declarantes en un mismo archivo tienen su base fuera
 * de él, invisibles para `inheritance-family.ts`, que exige la base en el
 * mismo archivo), **y las SECUENCIAS las aporta el árbol vivo** de este
 * archivo. Es exactamente la unificación de la Ola N
 * (`IntraGraphOptIn.needsGraph`): un detector `intra-file` que corre en la
 * pasada donde el grafo YA existe, con el árbol de su archivo todavía vivo.
 *
 * BRECHA DECLARADA, MEDIDA Y NO CERRADA: los cuerpos se leen del árbol de
 * ESTE archivo, así que **los ≥2 hermanos que declaran el homónimo tienen que
 * estar en el mismo archivo**. En Java/C#/Ruby, con una clase por archivo, eso
 * deja fuera a las familias repartidas (en guava las alcanza igual, por las
 * clases anidadas estáticas). Cerrarla exige leer el cuerpo de un símbolo de
 * OTRO archivo, que ninguna granularidad de este analizador ofrece hoy (un
 * detector no re-parsea ni re-lee disco — `detect/types.ts#AstNode`).
 *
 * SIN GRAFO (pasada 1, `CK_ANALISIS_DOS_PASADAS=0`, o build de grafo fallido)
 * este detector NO se apaga: `needsGraph` en un detector `intra-*` es RUTEO y
 * no compuerta (`detect/types.ts#IntraGraphOptIn`). Degrada solo a la
 * hermandad por AST (nombre de superclase escrito), que es un subconjunto
 * estricto — nunca inventa una familia que el grafo desmienta.
 *
 * GO: sin herencia de implementación no hay ancestro que compartir —
 * `needs: ["herencia"]` lo declara como `no-aplicable`, mismo criterio y
 * mismas palabras que `inheritance-family.ts`.
 */
import { CONSTRUCTOR_NAMES } from "../../code-grammar.js";
import type { CodeGraph, CodeGraphNode } from "../../graph/types.js";
import { pisoDeclarado, presencia } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "unidades" | "pasosComunes" | "llamadasPorCopia";

/** Aristas que hacen "familia": herencia de implementación e incorporación de
 *  módulo. `implements`/`satisfies` quedan afuera a propósito, con el MISMO
 *  argumento que `hypotheses/template-method.ts#FAMILY_EDGE_KINDS` ya
 *  documenta: son satisfacción de INTERFAZ, y una firma sin cuerpo no puede
 *  llevar un esqueleto. */
const FAMILY_EDGE_KINDS: ReadonlySet<string> = new Set(["extends", "mixes-in"]);

/* ── gramática: las mismas cuatro lecturas que ya viven en
 * `hypotheses/template-method.ts` y `intra-file/inheritance-family.ts`,
 * duplicadas acá a propósito y por el mismo argumento que esos dos archivos
 * ya declaran (cada capa autocontenida; no se crea una dependencia cruzada
 * por un detalle que sólo a estos archivos les importa).
 * ─────────────────────────────────────────────────────────────────────── */

/**
 * EL NOMBRE de la PRIMERA base escrita en una lista de bases, sin parámetros
 * de tipo y sin calificadores.
 *
 * DEFECTO MEDIDO QUE ESTO CIERRA, y que `inheritance-family.ts` y
 * `hypotheses/template-method.ts#extractSuperclassNameTM` (las dos copias
 * previas de esta lectura) todavía tienen: cortaban la lista de bases con
 * `split(",")` sobre el texto crudo y devolvían el resto TAL CUAL. Sobre
 * `corpus/click/src/click/types.py` eso partía la familia real de
 * `ParamType` en OCHO ancestros distintos —`ParamType[bool]`,
 * `ParamType[str]`, `ParamType[t.Any]`…— cada uno con UN solo hermano, y
 * además producía nombres truncados a mitad de un genérico
 * (`CompositeParamType[tuple[t.Any`, `t.Generic[_ValueT_co`) al cortar en una
 * coma que estaba DENTRO de los corchetes. Con parámetros de tipo, dos
 * hermanos de la misma base nunca se reconocían como hermanos.
 *
 * La lectura es de FORMA y vale igual en las nueve gramáticas: cortar la lista
 * en la primera coma de PROFUNDIDAD CERO (nunca dentro de `[]`/`<>`/`()`),
 * quedarse con el primer elemento, sacarle los parámetros de tipo y quedarse
 * con el último segmento calificado (`a.b.C` ⇒ `C`) — que es la forma en que
 * el grafo nombra a un nodo (`symbolPath`), así que las dos vías de este
 * detector producen la MISMA clave.
 */
function firstBaseName(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/^[<:]\s*/, "")
    .replace(/^extends\s+/, "")
    .replace(/^\((.*)\)$/s, "$1");
  let depth = 0;
  let end = text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "[" || c === "<" || c === "(") depth++;
    else if (c === "]" || c === ">" || c === ")") depth--;
    else if (c === "," && depth === 0) {
      end = i;
      break;
    }
  }
  const bare = text.slice(0, end).split(/[[<(]/)[0] ?? "";
  const segments = bare.split(/[.:]+/).filter((s) => s.trim().length > 0);
  const name = segments[segments.length - 1]?.trim();
  return name && /^[A-Za-z_$][\w$]*$/.test(name) ? name : null;
}

/** Nombre de la clase base que `classNode` declara heredar — MISMAS cuatro
 *  ranuras de gramática que `inheritance-family.ts#extractSuperclassName`
 *  (`superclass`, `superclasses`, `bases`, `heritage`), con el nombre pasado
 *  por `firstBaseName` (ver su docstring para el defecto medido). */
function extractSuperclassName(classNode: AstNode): string | null {
  for (const field of ["superclass", "superclasses", "bases"]) {
    const text = (classNode.childForFieldName(field) as AstNode | null)?.text;
    if (text) return firstBaseName(text);
  }
  for (let i = 0; i < classNode.childCount; i++) {
    const child = classNode.child(i) as AstNode | null;
    if (child && /heritage/i.test(child.type)) {
      const m = /extends\s+([\s\S]+)$/.exec(child.text);
      if (m?.[1]) return firstBaseName(m[1]);
    }
  }
  return null;
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

/** Tipo de nodo de una LLAMADA — vocabulario de gramática, igual a
 *  `hypotheses/template-method.ts#CALL_NODE_WORD`. */
const CALL_NODE_WORD = /(^|_)(call|invocation)(_|$)/;
/** Campos donde cada gramática cuelga el callee. */
const CALLEE_FIELDS = ["function", "name", "method"];
/** Campos donde cada gramática escribe el tipo de retorno. */
const RETURN_TYPE_FIELDS = ["type", "return_type"];
/** Campos de lista de parámetros — el mismo par que `code-grammar.ts#isFunctionLike`. */
const PARAM_LIST_FIELDS = ["parameters", "parameter_list"];
/** PALABRAS DE LA GRAMÁTICA que un barrido de llamadas recoge y que no son un
 *  PASO del algoritmo: la referencia al ancestro y a sí mismo, y la
 *  construcción. Subconjunto exacto de `hypotheses/template-method.ts
 *  #CONTROL_KEYWORDS`, que ya las lista con el mismo propósito y el mismo
 *  estatus (vocabulario de GRAMÁTICA, permitido; nunca vocabulario de
 *  dominio). */
const NON_STEP_KEYWORDS: ReadonlySet<string> = new Set(["super", "base", "this", "self", "new"]);

function calleeName(callNode: AstNode): string | null {
  for (const field of CALLEE_FIELDS) {
    const callee = callNode.childForFieldName(field) as AstNode | null;
    if (!callee) continue;
    const segments = callee.text.split(/[.:>-]+/);
    const last = segments[segments.length - 1]?.trim();
    const cleaned = last ? /[A-Za-z_$][\w$]*/.exec(last)?.[0] : null;
    if (cleaned) return cleaned;
  }
  return null;
}

/** LA SECUENCIA: los nombres invocados desde el cuerpo, EN ORDEN DE APARICIÓN
 *  y sin deduplicar. Sólo nodos de llamada — un identificador suelto no es un
 *  paso (mismo criterio estricto que `astCallNames`). */
function callSequence(member: AstNode): string[] {
  const body = (member.childForFieldName("body") as AstNode | null) ?? member;
  const out: string[] = [];
  const visit = (node: AstNode): void => {
    if (CALL_NODE_WORD.test(node.type)) {
      const name = calleeName(node);
      if (name) out.push(name);
    }
    for (const child of namedChildren(node)) visit(child);
  };
  visit(body);
  return out;
}

function writtenReturnType(member: AstNode): string | undefined {
  for (const field of RETURN_TYPE_FIELDS) {
    const node = member.childForFieldName(field) as AstNode | null;
    const text = node?.text.trim();
    if (text) return text;
  }
  return undefined;
}

interface DeclaredMethod {
  readonly name: string;
  readonly arity: number;
  readonly returnType: string | undefined;
  readonly sequence: readonly string[];
  readonly startLine: number;
  readonly endLine: number;
}

/** Miembros con FIRMA de una unidad-tipo, ya sin constructores (por tipo de
 *  nodo, por nombre igual al de la unidad y por protocolo nativo — los tres
 *  mecanismos que `methodsOfClassAst` documenta). */
function declaredMethods(classNode: AstNode, sets: FileUnit["sets"]): DeclaredMethod[] {
  const body = classNode.childForFieldName("body") as AstNode | null;
  if (!body) return [];
  const className = (classNode.childForFieldName("name") as AstNode | null)?.text ?? "";
  const out: DeclaredMethod[] = [];
  for (const member of namedChildren(body)) {
    const paramList = (PARAM_LIST_FIELDS.map((f) => member.childForFieldName(f) as AstNode | null).find((n) => n !== null) ?? null) as AstNode | null;
    const declaresSignature = sets.functionNodes.has(member.type) || (paramList !== null && member.childForFieldName("name") !== null);
    if (!declaresSignature) continue;
    if (sets.constructorNodes.has(member.type)) continue;
    const name = (member.childForFieldName("name") as AstNode | null)?.text;
    if (!name || name === className || CONSTRUCTOR_NAMES.has(name)) continue;
    if (member.childForFieldName("body") === null) continue; // sin cuerpo no hay secuencia que comparar
    out.push({
      name,
      arity: paramList ? namedChildren(paramList).length : 0,
      returnType: writtenReturnType(member),
      sequence: callSequence(member),
      startLine: member.startPosition.row + 1,
      endLine: member.endPosition.row + 1,
    });
  }
  return out;
}

/* ── el grafo: nodos `class-like` por archivo, UNA vez por corrida ────────── */

const CLASS_NODES_BY_FILE = new WeakMap<CodeGraph, Map<string, CodeGraphNode[]>>();

/** Los nodos `class-like` de `file`, indexados una sola vez por grafo (mismo
 *  criterio de memoización por identidad que `template-method.ts#INDEX_CACHE`:
 *  recorrer `graph.nodes` por archivo sería O(archivos × nodos)). */
function classNodesOfFile(graph: CodeGraph, file: string): readonly CodeGraphNode[] {
  let byFile = CLASS_NODES_BY_FILE.get(graph);
  if (!byFile) {
    byFile = new Map();
    for (const n of graph.nodes) {
      if (n.kind !== "symbol" || n.family !== "class-like") continue;
      const list = byFile.get(n.file);
      if (list) list.push(n);
      else byFile.set(n.file, [n]);
    }
    CLASS_NODES_BY_FILE.set(graph, byFile);
  }
  return byFile.get(file) ?? [];
}

const DECLARED_NAMES = new WeakMap<CodeGraph, ReadonlySet<string>>();

/** Todo nombre que ESTE repositorio declara como símbolo (último segmento de
 *  `symbolPath`), indexado una sola vez por grafo. Es la evidencia de la
 *  condición (5): distingue un paso que es una pieza de este código de un
 *  nombre que viene de afuera (biblioteca estándar, runtime). No es
 *  vocabulario: es el conjunto de nombres que el propio repo escribió. */
function declaredSymbolNames(graph: CodeGraph): ReadonlySet<string> {
  let names = DECLARED_NAMES.get(graph);
  if (!names) {
    const set = new Set<string>();
    for (const n of graph.nodes) {
      if (n.kind !== "symbol") continue;
      const last = n.symbolPath[n.symbolPath.length - 1];
      if (last) set.add(last);
    }
    names = set;
    DECLARED_NAMES.set(graph, set);
  }
  return names;
}

interface LocalUnit {
  readonly name: string;
  readonly node: AstNode;
  readonly startLine: number;
  readonly methods: readonly DeclaredMethod[];
  /** Nombres de ancestro declarados: por el grafo (`extends`/`mixes-in`, en
   *  cualquier archivo) y/o por la superclase que la gramática escribió. */
  readonly ancestors: ReadonlySet<string>;
  readonly ancestorsFromGraph: boolean;
}

/** La subsecuencia de `sequence` restringida a `shared`, sin repetir: el ORDEN
 *  en que esta declaración recorre los pasos comunes. */
function sharedOrder(sequence: readonly string[], shared: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of sequence) {
    if (!shared.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export const detector: IntraFileDetector<ThresholdKey, "homonymous-divergent-sequence"> = {
  id: "homonymous-divergent-sequence",
  kind: "homonymous-divergent-sequence",
  scope: "intra-file",
  needsGraph: true,
  title: "Hermanos que repiten la misma secuencia de pasos con pasos propios",
  needs: ["herencia"],
  thresholds: {
    unidades: presencia({
      rationale:
        "con UNA sola declaración no hay nada repetido que subir: la forma que este detector busca ('la misma secuencia escrita N veces') no existe por debajo de dos. Mismo MIN_DISTINCT_UNITS (2) que hypotheses/template-method.ts ya exige para reconocer una familia; no hay magnitud que calibrar.",
    }),
    pasosComunes: pisoDeclarado(2, {
      rationale:
        "un solo paso común no es una SECUENCIA y no tiene orden que comparar: con un elemento la condición (4) es vacía. Dos es el mínimo con el que 'el mismo algoritmo' y 'el mismo orden' significan algo. Piso de FORMA, no magnitud calibrada.",
    }),
    llamadasPorCopia: pisoDeclarado(3, {
      rationale:
        "mismo MIN_SEQUENCE_LEN (3) que hypotheses/template-method.ts hereda de pattern-behavioral.ts para decidir que un cuerpo tiene 'secuencia de llamadas' suficiente para compararse; se reutiliza el número que el proyecto ya usa para esta misma pregunta en vez de inventar uno nuevo.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const unidades = ctx.threshold("unidades"); // presencia() ⇒ value 1, `> 1` es `>= 2`
    const pasosComunes = ctx.threshold("pasosComunes");
    const llamadasPorCopia = ctx.threshold("llamadasPorCopia");
    const graph = ctx.graph ?? null;
    // `graphIndex()` y no `graph.edges.filter(...)`: recorrer las aristas por
    // clase sería O(clases × aristas) — la regla que
    // `ola-n/CONTRATO-UNIFICACION.md` §3 le fija a todo detector `intra-*`.
    const index = graph ? (ctx.graphIndex?.() ?? null) : null;

    // (1a) las unidades-tipo de ESTE archivo, con sus miembros y sus ancestros
    const units: LocalUnit[] = [];
    walkTree(file.root, (node) => {
      if (!node.isNamed || !file.sets.classNodes.has(node.type)) return;
      const classNode = node as AstNode;
      const name = (classNode.childForFieldName("name") as AstNode | null)?.text;
      if (!name) return;
      const methods = declaredMethods(classNode, file.sets);
      if (methods.length === 0) return;

      const ancestors = new Set<string>();
      let fromGraph = false;
      if (graph && index) {
        const graphNode = classNodesOfFile(graph, file.path).find((n) => n.symbolPath[n.symbolPath.length - 1] === name);
        if (graphNode) {
          for (const edge of index.edgesFrom(graphNode.id)) {
            if (!FAMILY_EDGE_KINDS.has(edge.kind) || edge.provenance === "ambiguous") continue;
            const targetName = index.nodeById(edge.to)?.symbolPath.at(-1) ?? null;
            if (targetName) {
              ancestors.add(targetName);
              fromGraph = true;
            }
          }
        }
      }
      const written = extractSuperclassName(classNode);
      if (written) ancestors.add(written);
      if (ancestors.size === 0) return;
      units.push({ name, node: classNode, startLine: classNode.startPosition.row + 1, methods, ancestors, ancestorsFromGraph: fromGraph });
    });

    // (1b) agrupar por ancestro declarado
    const byAncestor = new Map<string, LocalUnit[]>();
    for (const unit of units) {
      for (const ancestor of unit.ancestors) {
        if (ancestor === unit.name) continue;
        const list = byAncestor.get(ancestor) ?? [];
        list.push(unit);
        byAncestor.set(ancestor, list);
      }
    }

    /** LOS PASOS: la secuencia sin lo que no es un paso — las palabras de la
     *  gramática (`NON_STEP_KEYWORDS`) y la llamada al MISMO nombre, que es
     *  delegación hacia arriba (`super.m()`/`base.m()` llegan acá como `m`) o
     *  recursión, nunca un paso del algoritmo. Sin esta resta, "los dos
     *  hermanos llaman a super" se contaba como esqueleto compartido — medido
     *  en `sqlalchemy/sql/sqltypes.py#coerce_compared_value`, cuyos únicos dos
     *  "pasos comunes" eran `coerce_compared_value` y `super`. */
    const stepsOf = (m: DeclaredMethod): string[] => m.sequence.filter((n) => n !== m.name && !NON_STEP_KEYWORDS.has(n));

    interface Candidate {
      readonly methodName: string;
      readonly ancestors: string[];
      readonly decls: { unit: LocalUnit; method: DeclaredMethod; steps: string[] }[];
      readonly shared: Set<string>;
      readonly sharedList: string[];
      readonly divergentes: number;
      readonly siblingCount: number;
    }
    /** UNA candidata por (miembro homónimo + conjunto de declarantes), no una
     *  por ancestro: una unidad casi siempre tiene varios ancestros comunes a
     *  la vez (la superclase Y uno o más módulos incorporados), y sin esto el
     *  MISMO par de cuerpos se reportaba una vez por cada uno — medido en
     *  `sqlalchemy/sql/selectable.py`, donde
     *  `_generate_fromclause_column_proxies` salía TRES veces
     *  (`GenerativeSelect`, `HasCompileState`, `TypedReturnsRows`). Se conserva
     *  el ancestro MÁS ESPECÍFICO (el de menos hermanos en este archivo;
     *  desempate alfabético) y se nombran todos. */
    const candidates = new Map<string, Candidate>();

    for (const [ancestor, siblings] of [...byAncestor.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (siblings.length <= unidades.value) continue;

      // (2) el homónimo, declarado por >= 2 hermanos, con firma unificable
      const byName = new Map<string, { unit: LocalUnit; method: DeclaredMethod }[]>();
      for (const unit of siblings) {
        for (const method of unit.methods) {
          const list = byName.get(method.name) ?? [];
          // una sola declaración por unidad y nombre: la primera en orden de archivo
          if (!list.some((d) => d.unit.name === unit.name)) list.push({ unit, method });
          byName.set(method.name, list);
        }
      }

      for (const [methodName, rawDecls] of [...byName.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (rawDecls.length <= unidades.value) continue;
        const arities = new Set(rawDecls.map((d) => d.method.arity));
        if (arities.size > 1) continue; // aridades distintas ⇒ no son el mismo paso del mismo contrato
        const returnTypes = new Set(rawDecls.map((d) => d.method.returnType).filter((t): t is string => t !== undefined));
        if (returnTypes.size > 1) continue; // desacuerdo ESCRITO ⇒ unificarlas no compila (ausente nunca es desacuerdo)

        // (3) la secuencia: coincide en parte y difiere en parte
        const decls = rawDecls.map((d) => ({ ...d, steps: stepsOf(d.method) })).filter((d) => d.steps.length >= llamadasPorCopia.value);
        if (decls.length <= unidades.value) continue;
        const sets = decls.map((d) => new Set(d.steps));
        const shared = new Set<string>([...sets[0]!].filter((n) => sets.every((s) => s.has(n))));
        if (shared.size < pasosComunes.value) continue;
        const divergentes = decls.filter((d) => d.steps.some((n) => !shared.has(n)));
        if (divergentes.length < 2) continue;

        // (4) el ORDEN de los pasos comunes es el mismo en todas
        const orders = decls.map((d) => sharedOrder(d.steps, shared).join(" › "));
        if (new Set(orders).size !== 1) continue;

        // (5) al menos un paso común es un símbolo que ESTE repo declara
        if (graph && ![...shared].some((n) => declaredSymbolNames(graph).has(n))) {
          continue;
        }

        const key = `${methodName}\u0000${decls.map((d) => d.unit.name).sort().join(",")}`;
        const previa = candidates.get(key);
        if (previa) {
          previa.ancestors.push(ancestor);
          previa.ancestors.sort();
          continue;
        }
        candidates.set(key, {
          methodName,
          ancestors: [ancestor],
          decls,
          shared,
          sharedList: sharedOrder(decls[0]!.steps, shared),
          divergentes: divergentes.length,
          siblingCount: siblings.length,
        });
      }
    }

    const findings: RawFinding[] = [];
    for (const c of [...candidates.values()].sort((a, b) => (a.methodName < b.methodName ? -1 : a.methodName > b.methodName ? 1 : 0))) {
      const { methodName, decls, shared, sharedList } = c;
      const orden = sharedList.join(" › ");
      const ancestor = c.ancestors[0]!;
      const otros = c.ancestors.slice(1);
      const unitNames = decls.map((d) => d.unit.name);
      const locations = decls.map<RoleLocation>((d) => {
        const propiosUnicos = [...new Set(d.steps.filter((n) => !shared.has(n)))];
        return {
          file: file.path,
          startLine: d.method.startLine,
          endLine: d.method.endLine,
          symbol: `${d.unit.name}.${methodName}`,
          role:
            propiosUnicos.length > 0
              ? `"${d.unit.name}" repite los ${sharedList.length} pasos comunes y agrega ${propiosUnicos.length} propio(s): ${propiosUnicos.join(", ")}`
              : `"${d.unit.name}" repite los ${sharedList.length} pasos comunes sin agregar ninguno propio`,
        };
      });

      findings.push({
        variant: methodName,
        title: `${decls.length} hermanos de "${ancestor}" repiten la secuencia de "${methodName}" con pasos propios`,
        detail:
          `${unitNames.map((u) => `"${u}"`).join(", ")} declaran cada uno "${methodName}" (aridad ${decls[0]!.method.arity}) y los ${decls.length} cuerpos invocan, EN EL MISMO ORDEN, ` +
          `los ${sharedList.length} pasos comunes ${orden}; ${c.divergentes} de ellos invocan además pasos que no comparten. ` +
          `La secuencia está escrita ${decls.length} veces en vez de una sola vez en "${ancestor}"` +
          `${otros.length > 0 ? ` (los ${decls.length} comparten también: ${otros.join(", ")})` : ""}. ` +
          "Esto no afirma que falte un patrón: es la evidencia cruda de la SITUACIÓN (misma secuencia repetida con pasos que varían) — si el esqueleto ya vive en el ancestro, " +
          "si vive a medias, o si no existe, lo decide la hipótesis correspondiente, no este detector.",
        trigger: [
          { label: "pasos comunes en el mismo orden", value: sharedList.length, threshold: pasosComunes },
          { label: "hermanos que repiten la secuencia", value: decls.length, threshold: unidades },
        ],
        evidence: [
          { label: "hermanos que aportan un paso propio", value: c.divergentes, note: "sin paso propio no hay paso variable: sería duplicación pura" },
          { label: "pasos del cuerpo más corto", value: Math.min(...decls.map((d) => d.steps.length)), note: `piso ${llamadasPorCopia.value}` },
          { label: "ancestros comunes a los que se puede subir", value: c.ancestors.length, note: c.ancestors.join(", ") },
          { label: "hermandad confirmada por el grafo", value: decls.every((d) => d.unit.ancestorsFromGraph) ? 1 : 0, note: "0 = sólo por la superclase escrita en la gramática" },
        ],
        locations: locations as [RoleLocation, ...RoleLocation[]],
        severity: 25,
        advice: {
          primary: {
            name: "Form Template Method",
            kind: "refactorizacion",
            why: `Los pasos comunes (${orden}) están escritos en cada hermano en el mismo orden; el orden puede quedar una sola vez en "${ancestor}" y cada hermano quedarse sólo con lo que le varía.`,
            source: "https://refactoring.com/catalog/formTemplateMethod.html",
          },
        },
      });
    }

    return findings;
  },
};
