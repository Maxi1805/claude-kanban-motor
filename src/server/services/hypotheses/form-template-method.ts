/**
 * Form Template Method — Ola AU, frente AU5.
 *
 * **NO ES el patrón Template Method** (uno de los 19 CONGELADOS, que no se
 * toca, no se revisa y no se mide en esta ola). Es la REFACTORIZACIÓN
 * mecánica de Fowler que lleva a él, y su precondición es DISTINTA y
 * verificable abriendo el archivo: *la MISMA SECUENCIA de llamadas escrita en
 * >=2 hermanos, con pasos propios que ya son miembros de cada hermano*.
 *
 * EL HUECO QUE TAPA. Tres detectores de jerarquía —`homonymous-divergent-
 * sequence`, `parallel-hierarchies` y `refused-bequest`— disparan y el nivel 2
 * no tiene NINGUNA refactorización registrada que los tome como ancla; el
 * único que cuelga de ellos es `Template Method` (patrón, congelado).
 * `homonymous-divergent-sequence.ts` ya escribe *"Form Template Method"* en su
 * `advice.primary` desde la Ola AC: el consejo barato de nivel 1 existe y la
 * hipótesis nunca se construyó.
 *
 * ── LA DIFERENCIA CON EL PATRÓN, QUE ES LA RAZÓN DE SER DE ESTE ARCHIVO ───
 * El PATRÓN opina sobre el diseño: *"acá convendría una plantilla con
 * ganchos"*. Eso es una intención, dos jueces no coinciden, y por eso los 19
 * patrones miden 17,9 %. La REFACTORIZACIÓN afirma un hecho contable:
 *
 *   (1) >=2 unidades-tipo de los archivos que el hallazgo nombra declaran el
 *       mismo ancestro;
 *   (2) >=2 de ellas declaran un miembro del mismo nombre y la misma aridad;
 *   (3) los cuerpos invocan >=2 pasos comunes EN EL MISMO ORDEN;
 *   (4) >=2 de ellas invocan además al menos un paso que no invocan todas;
 *   (5) **ese paso propio es un miembro que ESA MISMA unidad declara** — o
 *       sea que ya existe el gancho que la plantilla haría abstracto;
 *   (6) el ancestro es VISIBLE en alguno de esos archivos y **no declara ya**
 *       ese miembro.
 *
 * Las seis se cuentan abriendo el archivo. La (5) es la que separa esta
 * familia del ancla: *"los dos hermanos llaman a las mismas tres funciones"*
 * es una forma; *"y lo que varía entre ellos ya es un método propio de cada
 * uno"* es lo que hace que subir el esqueleto sea MECÁNICO y no un rediseño.
 * Sin ella, subir la secuencia obligaría a mover también los pasos propios, y
 * eso ya no es Form Template Method.
 *
 * ── TRAMPA #3: EL REMEDIO PUEDE YA ESTAR APLICADO ─────────────────────────
 * *De 21 casos en disputa de la Ola AP, en SIETE la solución YA EXISTÍA en el
 * código.* Acá la solución vive **en el ancestro**, no en el alcance del
 * ancla: la condición (6) mira si la unidad-tipo llamada como el ancestro,
 * cuando está en este mismo archivo, ya declara el homónimo. Si lo declara,
 * la plantilla ya está escrita y esta familia CALLA — un `required` que
 * devuelve `false`, no una propuesta con menos confianza y no un estado
 * confirmado.
 *
 * LA COMPUERTA MÁS CARA DE ESTA FAMILIA, Y POR QUÉ ES ASÍ: la búsqueda cubre
 * los archivos que el hallazgo NOMBRA (`ctx.fileAt` sobre cada `location`, que
 * `code-analyzer.ts#resolveLiveFileUnit` repuebla bajo demanda), y **si el
 * ancestro no aparece ahí, la familia CALLA**. La primera versión aprobaba
 * igual, diciendo "no se pudo verificar" — y eso es EXACTAMENTE el defecto que
 * `no-permissive-required.test.ts` existe para atajar (`strategy.ts
 * #distinctBehaviorCheck` sobre `XmlNodeConverter.cs`): un `required` que
 * aprueba porque no pudo mirar no es un `required`. La compuerta se pone
 * porque sin ver el ancestro no se puede saber ni si la plantilla ya está
 * puesta ni si el ancestro es editable — las dos preguntas que deciden si esta
 * refactorización existe. **Los dos brazos se miden** (la lección de
 * `Remove Dead Code`: 0/27 con compuerta contra 1/30 sin ella) y el número va
 * en el informe.
 *
 * ── TRAMPA #2: NO SE LE PUEDE BORRAR LA PROPUESTA A `Template Method` ─────
 * `engine.ts#arbitrateRivalHypotheses:333-347` retira una oportunidad cuando
 * otro patrón sobre el MISMO `Finding` está en `ya-aplicado`/`aplicado-
 * eludido` y sus `places` solapan. Los tres anclas de esta familia son
 * anclas de `template-method.ts` (CONGELADO). **`appliedState` devuelve
 * SIEMPRE `"ausente"`**, así que esta hipótesis no puede entrar nunca en
 * `overlappingRivals` y no puede retirarle nada a nadie. Test propio y
 * `miaConfirmada` de la corrida lo congelan en 0.
 *
 * ── POR QUÉ TRES ANCLAS Y QUÉ APORTA CADA UNA ─────────────────────────────
 * Las tres son "hay un problema de jerarquía en este archivo" y **ninguna
 * decide sola**: la familia RE-DERIVA la forma del árbol y usa el ancla sólo
 * como localizador (`el-ancla-toca-la-familia`). Eso permite colgar de
 * `parallel-hierarchies` (que por definición NO tiene ancestro común entre
 * las dos familias, pero SÍ lo tiene DENTRO de cada una) y de
 * `refused-bequest` sin escribir tres caminos distintos.
 *
 * ── LENGUAJES ─────────────────────────────────────────────────────────────
 * `needs: []`. Ni una constante nombra un lenguaje: la herencia se lee por las
 * ranuras genéricas (`superclass`/`superclasses`/`bases`/`interfaces`/
 * `base_list`/`heritage`), los miembros por `sets.functionNodes`/
 * `sets.classNodes` de `ctx.setsFor(...)`, y las llamadas por
 * `CALL_NODE_WORD` + los campos `function`/`name`/`method`. Misma lectura que
 * `detect/intra-file/homonymous-divergent-sequence.ts`, que la sondeó contra
 * los `.wasm` reales.
 *
 * DUPLICACIÓN DECLARADA: `baseNamesFrom`, `extractBaseNames`, `calleeName`,
 * `callSequence` y `declaredMethods` son la misma copia adaptada de
 * `detect/intra-file/homonymous-divergent-sequence.ts` — `hypotheses/*` no
 * puede importar los helpers privados de un detector y no existe un módulo de
 * primitivas compartido entre las dos capas. Se copia y se dice.
 */
