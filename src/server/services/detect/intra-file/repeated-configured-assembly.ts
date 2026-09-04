/**
 * OLA AE, FRENTE AE12 — EL ANCLA-FUERZA DE **Prototype**.
 *
 * ── POR QUÉ EXISTE, MEDIDO Y NO SUPUESTO ─────────────────────────────────
 * `hypotheses/prototype.ts` produce hoy, sobre las DOS poblaciones del
 * proyecto, **31 hipótesis y CERO recomendaciones**: 19 en los 13 repos y 12
 * en `corpus-app/`, las 31 `ya-aplicado`, `ausente` = 0, `parcial` = 0
 * (medido por este frente sobre los volcados del día; reproducido de forma
 * independiente por el censo del frente AE2, que además lo confirma sobre
 * 6.785 hipótesis históricas). Y no es mala suerte: es IMPOSIBLE POR
 * CONSTRUCCIÓN. `prototype.ts#appliedState` sólo devuelve `ausente` cuando
 * NINGÚN candidato tiene un miembro auto-constructor, pero los dos únicos
 * caminos que corren en producción —`findPresetSiblingProblem` (1b,
 * "self-cloning-solo") y `findSoloPrototypeCandidateFromGraph` (2)— EXIGEN
 * ese miembro para siquiera producir un candidato (`if (!hasSelfConstruct)
 * continue;` y `if (!hasEdgeKindTo(..., "instantiates", ...)) continue;`).
 * Es la misma patología estructural que el integrador de la Ola AC
 * documentó para `Decorator · homonymous-delegation` y que AD4 midió para
 * Facade: **un ancla que no puede decir `ausente` no descubre dónde FALTA el
 * patrón, sólo dónde YA ESTÁ.**
 *
 * Este detector es el camino que faltaba. **NO retira nada**: el ancla
 * `duplication` de Prototype sigue exactamente donde estaba, con su número
 * publicado y sin tocar (la Ola AE es ADITIVA).
 *
 * ── LA FUERZA QUE PROTOTYPE RESUELVE, ESCRITA COMO LA RESUELVE EL PATRÓN ──
 * *Hay que crear COPIAS CONFIGURADAS de un objeto ya armado —mismo estado
 * inicial, variaciones chicas— y la construcción entera se repite en cada
 * punto en vez de copiarse.*
 *
 * Este detector nombra esa SITUACIÓN, no un síntoma correlacionado (las tres
 * anclas que Prototype tuvo antes —`speculative-abstraction` (estructura),
 * `duplication` (síntoma), y la forma "hermanos-preset" (estructura)— dieron
 * entre las tres CERO recomendaciones en toda la historia del proyecto):
 *
 *   En un archivo, **≥ `lugaresQueRearman` unidades `function-like`
 *   DISTINTAS** arman cada una, por su cuenta, una instancia del **MISMO
 *   tipo** con el **MISMO conjunto de ranuras configuradas**; de esas
 *   ranuras, **≥ `ranurasCoincidentes` llevan el valor IDÉNTICO en todos los
 *   lugares** (el *estado inicial compartido*, que es lo que un prototipo
 *   copia) y **al menos una, en minoría, varía** (la *variación chica*, que
 *   es lo que el clon retoca).
 *
 * Las dos mitades tienen que estar: sin la parte que COINCIDE no hay nada
 * que clonar, y sin la parte que VARÍA lo que hay son duplicados exactos
 * (Extract Constant/Method, no Prototype).
 *
 * ── LAS TRES CONDICIONES DE LA RECETA, JUNTAS ────────────────────────────
 * (1) FUERZA — arriba. El ancla nombra la situación, no un síntoma.
 * (2) ESCALA — los tres pisos de `thresholds`, cada uno con su razón escrita
 *     ANTES de medir (ver ahí).
 * (3) RESOLUCIÓN VERIFICADA — tres compuertas de SILENCIO (`R1`/`R2`/`R3`,
 *     más abajo): no disparar donde el prototipo YA ESTÁ. Es la condición
 *     que AD4 midió como la que más descarta (91 % de los candidatos que
 *     pasan las otras), y la que AC3 midió que le faltaba a su ancla.
 *
 * ── POR QUÉ `intra-file` CON `needsGraph`, Y QUÉ SE PIERDE CON ESO ───────
 * La fuerza vive en el CONTENIDO de la configuración (qué valor lleva cada
 * ranura en cada sitio), y ese contenido sólo está en el ÁRBOL. Un detector
 * `inter-file` recibe `RepoUnit`, que ya liberó los árboles
 * (`detect/types.ts#RepoFunctionUnit`, "sin `node`"), así que la comparación
 * de valores es imposible a esa granularidad. Por eso `intra-file`.
 * `needsGraph: true` es RUTEO (ver `IntraGraphOptIn`), y se usa para dos
 * cosas que el archivo solo no puede contestar: qué es un TIPO (compuerta de
 * construcción, abajo) y si el protocolo de copia YA EXISTE aunque el tipo
 * esté declarado en OTRO archivo (`R1`/`R2`).
 *
 * **BRECHA DECLARADA, NO ESCONDIDA:** la repetición que este detector ve es
 * la que ocurre DENTRO de un archivo. La misma situación repartida entre
 * archivos distintos existe y este detector no la ve. No se tapa con
 * `silentIn` (que es para "la FORMA no se escribe así en ese lenguaje"): es
 * una limitación de GRANULARIDAD, y cerrarla pide árboles de varios archivos
 * a la vez, que ninguna granularidad de este analizador entrega.
 *
 * **SEGUNDA BRECHA DECLARADA:** sin grafo (`ctx.graph === null`: pasada 1,
 * `CK_ANALISIS_DOS_PASADAS=0`, o build de grafo fallido) este detector emite
 * CERO, a propósito. La condición (3) —RESOLUCIÓN VERIFICADA— no se puede
 * verificar sin el grafo, y "no pude mirar, así que apruebo" es exactamente
 * el modo de fallar que este proyecto tiene documentado. Un kind nuevo no
 * pierde nada callándose; emitir sin verificar sí perdería la condición.
 */