import { CONSTRUCTOR_NAMES } from "../code-grammar.js";
import type { AstNode, FileUnit, Finding, RoleLocation } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/* ── umbrales de FORMA ───────────────────────────────────────────────────── */

/** Con una sola declaración no hay nada repetido que subir. */
const MIN_HERMANOS = 2;
/** Un solo paso común no es una SECUENCIA: no tiene orden que comparar. */
const MIN_PASOS_COMUNES = 2;
/** Mismo piso que `homonymous-divergent-sequence.ts#llamadasPorCopia`. */
const MIN_PASOS_POR_COPIA = 3;
/** >=2 hermanos con el gancho ya escrito: subir el esqueleto es mecánico. */
const MIN_CON_GANCHO = 2;
/** El esqueleto paga de sobra. */
const MUCHOS_PASOS_COMUNES = 4;
const MUCHOS_HERMANOS = 3;

/* ── vocabulario de GRAMÁTICA ────────────────────────────────────────────── */

const COMMENT_NODE_TYPE = /comment/i;
const CALL_NODE_WORD = /(^|_)(call|invocation)(_|$)/;
const CALLEE_FIELDS = ["function", "name", "method"];
const RETURN_TYPE_FIELDS = ["type", "return_type"];
const PARAM_LIST_FIELDS = ["parameters", "parameter_list"];
const BASE_FIELDS = ["superclass", "superclasses", "bases", "interfaces", "base_list"];
/** Referencia al ancestro y a sí mismo, y la construcción: no son PASOS. */
const NON_STEP_KEYWORDS: ReadonlySet<string> = new Set(["super", "base", "this", "self", "new"]);