import type { DerivedNodeSets } from "../../code-grammar.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";
import { pisoDeclarado, presencia, presupuesto } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "lugaresQueRearman" | "ranurasCoincidentes" | "ranurasQueVarian" | "sitiosPorArchivo";

export const REPEATED_CONFIGURED_ASSEMBLY_KIND = "repeated-configured-assembly";

/** ESCALA (1) — ver el `rationale` del umbral homónimo. */
export const MIN_REBUILDING_PLACES = 3;
/** ESCALA (2) — ver el `rationale` del umbral homónimo. */
export const MIN_COINCIDENT_SLOTS = 3;
/**
 * Presupuesto de trabajo por archivo — ver el `rationale` del umbral
 * `sitiosPorArchivo`. Se exporta para que `hypotheses/prototype.ts` re-derive
 * los sitios con EXACTAMENTE el mismo presupuesto que el detector usó: dos
 * números distintos harían que la hipótesis viera un grupo distinto del que el
 * hallazgo nombra, que es la clase de defecto que la Ola AB midió acá mismo.
 */
export const ASSEMBLY_SITE_BUDGET = 4000;

/**
 * Vocabulario NATIVO del protocolo de construcción, mismo estatus que el
 * `CONSTRUCTOR_NAMES` de `code-grammar.ts` (mandatos del lenguaje/runtime, no
 * convenciones de proyecto) y que la lista que `hypotheses/prototype.ts` ya
 * usa para lo mismo: `Foo.new(...)` es la ÚNICA forma que Ruby tiene de
 * construir, y `Foo.New(...)` su equivalente exportado. No es una lista de
 * sinónimos elegidos: es cómo se deletrea la construcción en esas gramáticas.
 */
const NATIVE_CONSTRUCTION_CALL = new Set(["new", "New"]);

/** Campos de gramática que nombran el TIPO construido (Go `composite_literal`, Java/C# `object_creation_expression`, TS `new_expression`). */
const TYPE_FIELDS = ["type", "constructor"] as const;
/** Campos de gramática que llevan la lista de ranuras. */
const ARGUMENT_FIELDS = ["arguments", "initializer"] as const;
/** `body` sólo cuenta como lista de ranuras en un nodo LITERAL (Go `composite_literal`): en una declaración de función/clase `body` es el cuerpo, no una lista de argumentos. */
const LITERAL_NODE_TYPE = /literal/i;
const COMMENT_NODE_TYPE = /comment/i;
/** Campos con los que una gramática nombra la clave de una ranura con nombre. */
const SLOT_KEY_FIELDS = ["name", "key", "field", "left"] as const;
/** Campos con los que una gramática nombra el valor de una ranura con nombre. */
const SLOT_VALUE_FIELDS = ["value", "right"] as const;
/**
 * TRADUCCIÓN, NO DECISIÓN — la única gramática de las nueve que NOMBRA una
 * ranura con nombre sin exponer ni una mitad por campo: el `keyed_element` de
 * Go (`Options{Retries: 3}`) trae sus dos mitades como hijos posicionales sin
 * `key`/`value`. Sin esta traducción, un literal compuesto de Go con campos
 * nombrados viajaría como ranuras POSICIONALES, y dos sitios que escriben los
 * mismos campos en distinto ORDEN dejarían de ser el mismo armado — una
 * diferencia de formato leída como diferencia de contenido. El resto de las
 * gramáticas ya cae en `SLOT_KEY_FIELDS`/`SLOT_VALUE_FIELDS` (Ruby `pair`
 * key/value, Python `keyword_argument` name/value, C# `assignment_expression`
 * left/right, JS/TS `pair` key/value).
 */