type Graph = CodeGraph | null;

/* ── lectura del árbol ───────────────────────────────────────────────────── */

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !COMMENT_NODE_TYPE.test(c.type)) out.push(c);
  }
  return out;
}

function walkTree(node: AstNode, visit: (n: AstNode) => void): void {
  visit(node);
  for (const c of namedChildren(node)) walkTree(c, visit);
}

/** Un nombre de base a partir de un texto de herencia — misma lectura de forma
 *  que `homonymous-divergent-sequence.ts#firstBaseName`, extendida a TODOS los
 *  elementos de profundidad cero (no sólo el primero) para que
 *  `class A : Base, IFoo` y `class A extends B implements C` aporten los dos. */
function baseNamesFrom(raw: string): string[] {
  const text = raw
    .trim()
    .replace(/^[<:]\s*/, "")
    .replace(/^(extends|implements)\s+/, "")
    .replace(/^\((.*)\)$/s, "$1");
  const partes: string[] = [];
  let depth = 0;
  let inicio = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "[" || c === "<" || c === "(") depth++;
    else if (c === "]" || c === ">" || c === ")") depth--;
    else if (c === "," && depth === 0) {
      partes.push(text.slice(inicio, i));
      inicio = i + 1;
    }
  }
  partes.push(text.slice(inicio));
  const out: string[] = [];
  for (const parte of partes) {
    const bare = parte.split(/[[<(]/)[0] ?? "";
    const segments = bare.split(/[.:]+/).filter((s) => s.trim().length > 0);
    const name = segments[segments.length - 1]?.trim();
    if (name && /^[A-Za-z_$][\w$]*$/.test(name)) out.push(name);
  }
  return out;
}

/** Los ancestros que `classNode` declara — ranuras genéricas + `heritage`. */
function extractBaseNames(classNode: AstNode): Set<string> {
  const out = new Set<string>();
  for (const field of BASE_FIELDS) {
    const text = (classNode.childForFieldName(field) as AstNode | null)?.text;
    if (text) for (const n of baseNamesFrom(text)) out.add(n);
  }
  for (let i = 0; i < classNode.childCount; i++) {
    const child = classNode.child(i) as AstNode | null;
    if (!child) continue;
    if (/heritage|base_list|superclass|extends|implements/i.test(child.type)) {
      for (const n of baseNamesFrom(child.text)) out.add(n);
    }
  }
  return out;
}

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

/**
 * EL RECEPTOR DE UNA LLAMADA, como texto. `""` = llamada DESNUDA (sin
 * receptor). `null` = no se pudo leer el callee.
 *
 * Existe por un falso MEDIDO, y es el mismo defecto que
 * `replace-temp-field-with-parameter.ts` documenta en el otro sentido: sin
 * mirar el receptor, `iterator.remove()` cuenta como una llamada al miembro
 * propio `remove()` —la clase, que es un `Set`, declara uno— y ese paso pasa
 * por "el gancho ya escrito". Medido en
 * `guava · collect/StandardTable.java:750` (`ColumnKeySet.retainAll`), donde
 * los dos supuestos ganchos eran `iterator.remove()` y `c.contains(...)`:
 * dos llamadas sobre objetos AJENOS.
 *
 * Lectura de FORMA, válida en las nueve gramáticas: si el texto del callee
 * trae un separador de miembro, lo de antes del último separador es el
 * receptor; si no lo trae, la llamada es desnuda.
 */
const RECEIVER_FIELDS = ["object", "receiver", "operand"];

function calleeOwnerText(callNode: AstNode): string | null {
  // JAVA PRIMERO, y no es un detalle: `method_invocation` expone `object` y
  // `name` EN EL PROPIO NODO DE LLAMADA, no un `function` que sea un acceso a
  // miembro (el mismo defecto que AT4 midió en `calleeParts`). Sin esta rama,
  // `iterator.remove()` se lee como la llamada DESNUDA `remove()` y Java entero
  // afirma de más. Ruby expone `receiver` por la misma vía.
  for (const field of RECEIVER_FIELDS) {
    const r = callNode.childForFieldName(field) as AstNode | null;
    if (r) return r.text.trim();
  }
  for (const field of CALLEE_FIELDS) {
    const callee = callNode.childForFieldName(field) as AstNode | null;
    if (!callee) continue;
    const partes = callee.text.trim().split(/\?\.|->|::|\./);
    return partes.length <= 1 ? "" : partes.slice(0, -1).join(".").trim();
  }
  return null;
}

/** `this`/`self` — el par que las nueve gramáticas comparten, el mismo de
 *  `detect/intra-file/temporary-field.ts#SELF_WORDS`. */
const SELF_WORDS: ReadonlySet<string> = new Set(["this", "self"]);

interface Paso {
  readonly name: string;
  /** La llamada es sobre el propio objeto (o desnuda): puede ser un gancho. */
  readonly propio: boolean;
}

/** Los pasos invocados desde el cuerpo, EN ORDEN, sin deduplicar y CON receptor. */
function callSequence(member: AstNode): Paso[] {
  const body = (member.childForFieldName("body") as AstNode | null) ?? member;
  const out: Paso[] = [];
  const visit = (node: AstNode): void => {
    if (CALL_NODE_WORD.test(node.type)) {
      const name = calleeName(node);
      const owner = calleeOwnerText(node);
      if (name) out.push({ name, propio: owner !== null && (owner === "" || SELF_WORDS.has(owner)) });
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

interface Metodo {
  readonly name: string;
  readonly arity: number;
  readonly returnType: string | undefined;
  readonly sequence: readonly Paso[];
  readonly startLine: number;
  readonly endLine: number;
}

function declaredMethods(classNode: AstNode, sets: FileUnit["sets"]): Metodo[] {
  const body = classNode.childForFieldName("body") as AstNode | null;
  if (!body) return [];
  const className = (classNode.childForFieldName("name") as AstNode | null)?.text ?? "";
  const out: Metodo[] = [];
  for (const member of namedChildren(body)) {
    const paramList = (PARAM_LIST_FIELDS.map((f) => member.childForFieldName(f) as AstNode | null).find((n) => n !== null) ?? null) as AstNode | null;
    const declaresSignature = sets.functionNodes.has(member.type) || (paramList !== null && member.childForFieldName("name") !== null);
    if (!declaresSignature) continue;
    if (sets.constructorNodes.has(member.type)) continue;
    const name = (member.childForFieldName("name") as AstNode | null)?.text;
    if (!name || name === className || CONSTRUCTOR_NAMES.has(name)) continue;
    if (member.childForFieldName("body") === null) continue;
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

interface Unidad {
  readonly file: string;
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly methods: readonly Metodo[];
  readonly memberNames: ReadonlySet<string>;
  readonly bases: ReadonlySet<string>;
}

/** Las unidades-tipo de este archivo, incluidas las que NO declaran base
 *  (hacen falta para la condición (6): el ancestro puede estar acá). */
function unidadesDe(file: FileUnit, sets: FileUnit["sets"]): Unidad[] {
  const out: Unidad[] = [];
  walkTree(file.root, (node) => {
    if (!sets.classNodes.has(node.type)) return;
    const name = (node.childForFieldName("name") as AstNode | null)?.text;
    if (!name) return;
    const methods = declaredMethods(node, sets);
    out.push({
      file: file.path,
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      methods,
      memberNames: new Set(methods.map((m) => m.name)),
      bases: extractBaseNames(node),
    });
  });
  return out;
}

/** La subsecuencia de `sequence` restringida a `shared`, sin repetir. */
function ordenComun(sequence: readonly string[], shared: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of sequence) {
    if (!shared.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Los archivos donde buscar la familia: el del hallazgo primero, y después
 * los de sus otras ubicaciones (`ctx.fileAt`, que `code-analyzer.ts
 * #resolveLiveFileUnit` repuebla bajo demanda para todo archivo que la
 * evidencia de un hallazgo `inter-file` toca). Sin esto la familia quedaría
 * muda en Java/C#/Ruby, donde una clase por archivo es la norma y los
 * hermanos NUNCA comparten archivo — la misma brecha que
 * `homonymous-divergent-sequence.ts` declara y no cierra.
 * Tope de archivos: un hallazgo `parallel-hierarchies` puede nombrar decenas.
 */
const MAX_ARCHIVOS = 12;

function archivosDe(problem: Finding, ctx: HypothesisContext): { file: FileUnit; sets: FileUnit["sets"] }[] {
  const vistos = new Set<string>();
  const out: { file: FileUnit; sets: FileUnit["sets"] }[] = [];
  const agregar = (f: FileUnit | null): void => {
    if (!f || vistos.has(f.path) || out.length >= MAX_ARCHIVOS) return;
    vistos.add(f.path);
    out.push({ file: f, sets: ctx.setsFor(f.language) });
  };
  agregar(ctx.file);
  for (const loc of problem.locations) agregar(ctx.fileAt(loc.file));
  return out;
}

/* ── la forma ────────────────────────────────────────────────────────────── */

interface Declaracion {
  readonly file: string;
  readonly unidad: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly propios: readonly string[];
  /** Pasos propios que ESA unidad declara como miembro: el gancho ya escrito. */
  readonly ganchos: readonly string[];
}

interface Forma {
  readonly ancestor: string;
  readonly methodName: string;
  readonly arity: number;
  readonly comunes: readonly string[];
  readonly decls: readonly Declaracion[];
  readonly conGancho: number;
  readonly ancestroEnElArchivo: boolean;
  readonly ancestroYaLoDeclara: boolean;
  /** El ancestro declara al menos un miembro: una interfaz MARCADORA no es una familia de comportamiento. */
  readonly ancestroConMiembros: boolean;
  readonly tocaElAncla: boolean;
}

function formaDe(archivos: readonly { file: FileUnit; sets: FileUnit["sets"] }[], problem: Finding): Forma | null {
  const unidades = archivos.flatMap((a) => unidadesDe(a.file, a.sets));
  if (unidades.length < MIN_HERMANOS) return null;
  const porNombre = new Map(unidades.map((u) => [u.name, u] as const));
  const rutas = new Set(archivos.map((a) => a.file.path));
  const lineasAncla = problem.locations.filter((l) => rutas.has(l.file)).map((l) => ({ f: l.file, a: l.startLine, b: l.endLine }));

  const porAncestro = new Map<string, Unidad[]>();
  for (const u of unidades) {
    for (const base of u.bases) {
      if (base === u.name) continue;
      const list = porAncestro.get(base) ?? [];
      list.push(u);
      porAncestro.set(base, list);
    }
  }

  let mejor: Forma | null = null;
  let mejorPuntaje = -1;

  for (const [ancestor, hermanos] of [...porAncestro.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (hermanos.length < MIN_HERMANOS) continue;

    const porMetodo = new Map<string, { u: Unidad; m: Metodo }[]>();
    for (const u of hermanos) {
      for (const m of u.methods) {
        const list = porMetodo.get(m.name) ?? [];
        if (!list.some((d) => d.u.name === u.name)) list.push({ u, m });
        porMetodo.set(m.name, list);
      }
    }

    for (const [methodName, crudas] of [...porMetodo.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (crudas.length < MIN_HERMANOS) continue;
      if (new Set(crudas.map((d) => d.m.arity)).size > 1) continue;
      const retornos = new Set(crudas.map((d) => d.m.returnType).filter((t): t is string => t !== undefined));
      if (retornos.size > 1) continue;

      const utiles = (m: Metodo): Paso[] => m.sequence.filter((s2) => s2.name !== m.name && !NON_STEP_KEYWORDS.has(s2.name));
      const pasosDe = (m: Metodo): string[] => utiles(m).map((s2) => s2.name);
      /** Los nombres invocados SOBRE SÍ MISMO: los únicos que pueden ser gancho. */
      const propiosDe = (m: Metodo): Set<string> => new Set(utiles(m).filter((s2) => s2.propio).map((s2) => s2.name));
      const conPasos = crudas.map((d) => ({ ...d, steps: pasosDe(d.m) })).filter((d) => d.steps.length >= MIN_PASOS_POR_COPIA);
      if (conPasos.length < MIN_HERMANOS) continue;

      const conjuntos = conPasos.map((d) => new Set(d.steps));
      const shared = new Set<string>([...conjuntos[0]!].filter((n) => conjuntos.every((s) => s.has(n))));
      if (shared.size < MIN_PASOS_COMUNES) continue;

      const ordenes = conPasos.map((d) => ordenComun(d.steps, shared).join("|"));
      if (new Set(ordenes).size !== 1) continue;

      const decls: Declaracion[] = conPasos.map((d) => {
        const propios = [...new Set(d.steps.filter((n) => !shared.has(n)))];
        // EL GANCHO exige DOS cosas: que el paso propio sea un miembro que ESA
        // unidad declara Y que se invoque SOBRE SÍ MISMA. Sin la segunda,
        // `iterator.remove()` pasa por gancho de un `Set` que declara `remove`
        // (`guava · collect/StandardTable.java:750`, falso medido).
        const sobreSiMismo = propiosDe(d.m);
        return {
          file: d.u.file,
          unidad: d.u.name,
          startLine: d.m.startLine,
          endLine: d.m.endLine,
          propios,
          ganchos: propios.filter((p) => d.u.memberNames.has(p) && sobreSiMismo.has(p)),
        };
      });
      const divergentes = decls.filter((d) => d.propios.length > 0);
      if (divergentes.length < MIN_HERMANOS) continue;

      const ancestroUnidad = porNombre.get(ancestor) ?? null;
      const forma: Forma = {
        ancestor,
        methodName,
        arity: conPasos[0]!.m.arity,
        comunes: ordenComun(conPasos[0]!.steps, shared),
        decls,
        conGancho: decls.filter((d) => d.ganchos.length > 0).length,
        ancestroEnElArchivo: ancestroUnidad !== null,
        ancestroYaLoDeclara: ancestroUnidad !== null && ancestroUnidad.memberNames.has(methodName),
        ancestroConMiembros: ancestroUnidad !== null && ancestroUnidad.memberNames.size > 0,
        tocaElAncla: lineasAncla.some((r) => decls.some((d) => d.file === r.f && d.startLine <= r.b && r.a <= d.endLine)),
      };
      const puntaje = (forma.tocaElAncla ? 10000 : 0) + forma.conGancho * 100 + forma.comunes.length * 10 + forma.decls.length;
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = forma;
      }
    }
  }
  return mejor;
}

/* ── los checks ─────────────────────────────────────────────────────────── */

const SOURCE = "Fowler — «Form Template Method» (https://refactoring.com/catalog/formTemplateMethod.html)";
const TO_CONFIRM: readonly string[] = [
  "¿el ancestro está en ESTE archivo? Si vive en otro (o es una clase de una biblioteca), el análisis no puede ver si ya declara el miembro, y tampoco si es editable. Sin poder tocar el ancestro, esta refactorización no existe.",
  "¿los pasos comunes se llaman sobre el MISMO receptor en los dos hermanos? El análisis compara nombres invocados, no receptores: dos `write(...)` sobre objetos distintos no son el mismo paso.",
  "¿el orden común es esencial o casual? Subir el esqueleto congela el orden para siempre; si un hermano futuro necesita otro, la plantilla estorba.",
];

type Ctx = {
  readonly forma: Forma | null;
  readonly conArbol: boolean;
};

const hermanosRepitenLaSecuencia: Check<Ctx, Graph> = {
  id: "hermanos-repiten-la-secuencia",
  describe: `>=${MIN_HERMANOS} unidades-tipo de este archivo declaran el mismo ancestro y el mismo miembro (misma aridad), sus cuerpos invocan >=${MIN_PASOS_COMUNES} pasos comunes EN EL MISMO ORDEN, y >=${MIN_HERMANOS} agregan además un paso propio`,
  run: (c) =>
    !c.forma
      ? { holds: false, evidence: c.conArbol ? "no se encontró en este archivo ninguna familia con un homónimo cuya secuencia de pasos comunes coincida en orden: no demostrado." : "sin árbol vivo para este archivo: no demostrado." }
      : { holds: true, evidence: `${c.forma.decls.length} hermanos de "${c.forma.ancestor}" declaran "${c.forma.methodName}" (aridad ${c.forma.arity}) e invocan, en el mismo orden, ${c.forma.comunes.join(" > ")}.` },
};

const elAnclaTocaLaFamilia: Check<Ctx, Graph> = {
  id: "el-ancla-toca-la-familia",
  describe: "alguna ubicación del hallazgo cae dentro de una de esas declaraciones (sin esto, cualquier hallazgo del archivo publicaría la misma propuesta)",
  run: (c) =>
    !c.forma
      ? { holds: false, evidence: "sin familia: no demostrado." }
      : { holds: c.forma.tocaElAncla, evidence: c.forma.tocaElAncla ? `el hallazgo cae dentro de "${c.forma.decls.map((d) => d.unidad).join('", "')}".` : "ninguna ubicación del hallazgo cae dentro de las declaraciones de la familia." },
};

const pasosPropiosSonMiembros: Check<Ctx, Graph> = {
  id: "los-pasos-propios-ya-son-miembros-del-hermano",
  describe: `>=${MIN_CON_GANCHO} hermanos invocan SOBRE SÍ MISMOS un paso propio que ESA MISMA unidad declara como miembro: el gancho que la plantilla haría abstracto YA está escrito, así que subir el esqueleto es mecánico y no un rediseño. El receptor decide — una llamada sobre otro objeto que casualmente comparte nombre con un miembro propio no es un gancho`,
  run: (c) => {
    if (!c.forma) return { holds: false, evidence: "sin familia: no demostrado." };
    const detalle = c.forma.decls.map((d) => `${d.unidad}: ${d.ganchos.length > 0 ? d.ganchos.join(", ") : "(ninguno propio)"}`).join(" | ");
    return { holds: c.forma.conGancho >= MIN_CON_GANCHO, evidence: `${c.forma.conGancho} de ${c.forma.decls.length} hermanos tienen el gancho escrito — ${detalle}.` };
  },
};

const esqueletoNoViveArriba: Check<Ctx, Graph> = {
  id: "el-esqueleto-no-vive-ya-en-el-ancestro",
  describe:
    "el ancestro es VISIBLE en los archivos que el hallazgo nombra, DECLARA al menos un miembro (una interfaz marcadora no es una familia de comportamiento) y NO declara ya ese miembro. " +
    "Las dos mitades son requisito, no una: si el ancestro no se ve, no se puede saber si la plantilla ya está puesta NI si el ancestro es editable, " +
    "y un `required` que aprueba porque no pudo mirar no es un `required` (`no-permissive-required.test.ts`)",
  run: (c) => {
    if (!c.forma) return { holds: false, evidence: "sin familia: no demostrado." };
    if (!c.forma.ancestroEnElArchivo) return { holds: false, evidence: `"${c.forma.ancestor}" no está entre los archivos que el hallazgo nombra: el análisis no puede mirar si ya declara "${c.forma.methodName}" ni si es editable.` };
    if (!c.forma.ancestroConMiembros) return { holds: false, evidence: `"${c.forma.ancestor}" no declara ningún miembro: es una interfaz MARCADORA, y dos tipos que sólo comparten una marca no son una familia de comportamiento.` };
    if (c.forma.ancestroYaLoDeclara) return { holds: false, evidence: `"${c.forma.ancestor}" ya declara "${c.forma.methodName}": la plantilla ya existe.` };
    return { holds: true, evidence: `"${c.forma.ancestor}" es visible y NO declara "${c.forma.methodName}".` };
  },
};

const secuenciaLarga: Check<Ctx, Graph> = {
  id: "secuencia-larga",
  describe: `>=${MUCHOS_PASOS_COMUNES} pasos comunes: el esqueleto que se sube es sustancial`,
  run: (c) => (!c.forma ? { holds: false, evidence: "sin familia." } : { holds: c.forma.comunes.length >= MUCHOS_PASOS_COMUNES, evidence: `${c.forma.comunes.length} pasos comunes.` }),
};

const muchosHermanos: Check<Ctx, Graph> = {
  id: "tres-o-mas-hermanos",
  describe: `>=${MUCHOS_HERMANOS} hermanos repiten la secuencia: la duplicación paga más`,
  run: (c) => (!c.forma ? { holds: false, evidence: "sin familia." } : { holds: c.forma.decls.length >= MUCHOS_HERMANOS, evidence: `${c.forma.decls.length} hermanos.` }),
};

const todosConGancho: Check<Ctx, Graph> = {
  id: "todos-los-hermanos-tienen-gancho",
  describe: "TODOS los hermanos tienen su paso propio ya escrito como miembro: la plantilla queda sin un solo cuerpo que reescribir",
  run: (c) => (!c.forma ? { holds: false, evidence: "sin familia." } : { holds: c.forma.conGancho === c.forma.decls.length, evidence: `${c.forma.conGancho} de ${c.forma.decls.length}.` }),
};

/** SIEMPRE `"ausente"` — trampa #2. */
function appliedState(c: Ctx): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "la secuencia sigue escrita una vez por hermano",
        passed: true,
        why: c.forma ? `${c.forma.decls.length} copias de la misma secuencia (${c.forma.comunes.join(" > ")}); si viviera una sola vez arriba, los hermanos no la declararían.` : "sin familia.",
      },
    ],
  };
}

function buildSpec(): HypothesisSpec<Ctx, Graph> {
  return {
    pattern: "Form Template Method",
    ceiling: "media",
    needs: [],
    required: [hermanosRepitenLaSecuencia, elAnclaTocaLaFamilia, pasosPropiosSonMiembros, esqueletoNoViveArriba],
    discriminators: [secuenciaLarga, muchosHermanos, todosConGancho],
    appliedState: (c) => appliedState(c),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── la traza ───────────────────────────────────────────────────────────── */

export interface FormTemplateMethodTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly withFile: boolean;
  readonly language: string;
  readonly ancestor: string;
  readonly methodName: string;
  readonly hermanos: number;
  readonly comunes: number;
  readonly conGancho: number;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly emitted: boolean;
}

let trace: FormTemplateMethodTraceEntry[] | null = null;
export function startFormTemplateMethodTrace(): void {
  trace = [];
}
export function takeFormTemplateMethodTrace(): readonly FormTemplateMethodTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function placesOf(f: Forma): readonly RoleLocation[] {
  const out: RoleLocation[] = f.decls.map((d) => ({
    file: d.file,
    startLine: d.startLine,
    endLine: d.endLine,
    symbol: `${d.unidad}.${f.methodName}`,
    role:
      d.ganchos.length > 0
        ? `repite los ${f.comunes.length} pasos comunes y varía en ${d.ganchos.join(", ")} — ése es el gancho que queda abstracto en "${f.ancestor}"`
        : `repite los ${f.comunes.length} pasos comunes${d.propios.length > 0 ? ` y agrega ${d.propios.join(", ")}, que no son miembros propios` : " sin agregar ninguno propio"}`,
  }));
  return out;
}

export const hypothesis: HypothesisBuilder = {
  id: "form-template-method",
  pattern: "Form Template Method",
  layer: "refactorizacion",
  anchors: ["homonymous-divergent-sequence", "parallel-hierarchies", "refused-bequest"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const archivos = archivosDe(problem, ctx);
    const forma = archivos.length > 0 ? formaDe(archivos, problem) : null;
    const c: Ctx = { forma, conArbol: ctx.file !== null };
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
        ancestor: forma?.ancestor ?? "",
        methodName: forma?.methodName ?? "",
        hermanos: forma?.decls.length ?? 0,
        comunes: forma?.comunes.length ?? 0,
        conGancho: forma?.conGancho ?? 0,
        checks,
        diesAt: checks.find((k) => !k.holds)?.id ?? null,
        emitted: outcome !== null,
      });
    }
    if (!outcome || !forma) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(forma),
      cost:
        `Un método "${forma.methodName}" en "${forma.ancestor}" con los ${forma.comunes.length} pasos comunes en el orden que ya tienen ` +
        `(${forma.comunes.join(" > ")}), y una declaración abstracta por cada gancho. Los ${forma.decls.length} hermanos borran su copia y se quedan con el gancho. ` +
        `Ninguna firma cambia. El trabajo real es comprobar que el orden es esencial y que "${forma.ancestor}" es editable.`,
    });
  },
};