const KEYED_PAIR_NODE_TYPE = /(^|_)keyed(_|$)/;
/** Un nombre de tipo utilizable: identificador simple, ya despojado de genéricos y de calificadores. */
const PLAIN_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !COMMENT_NODE_TYPE.test(c.type)) out.push(c);
  }
  return out;
}

function fieldOf(node: AstNode, field: string): AstNode | null {
  return node.childForFieldName(field) as AstNode | null;
}

/** Espacios colapsados — la comparación de valores es TEXTUAL y tiene que ser insensible al formato, nunca al contenido. */
function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * `List<Foo>` / `Foo[]` / `pkg.Foo` / `Ns::Foo` ⇒ `Foo`. Devuelve `null` si lo
 * que queda no es un identificador simple: un `[]Foo` (slice literal de Go) o
 * un `map[string]Foo` NO son la construcción de un objeto configurado, son el
 * contenedor — y sus elementos, que sí lo son, aparecen por su cuenta.
 */
function plainTypeName(raw: string): string | null {
  let t = raw.replace(/<[^>]*>/g, "").replace(/\[[^\]]*\]/g, "").trim();
  const segs = t.split(/::|\./);
  t = (segs[segs.length - 1] ?? "").trim();
  return PLAIN_IDENTIFIER.test(t) ? t : null;
}

/**
 * El TIPO que este nodo construye, por FORMA DE CAMPO y no por tipo de nodo
 * (mismo criterio que `code-grammar.ts` aplica en todo el archivo). Cuatro
 * vías, en orden:
 *   1. campo `type`/`constructor` — Go `composite_literal`, Java/C#
 *      `object_creation_expression`, TS `new_expression`.
 *   2. `receiver` + `method` con el deletreo nativo de construcción —
 *      Ruby `Foo.new(...)`.
 *   3. campo `function` cuyo texto termina en ese mismo deletreo —
 *      `Foo.new(...)` visto por una gramática que no separa receptor.
 *   4. campo `function` a secas — la llamada desnuda `Foo(...)`, el único
 *      idioma de construcción que Python conoce.
 * La vía 4 admitiría CUALQUIER llamada; por eso existe la COMPUERTA DE
 * CONSTRUCCIÓN de `run()`, que exige que el nombre resuelva a un símbolo
 * `class-like` real del grafo. Sin esa compuerta esto no sería un detector de
 * construcción sino de llamadas repetidas, que es otra cosa (y su mitigación
 * es Extract Function, no Prototype).
 */
function constructedTypeName(node: AstNode): string | null {
  for (const f of TYPE_FIELDS) {
    const c = fieldOf(node, f);
    if (c) return plainTypeName(c.text);
  }
  const method = fieldOf(node, "method");
  const receiver = fieldOf(node, "receiver");
  if (method && receiver && NATIVE_CONSTRUCTION_CALL.has(method.text)) return plainTypeName(receiver.text);
  const fn = fieldOf(node, "function");
  if (!fn) return null;
  const segs = fn.text.split(/::|\./);
  const last = segs[segs.length - 1] ?? "";
  if (segs.length >= 2 && NATIVE_CONSTRUCTION_CALL.has(last)) return plainTypeName(segs.slice(0, -1).join("."));
  return plainTypeName(fn.text);
}

/**
 * LOS contenedores de ranuras de este nodo — en plural, y la razón está medida
 * y no supuesta: en C# **un mismo armado se reparte en DOS contenedores**,
 * `new Foo(a, b) { X = 1, Y = 2 }` (campo `arguments` + campo `initializer`).
 * Quedarse con el primero leería la MITAD del armado y compararía armados
 * distintos como si fueran el mismo. Los dos se concatenan en orden
 * sintáctico, que es el orden en que están escritos.
 */
function slotContainers(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (const f of ARGUMENT_FIELDS) {
    const c = fieldOf(node, f);
    if (c && namedChildren(c).length > 0) out.push(c);
  }
  if (out.length === 0 && LITERAL_NODE_TYPE.test(node.type)) {
    const body = fieldOf(node, "body");
    if (body && namedChildren(body).length > 0) out.push(body);
  }
  return out;
}

export interface AssemblySlot {
  /** El nombre de la ranura, o `#i` cuando la gramática la nombra por posición. */
  readonly key: string;
  readonly value: string;
}

export interface AssemblySite {
  readonly typeName: string;
  readonly slots: readonly AssemblySlot[];
  /** Etiqueta estable del PUNTO del código donde vive este armado — ver `visit()`. */
  readonly owner: string;
  /** Camino de símbolo del dueño `function-like`, vacío si el punto no es una función. */
  readonly ownerSymbolPath: readonly string[];
  /** Nombre de la unidad `class-like` que envuelve al dueño, si hay alguna. */
  readonly ownerClass: string | null;
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * Las ranuras de un contenedor. Una ranura con NOMBRE se reconoce por forma de
 * campo (`name`/`key`/`field`/`left` + `value`/`right`): cubre el par de un
 * literal de objeto (JS/TS), el `Campo: valor` de un literal compuesto de Go,
 * el `campo = valor` de un inicializador de objeto de C#, el `clave: valor` de
 * un hash de Ruby y el `clave=valor` de un argumento con nombre de Python.
 * Lo que no expone esa forma viaja como ranura POSICIONAL (`#i`), que es
 * exactamente lo que corresponde para Java y para los argumentos posicionales
 * del resto: la posición ES el nombre de la ranura ahí.
 */
function slotsOf(containers: readonly AstNode[]): AssemblySlot[] {
  const out: AssemblySlot[] = [];
  const kids = containers.flatMap((c) => namedChildren(c));
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i]!;
    let key: string | null = null;
    let value: AstNode | null = null;
    for (const kf of SLOT_KEY_FIELDS) {
      const k = fieldOf(kid, kf);
      if (!k) continue;
      for (const vf of SLOT_VALUE_FIELDS) {
        const v = fieldOf(kid, vf);
        if (!v) continue;
        key = normalizeText(k.text);
        value = v;
        break;
      }
      if (key) break;
    }
    if (key && value) {
      out.push({ key, value: normalizeText(value.text) });
      continue;
    }
    if (KEYED_PAIR_NODE_TYPE.test(kid.type)) {
      const halves = namedChildren(kid);
      if (halves.length === 2) {
        out.push({ key: normalizeText(halves[0]!.text), value: normalizeText(halves[1]!.text) });
        continue;
      }
    }
    out.push({ key: `#${i}`, value: normalizeText(kid.text) });
  }
  return out;
}

/**
 * Recorre el archivo acumulando SITIOS DE ARMADO, cada uno atado a su PUNTO.
 *
 * QUÉ ES UN "PUNTO", Y POR QUÉ NO ES "UN SITIO": la fuerza dice *"la
 * construcción entera se repite EN CADA PUNTO"*. Un punto es la unidad
 * `function-like` que envuelve al armado; si no hay ninguna, es la
 * DECLARACIÓN DE NIVEL SUPERIOR que lo contiene. Contar puntos y no sitios es
 * lo que separa "tres funciones que rearman lo mismo" de "una tabla de datos
 * con tres filas", que es UN punto y cuya mitigación no es Prototype.
 */
export function assemblySitesOf(root: AstNode, sets: DerivedNodeSets, budget: number): AssemblySite[] {
  const sites: AssemblySite[] = [];

  const visit = (node: AstNode, owner: string, ownerSymbolPath: readonly string[], ownerClass: string | null): void => {
    if (sites.length >= budget) return;

    let nextOwner = owner;
    let nextPath = ownerSymbolPath;
    let nextClass = ownerClass;

    if (sets.classNodes.has(node.type)) {
      const name = fieldOf(node, "name")?.text ?? "(anónima)";
      nextClass = name;
      nextPath = [...ownerSymbolPath, name];
      nextOwner = nextPath.join(".");
    } else if (sets.functionNodes.has(node.type)) {
      const name = fieldOf(node, "name")?.text ?? "(anónima)";
      nextPath = [...ownerSymbolPath, name];
      nextOwner = nextPath.join(".");
    }

    const typeName = constructedTypeName(node);
    if (typeName) {
      const containers = slotContainers(node);
      if (containers.length > 0) {
        const slots = slotsOf(containers);
        if (slots.length > 0) {
          sites.push({
            typeName,
            slots,
            owner: nextOwner,
            ownerSymbolPath: nextPath,
            ownerClass: nextClass,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
          });
        }
      }
    }

    for (const c of namedChildren(node)) visit(c, nextOwner, nextPath, nextClass);
  };

  // Cada hijo directo de la raíz es un PUNTO de nivel de archivo por su cuenta:
  // dos `var` de nivel superior son dos lugares distintos donde se rearma, un
  // único `var (…)` con cinco entradas es uno solo.
  const tops = namedChildren(root);
  for (let i = 0; i < tops.length; i++) visit(tops[i]!, `@${i}`, [], null);
  return sites;
}

export interface AssemblyGroup {
  readonly typeName: string;
  readonly slotKeys: readonly string[];
  readonly sites: readonly AssemblySite[];
  /** Puntos DISTINTOS que rearman — la condición de ESCALA (1). */
  readonly places: readonly string[];
  /** Ranuras cuyo valor es IDÉNTICO en todos los sitios — el estado inicial compartido. */
  readonly coincident: readonly AssemblySlot[];
  /** Ranuras cuyo valor cambia de un sitio a otro — la variación chica. */
  readonly varyingKeys: readonly string[];
}

/**
 * Agrupa por `(tipo, conjunto de ranuras)` — la unidad "el mismo armado". Dos
 * sitios del mismo tipo con ranuras DISTINTAS no son el mismo armado y no se
 * comparan: es la misma distinción que AD4 midió entre "repiten una receta" y
 * "usan la misma biblioteca de formas distintas".
 */
export function groupAssemblies(sites: readonly AssemblySite[]): AssemblyGroup[] {
  const byKey = new Map<string, AssemblySite[]>();
  for (const s of sites) {
    const keys = [...s.slots.map((x) => x.key)].sort();
    // El separador NO puede aparecer en un nombre de tipo ni en una clave de
    // ranura (`#i` o un identificador): con un separador vacío, los conjuntos
    // {"ab","c"} y {"a","bc"} colapsarían en la misma clave y dos armados
    // DISTINTOS se compararían entre sí como si fueran el mismo.
    const id = [s.typeName, ...keys].join(" | ");
    const list = byKey.get(id) ?? [];
    list.push(s);
    byKey.set(id, list);
  }

  const out: AssemblyGroup[] = [];
  for (const [, group] of [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const first = group[0]!;
    const slotKeys = [...first.slots.map((x) => x.key)].sort();
    const coincident: AssemblySlot[] = [];
    const varyingKeys: string[] = [];
    for (const key of slotKeys) {
      const values = new Set(group.map((s) => s.slots.find((x) => x.key === key)?.value ?? ""));
      if (values.size === 1) coincident.push({ key, value: [...values][0] ?? "" });
      else varyingKeys.push(key);
    }
    out.push({
      typeName: first.typeName,
      slotKeys,
      sites: group,
      places: [...new Set(group.map((s) => s.owner))].sort(),
      coincident,
      varyingKeys,
    });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────
 * (3) RESOLUCIÓN VERIFICADA — los hechos de grafo, indexados UNA vez por
 * grafo (mismo criterio de memoización por identidad que
 * `hypotheses/prototype.ts#GRAPH_FACTS_CACHE` y `confident-edges.ts#CACHE`:
 * función pura de `graph.nodes`/`graph.edges`, y ningún `CodeGraph` ya
 * ensamblado se muta en sitio).
 *
 * SE LEEN LAS ARISTAS EN CRUDO, INCLUIDAS LAS `ambiguous`, Y LA RAZÓN ES QUE
 * ESTAS COMPUERTAS PRODUCEN SILENCIO: una arista ambigua de más sólo puede
 * hacer que este detector se CALLE donde el prototipo quizá ya está, nunca
 * que emita de más. Es la lectura conservadora, y es la contraria a la que
 * corresponde cuando una arista APOYA una afirmación.
 * ──────────────────────────────────────────────────────────────────────── */
export interface AssemblyGraphFacts {
  /** Nodos `class-like` por ÚLTIMO segmento de `symbolPath`. */
  readonly classNodesByName: ReadonlyMap<string, readonly CodeGraphNode[]>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  readonly edgesTo: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
}

const ASSEMBLY_FACTS_CACHE = new WeakMap<CodeGraph, AssemblyGraphFacts>();

export function assemblyGraphFacts(graph: CodeGraph): AssemblyGraphFacts {
  const cached = ASSEMBLY_FACTS_CACHE.get(graph);
  if (cached) return cached;

  const classNodesByName = new Map<string, CodeGraphNode[]>();
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) {
    if (!nodeById.has(n.id)) nodeById.set(n.id, n);
    if (n.kind !== "symbol" || n.family !== "class-like") continue;
    const name = n.symbolPath[n.symbolPath.length - 1];
    if (!name) continue;
    const list = classNodesByName.get(name) ?? [];
    list.push(n);
    classNodesByName.set(name, list);
  }

  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  const edgesTo = new Map<string, CodeGraphEdge[]>();
  for (const e of graph.edges) {
    const from = edgesFrom.get(e.from) ?? [];
    from.push(e);
    edgesFrom.set(e.from, from);
    const to = edgesTo.get(e.to) ?? [];
    to.push(e);
    edgesTo.set(e.to, to);
  }

  const facts: AssemblyGraphFacts = { classNodesByName, edgesFrom, edgesTo, nodeById };
  ASSEMBLY_FACTS_CACHE.set(graph, facts);
  return facts;
}

/**
 * `R1` — EL PROTOCOLO DE COPIA YA EXISTE: alguno de los nodos `class-like`
 * que llevan este nombre declara (`contains`) un miembro `function-like` que
 * construye (`instantiates`) esa misma clase. Con un `clone` puesto, "acá
 * falta un Prototype" es FALSO: lo que hay es gente que lo elude, y la
 * mitigación correcta es "usá el que ya hay", que es OTRA refactorización
 * — mismo criterio con el que AD4 silenció su condición (5b).
 */
export function copyProtocolExists(facts: AssemblyGraphFacts, typeName: string): boolean {
  for (const cls of facts.classNodesByName.get(typeName) ?? []) {
    for (const e of facts.edgesFrom.get(cls.id) ?? []) {
      if (e.kind !== "contains") continue;
      const member = facts.nodeById.get(e.to);
      if (member?.kind !== "symbol" || member.family !== "function-like") continue;
      if ((facts.edgesFrom.get(member.id) ?? []).some((x) => x.kind === "instantiates" && x.to === cls.id)) return true;
    }
  }
  return false;
}

/**
 * `R2` — YA HAY UNA PUERTA DE ARMADO COMPARTIDA: existe un símbolo
 * `function-like` `S`, ajeno a los dueños de los sitios, que construye el tipo
 * y al que llegan por `calls` **≥2** de esos dueños. Lo que se repite entonces
 * es como mucho la llamada, no la construcción, y el prototipo no es lo que
 * falta.
 *
 * Devuelve cuántos dueños distintos llegan a la MEJOR puerta encontrada: 0 =
 * no hay ninguna, 1 = hay MEDIA puerta (la hipótesis lo lee como `parcial`),
 * ≥2 = compuerta cerrada, el detector se calla.
 */
export function sharedAssemblyDoorReach(facts: AssemblyGraphFacts, typeName: string, ownerIds: readonly string[]): number {
  const owners = new Set(ownerIds);
  const doors = new Set<string>();
  for (const cls of facts.classNodesByName.get(typeName) ?? []) {
    for (const e of facts.edgesTo.get(cls.id) ?? []) {
      if (e.kind !== "instantiates") continue;
      if (owners.has(e.from)) continue; // uno de los sitios: no es una puerta, es el problema
      doors.add(e.from);
    }
  }
  let best = 0;
  for (const door of doors) {
    let reach = 0;
    for (const owner of owners) {
      if ((facts.edgesFrom.get(owner) ?? []).some((e) => e.kind === "calls" && e.to === door)) reach++;
    }
    if (reach > best) best = reach;
  }
  return best;
}

/**
 * `R3` — ALGUNO DE LOS SITIOS VIVE DENTRO DEL PROPIO TIPO: ese sitio ES la
 * auto-construcción, o sea el prototipo (al menos en parte) YA está escrito
 * ahí. Se contesta con el ÁRBOL del archivo, sin grafo: la clase que envuelve
 * al dueño se llama igual que el tipo construido.
 */
export function assembledInsideOwnType(group: AssemblyGroup): boolean {
  return group.sites.some((s) => s.ownerClass === group.typeName);
}

export function symbolNodeIdOf(file: string, symbolPath: readonly string[]): string {
  return `sym:${file}#${symbolPath.join(".")}`;
}

/**
 * Cuántos símbolos DISTINTOS del repo entero construyen este tipo
 * (`instantiates`, aristas crudas). No decide nada en el detector: lo consume
 * un DISCRIMINADOR de la hipótesis, que es donde el número mueve la lectura
 * (cuantos más sitios construyen el tipo, más gente se beneficia de copiar un
 * objeto ya armado en vez de rearmarlo).
 */
export function constructionSiteCount(facts: AssemblyGraphFacts, typeName: string): number {
  const sources = new Set<string>();
  for (const cls of facts.classNodesByName.get(typeName) ?? []) {
    for (const e of facts.edgesTo.get(cls.id) ?? []) {
      if (e.kind === "instantiates") sources.add(e.from);
    }
  }
  return sources.size;
}

export const detector: IntraFileDetector<ThresholdKey, "repeated-configured-assembly"> = {
  id: "repeated-configured-assembly",
  kind: "repeated-configured-assembly",
  scope: "intra-file",
  // RUTEO, no compuerta (ver `IntraGraphOptIn`): pide correr en la pasada
  // donde el grafo existe. Sin grafo emite CERO a propósito — ver el
  // docstring del módulo, "SEGUNDA BRECHA DECLARADA".
  needsGraph: true,
  title: "El mismo armado configurado, reescrito en cada punto",
  // SIN `needs: ["unidad-tipo-clase"]`, misma razón exacta que
  // `optional-behavior-flags.ts`/`temporary-field.ts` documentan: la capacidad
  // no se deriva en todos los lenguajes que SÍ tienen la forma, y declararla
  // dejaría a alguno en silencio por una razón falsa. La compuerta real de
  // "esto es un tipo" es el grafo (`classNodesByName`), que es un hecho
  // medido de este repo y no una declaración por lenguaje.
  needs: [],
  thresholds: {
    lugaresQueRearman: pisoDeclarado(MIN_REBUILDING_PLACES, {
      rationale:
        "cuántos PUNTOS distintos tienen que rearmar el mismo objeto para que un prototipo clonable pague. Con DOS la mitigación más barata es extraer una función de construcción compartida y llamarla desde los dos sitios: la fuerza está pero el patrón no paga. Es literalmente la condición de ESCALA que la Ola AC midió como la que le faltaba a su ancla de State (7 maquinas de estados reales, 6 demasiado chicas), y el mismo piso, por la misma razon, que AD4 escribio para sus lugares. Y se cuentan PUNTOS (unidad function-like que envuelve, o declaracion de nivel superior) y no SITIOS: eso es lo que separa 'la construccion se repite en cada punto' de 'una tabla de datos con N filas', que es UN punto y cuya mitigacion no es Prototype.",
    }),
    ranurasCoincidentes: pisoDeclarado(MIN_COINCIDENT_SLOTS, {
      rationale:
        "cuantas ranuras tienen que llevar el MISMO valor en todos los puntos para que copiar pague mas que volver a escribir. Lo que un Prototype ahorra es exactamente volver a escribir la parte que coincide — el 'mismo estado inicial'. Con UNA o DOS ranuras coincidentes el ahorro son uno o dos literales, y una constante compartida es mas barata que un prototipo clonable MAS su decision de copia profunda vs. superficial, que es el costo que este mismo patron declara. TRES es el minimo en que lo que coincide es un ESTADO y no un VALOR.",
    }),
    ranurasQueVarian: presencia({
      rationale:
        "la mitad que VARIA tiene que existir y tiene que ser minoria. Si no varia NADA, los sitios son duplicados exactos y la mitigacion es Extract Constant/Method, no Prototype: el patron existe para copias CONFIGURADAS, o sea para variaciones. Si varia la MAYORIA, no hay 'mismo estado inicial' que copiar y lo que hay es un constructor con argumentos. No hay magnitud que calibrar — la pregunta es binaria en sus dos extremos ('¿varia algo?' y '¿varia la minoria?') y su respuesta minima es 1.",
    }),
    sitiosPorArchivo: presupuesto(ASSEMBLY_SITE_BUDGET, {
      rationale:
        "tope de TRABAJO, no de deteccion: cuantos sitios de armado se acumulan por archivo antes de dejar de recorrer. Un archivo generado o una tabla de datos gigante podria producir decenas de miles de literales y el agrupado es cuadratico en ranuras. Quedarse corto solo puede hacer que un grupo NO se encuentre — nunca inventa uno.",
    }),
  },
  maxFindings: presupuesto(200, {
    rationale:
      "tope de volumen por repo, del mismo orden que el resto del catalogo. Esta para que un repo atipico no publique miles de tarjetas del mismo kind; no recorta el caso tipico.",
  }),
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = ctx.graph ?? null;
    // Sin grafo no se puede verificar la RESOLUCIÓN, y sin verificarla este
    // detector no cumple la receta. Se calla — ver el docstring del módulo.
    if (!graph) return [];
    const facts = assemblyGraphFacts(graph);

    const minPlaces = ctx.threshold("lugaresQueRearman");
    const minCoincident = ctx.threshold("ranurasCoincidentes");
    const minVarying = ctx.threshold("ranurasQueVarian");
    const budget = ctx.threshold("sitiosPorArchivo");

    const sites = assemblySitesOf(file.root, file.sets, budget.value);
    const findings: RawFinding[] = [];

    for (const group of groupAssemblies(sites)) {
      // COMPUERTA DE CONSTRUCCIÓN — lo que se arma tiene que ser un TIPO, no
      // cualquier llamada con argumentos. Hecho del grafo de ESTE repo.
      if (!facts.classNodesByName.has(group.typeName)) continue;

      // (2) ESCALA
      if (group.places.length < minPlaces.value) continue;
      if (group.coincident.length < minCoincident.value) continue;
      if (group.varyingKeys.length < minVarying.value) continue;
      if (group.varyingKeys.length * 2 > group.slotKeys.length) continue;

      // (3) RESOLUCIÓN VERIFICADA
      if (assembledInsideOwnType(group)) continue; // R3
      if (copyProtocolExists(facts, group.typeName)) continue; // R1
      const ownerIds = group.sites
        .filter((s) => s.ownerSymbolPath.length > 0)
        .map((s) => symbolNodeIdOf(file.path, s.ownerSymbolPath));
      const doorReach = sharedAssemblyDoorReach(facts, group.typeName, [...new Set(ownerIds)]);
      if (doorReach >= 2) continue; // R2

      const shared = group.coincident.map((c) => `${c.key}=${c.value}`);
      const locations: RoleLocation[] = group.sites.map((s, i) => ({
        file: file.path,
        startLine: s.startLine,
        endLine: s.endLine,
        symbol: s.ownerSymbolPath.length > 0 ? s.ownerSymbolPath.join(".") : group.typeName,
        anchor: { file: file.path, symbolPath: s.ownerSymbolPath.length > 0 ? s.ownerSymbolPath : [group.typeName], ordinal: i },
        role:
          i === 0
            ? `punto que arma "${group.typeName}" entero — candidato a ser el PROTOTIPO del que los demás se copian`
            : `punto que vuelve a armar "${group.typeName}" entero, repitiendo las ${group.coincident.length} ranuras que ya coincidían`,
      }));

      findings.push({
        variant: `${group.typeName}:${group.slotKeys.length}`,
        title: `${group.places.length} puntos rearman "${group.typeName}" con el mismo estado inicial`,
        detail:
          `${group.places.length} puntos distintos de este archivo (${group.places.join(", ")}) construyen cada uno una instancia de "${group.typeName}" ` +
          `fijando las mismas ${group.slotKeys.length} ranuras. De esas, ${group.coincident.length} llevan EXACTAMENTE el mismo valor en todos los puntos ` +
          `(${shared.join(", ")}) y sólo ${group.varyingKeys.length} cambia(n) (${group.varyingKeys.join(", ")}). ` +
          `O sea: el estado inicial es el mismo y las variaciones son la minoría, pero la construcción entera se vuelve a escribir en cada punto en vez de copiarse. ` +
          "Esto no afirma que falte un patrón: es la evidencia cruda de la SITUACIÓN — si conviene un objeto ya armado del que copiar, si alcanza con una constante compartida, o si el tipo ya tiene un protocolo de copia en otra parte, lo decide la hipótesis correspondiente, no este detector.",
        trigger: [
          { label: "puntos distintos que rearman el mismo objeto", value: group.places.length, threshold: minPlaces },
          { label: "ranuras con el valor idéntico en todos los puntos", value: group.coincident.length, threshold: minCoincident },
          { label: "ranuras que varían entre puntos", value: group.varyingKeys.length, threshold: minVarying },
        ],
        evidence: [
          { label: "ranuras configuradas en cada armado", value: group.slotKeys.length, note: group.slotKeys.join(", ") },
          { label: "sitios de armado (puede haber más de uno por punto)", value: group.sites.length },
          {
            label: "puntos que ya llegan a una puerta de armado compartida",
            value: doorReach,
            note: "condición de RESOLUCIÓN VERIFICADA: con dos o más, este hallazgo no existiría — la puerta ya está y la mitigación sería usarla",
          },
        ],
        locations: locations as [RoleLocation, ...RoleLocation[]],
        severity: Math.min(100, 25 + group.places.length * 4 + group.coincident.length * 3),
        advice: {
          primary: {
            name: "Extract Variable",
            kind: "refactorizacion",
            why:
              `Las ${group.coincident.length} ranuras que coinciden (${shared.join(", ")}) están escritas completas en ${group.places.length} puntos. ` +
              "Un único objeto ya armado, del que cada punto saque su copia y retoque lo poco que cambia, deja una sola definición del estado inicial.",
            source: "https://refactoring.com/catalog/extractVariable.html",
          },
        },
      });
    }

    return findings;
  },
};
