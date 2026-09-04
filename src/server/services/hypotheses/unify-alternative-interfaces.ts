/**
 * Unify Alternative Interfaces — Ola AU, frente AU5.
 *
 * EL OLOR CANÓNICO ES *Alternative Classes with Different Interfaces*: dos
 * clases hacen lo mismo y el que las usa no las puede tratar igual porque la
 * operación se llama distinto o se declara distinto. El remedio de
 * refactoring.guru es unificar la firma (Rename Method / Add Parameter /
 * Parameterize Method) y recién después declarar la operación una sola vez
 * arriba (Extract Superclass).
 *
 * ── LO QUE ESTA FAMILIA CUBRE Y LO QUE NO — DECLARADO, NO ESCONDIDO ───────
 * Los dos detectores que esta familia puede usar como ancla —
 * `homonymous-divergent-sequence` y `homonymous-divergent-construction`—
 * exigen los DOS que las unidades **compartan un ancestro** y que el miembro
 * **se llame IGUAL**. Es decir: **la mitad canónica del olor —dos clases SIN
 * PARENTESCO cuya operación se llama DISTINTO— no tiene detector en este
 * analizador, y esta familia no puede cubrirla.** Se dice acá y se repite en
 * el informe: es un hueco de NIVEL 1, no algo que una hipótesis pueda tapar.
 *
 * Lo que sí queda, y es una instancia real del mismo olor: **hermanos de una
 * familia que declaran la MISMA operación con FIRMAS DISTINTAS**. Quien tiene
 * una referencia al ancestro no puede invocarla polimórficamente; hay que
 * saber cuál subtipo es. Es exactamente "no las puedo tratar igual".
 *
 *     class Writer { }                       class Writer {
 *     class FileWriter extends Writer {        write(data, opts = {}) { … }
 *       write(data) { open(); emit(data); }  }
 *     }                                  ⇒   // los dos hermanos redefinen
 *     class NetWriter extends Writer {        // write(data, opts)
 *       write(data, opts) { open(); emit(data); retry(opts); }
 *     }
 *
 * ── LA PRECONDICIÓN, QUE ES UN HECHO Y SE VERIFICA ABRIENDO EL ARCHIVO ────
 *   (1) >=2 unidades-tipo declaran el mismo ancestro;
 *   (2) >=2 de ellas declaran un miembro del MISMO nombre;
 *   (3) sus ARIDADES DECLARADAS difieren: esto es lo que impide usarlas igual.
 *       **Un tipo de retorno divergente NO alcanza y está medido** (§ el falso
 *       `jenkins · SettingsProvider/GlobalSettingsProvider.parseSettingsProvider`):
 *       la covarianza de retorno es OOP normal, y en una fábrica ESTÁTICA el
 *       retorno tiene que diferir por definición;
 *   (4) **hacen lo mismo**: los cuerpos comparten >=2 pasos invocados, en el
 *       mismo orden, y **los pasos del cuerpo más corto son un subconjunto de
 *       los del más largo**. Sin la (4) esto es una sobrecarga legítima —dos
 *       operaciones distintas que comparten nombre— y proponer unificarlas
 *       sería el falso medido `BsonObject.Add(string,BsonToken)` /
 *       `BsonArray.Add(BsonToken)` que `hypotheses/template-method.ts` ya
 *       documenta;
 *   (5) las declaraciones están en unidades-tipo DISTINTAS (un juego de
 *       sobrecargas dentro de UNA clase no es este olor);
 *   (6) el ancestro es VISIBLE en alguno de esos archivos y **no declara ya**
 *       el miembro: si lo declarara, el contrato unificado ya existe; si no se
 *       ve, no se puede saber ni eso ni si es editable, y la familia calla
 *       (`no-permissive-required.test.ts`). Los dos brazos se miden.
 *
 * Las seis se cuentan abriendo el archivo. Ninguna opina sobre el futuro:
 * "estas dos firmas no son la misma" es aritmética sobre la lista de
 * parámetros, no una intención de diseño. Es la prueba que la Ola AS le exige
 * a toda familia nueva, y la razón por la que `Extract Method` rinde 73,6 % y
 * un patrón rinde 18 %.
 *
 * ── RELACIÓN CON `Form Template Method` (misma ola, mismo frente) ─────────
 * Las dos familias cuelgan de `homonymous-divergent-sequence` y **PARTEN la
 * población, no la comparten**: `Form Template Method` exige que las aridades
 * COINCIDAN (el esqueleto se puede subir tal cual) y ésta exige que
 * DIFIERAN (primero hay que unificar la firma). Un mismo (ancestro, miembro)
 * no puede satisfacer las dos. Verificado con un test propio.
 *
 * ── TRAMPA #3: EL REMEDIO PUEDE YA ESTAR APLICADO ─────────────────────────
 * *De 21 casos en disputa de la Ola AP, en SIETE la solución YA EXISTÍA en el
 * código.* Acá la solución vive **en el ancestro** —una firma declarada una
 * sola vez arriba—, no en el alcance del ancla. La condición (6) mira ahí. Si
 * el ancestro ya declara el miembro, esta familia CALLA: un `required` que
 * devuelve `false`, nunca una propuesta con menos confianza.
 *
 * ── TRAMPA #2: NO SE LE PUEDE BORRAR LA PROPUESTA A NADIE ────────────────
 * Sus dos anclas son anclas de `Template Method` y de `Factory Method`, los
 * dos CONGELADOS. `engine.ts#arbitrateRivalHypotheses:333-347` retira una
 * oportunidad sólo frente a un estado CONFIRMADO
 * (`ya-aplicado`/`aplicado-eludido`). **`appliedState` devuelve SIEMPRE
 * `"ausente"`**, así que esta hipótesis no puede aparecer en
 * `overlappingRivals`. Test propio y `miaConfirmada` de la corrida (0).
 *
 * ── LENGUAJES ─────────────────────────────────────────────────────────────
 * `needs: []`. Ni una constante nombra un lenguaje. Misma lectura de forma que
 * `form-template-method.ts` y que `detect/intra-file/
 * homonymous-divergent-sequence.ts`, que la sondeó contra los `.wasm` reales.
 *
 * DUPLICACIÓN DECLARADA: el bloque de helpers de lectura del árbol
 * (`baseNamesFrom`, `extractBaseNames`, `calleeName`, `callSequence`,
 * `declaredMethods`, `archivosDe`) es una copia del de
 * `form-template-method.ts`, que a su vez lo copia del detector.
 * `hypotheses/*` no puede importar los helpers privados de un detector y el
 * contrato de `registry.ts` pide UN archivo por hipótesis, sin un módulo
 * compartido que agregue superficie de merge. Se copia y se dice.
 */
import { CONSTRUCTOR_NAMES } from "../code-grammar.js";
import type { AstNode, FileUnit, Finding, RoleLocation } from "../detect/types.js";
import type { CodeGraph, CodeGraphNode } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/* ── umbrales de FORMA ───────────────────────────────────────────────────── */

/** Con una sola declaración no hay dos interfaces que unificar. */
const MIN_HERMANOS = 2;
/** Un solo paso común no alcanza para decir "hacen lo mismo". */
const MIN_PASOS_COMUNES = 2;
/** Mismo piso que `homonymous-divergent-sequence.ts#llamadasPorCopia`. */
const MIN_PASOS_POR_COPIA = 3;
/** Una diferencia de un solo parámetro se unifica con un valor por omisión. */
const ARIDADES_CONTIGUAS = 1;
const MUCHOS_PASOS_COMUNES = 4;
const MUCHAS_DECLARACIONES = 3;

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

/**
 * OLA AW · AW3 — LA JAULA QUE EXPLICABA `n = 1`, Y EL DATO QUE LA MIDIÓ.
 *
 * Hasta la Ola AU esta función devolvía SÓLO `ctx.file` más los archivos que
 * las `locations` del hallazgo ya nombraban. Con eso, una familia repartida
 * en seis archivos era invisible salvo que el ancla los nombrara a los seis.
 *
 * NO ES UNA CORAZONADA, ESTÁ CONTADO. Censo propio sobre el GRAFO
 * (`extends`/`implements` `resolved` + `contains` + `arity` del nodo), 21
 * repos: de todos los pares (ancestro, miembro) que cumplen la precondición
 * entera de esta familia —≥2 subtipos, aridades divergentes, ≥2 pasos
 * invocados en común— **NINGUNO tiene sus declaraciones en un solo archivo**:
 * jenkins 16 de 16 multi-archivo, nest 5 de 5. La jaula no recortaba la
 * población: la borraba.
 *
 * EL ARREGLO usa el grafo, que es lo que el usuario propuso para el
 * acoplamiento y vale igual acá: *si ves el archivo de donde viene, podés
 * asumir de qué unidad es*. Desde los tipos declarados en los archivos del
 * hallazgo se suben las aristas `extends`/`implements` hasta los ancestros y
 * se vuelve a bajar a TODOS sus subtipos; los archivos de esos nodos entran.
 * Ni una consulta de tipos, ni un `import` resuelto: sólo `edge.kind` y
 * `node.file`, las mismas dos cosas que el grafo ya publica.
 *
 * DOS LÍMITES DECLARADOS:
 *  · sólo aristas `resolved`/`declared` — una `inferred` o `ambiguous` no
 *    alcanza para afirmar parentesco (misma regla que `divergent-change.ts`);
 *  · `MAX_ARCHIVOS` sigue en pie y ahora SÍ muerde: una familia de 40
 *    subtipos se recorta a 12 archivos. Se ordena para que los archivos del
 *    hallazgo vayan primero y el recorte caiga siempre en los hermanos más
 *    lejanos, nunca en el que el ancla señaló.
 */
const HERENCIA: ReadonlySet<string> = new Set(["extends", "implements"]);

function archivosDeLaFamilia(problem: Finding, ctx: HypothesisContext, graph: CodeGraph | null): string[] {
  if (!graph) return [];
  const anclaFiles = new Set<string>();
  if (ctx.file) anclaFiles.add(ctx.file.path);
  for (const loc of problem.locations) anclaFiles.add(loc.file);

  const fileDe = new Map<string, string>();
  for (const n of graph.nodes) fileDe.set(n.id, n.file);

  /** subtipo -> ancestros, y ancestro -> subtipos, sólo con parentesco afirmado. */
  const arriba = new Map<string, string[]>();
  const abajo = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!HERENCIA.has(e.kind)) continue;
    if (e.provenance === "inferred" || e.provenance === "ambiguous") continue;
    const a = arriba.get(e.from);
    if (a) a.push(e.to);
    else arriba.set(e.from, [e.to]);
    const b = abajo.get(e.to);
    if (b) b.push(e.from);
    else abajo.set(e.to, [e.from]);
  }

  const semillas = graph.nodes.filter((n) => anclaFiles.has(n.file)).map((n) => n.id);
  const ancestros = new Set<string>();
  for (const s of semillas) {
    for (const a of arriba.get(s) ?? []) ancestros.add(a);
    // el propio nodo puede SER el ancestro (el ancla cae en la base)
    if ((abajo.get(s) ?? []).length > 0) ancestros.add(s);
  }
  const out: string[] = [];
  const vistos = new Set<string>(anclaFiles);
  for (const a of ancestros) {
    const fa = fileDe.get(a);
    if (fa !== undefined && !vistos.has(fa)) {
      vistos.add(fa);
      out.push(fa);
    }
    for (const sub of abajo.get(a) ?? []) {
      const fs = fileDe.get(sub);
      if (fs !== undefined && !vistos.has(fs)) {
        vistos.add(fs);
        out.push(fs);
      }
    }
  }
  return out;
}

function archivosDe(problem: Finding, ctx: HypothesisContext, graph: CodeGraph | null): { file: FileUnit; sets: FileUnit["sets"] }[] {
  const vistos = new Set<string>();
  const out: { file: FileUnit; sets: FileUnit["sets"] }[] = [];
  const agregar = (f: FileUnit | null): void => {
    if (!f || vistos.has(f.path) || out.length >= MAX_ARCHIVOS) return;
    vistos.add(f.path);
    out.push({ file: f, sets: ctx.setsFor(f.language) });
  };
  agregar(ctx.file);
  for (const loc of problem.locations) agregar(ctx.fileAt(loc.file));
  for (const ruta of archivosDeLaFamilia(problem, ctx, graph)) agregar(ctx.fileAt(ruta));
  return out;
}

/* ── la forma ────────────────────────────────────────────────────────────── */

interface Declaracion {
  readonly file: string;
  readonly unidad: string;
  readonly arity: number;
  readonly returnType: string | undefined;
  readonly startLine: number;
  readonly endLine: number;
  readonly pasos: readonly string[];
  readonly unidadStart: number;
  readonly unidadEnd: number;
}

interface Forma {
  readonly ancestor: string;
  readonly methodName: string;
  readonly decls: readonly Declaracion[];
  readonly aridades: readonly number[];
  readonly comunes: readonly string[];
  readonly ordenCoincide: boolean;
  readonly cortoEsSubconjunto: boolean;
  readonly retornosEnDesacuerdo: boolean;
  readonly ancestroVisible: boolean;
  readonly ancestroYaLoDeclara: boolean;
  /** El ancestro declara al menos un miembro: una interfaz MARCADORA no es una familia de comportamiento. */
  readonly ancestroConMiembros: boolean;
  readonly tocaElAncla: boolean;
  /** AW3 — llamadas ENTRANTES al miembro desde fuera de su unidad-tipo.
   *  `null` = sin grafo, no se sabe (y entonces la familia calla). */
  readonly invocadaDesdeAfuera: number | null;
}

/* ── AW3: DIAGNOSTICO (sólo medición, no cambia comportamiento) ────────── */
export interface UaiGrupoDiag {
  readonly ancestor: string;
  readonly methodName: string;
  readonly declaraciones: number;
  readonly conPasos: number;
  readonly aridades: readonly number[];
  readonly pasosPorCopia: readonly number[];
  readonly comunes: number;
  readonly ordenCoincide: boolean;
  readonly cortoEsSubconjunto: boolean;
  readonly retornosEnDesacuerdo: boolean;
  readonly ancestroVisible: boolean;
  readonly ancestroYaLoDeclara: boolean;
  readonly ancestroConMiembros: boolean;
  readonly tocaElAncla: boolean;
  readonly muereEn: string | null;
  readonly unidades: readonly string[];
  readonly archivos: readonly string[];
  readonly lineas: readonly number[];
}
let diagGrupos: UaiGrupoDiag[] | null = null;
let diagActivo = false;
export function startUaiDiag(): void { diagActivo = true; }
function pushDiag(g: UaiGrupoDiag): void { if (diagActivo && diagGrupos) diagGrupos.push(g); }

/**
 * AW3 — cuántas veces se invoca `metodo` sobre alguna de estas unidades-tipo
 * DESDE FUERA de la unidad que lo declara. Sólo `edge.kind === "calls"` y
 * `node.symbolPath`: ni tipos ni imports resueltos.
 *
 * "Desde fuera" = el `from` de la arista no comparte la primera componente del
 * `symbolPath` con el `to` DENTRO DEL MISMO ARCHIVO. Un método que se llama a
 * sí mismo, o al que llama un hermano de su propia clase, no cuenta: eso es
 * uso interno, no un contrato que alguien de afuera tenga que conocer.
 */
function invocacionesDesdeAfuera(
  graph: CodeGraph | null,
  metodo: string,
  unidades: readonly { readonly file: string; readonly unidad: string }[],
): number | null {
  if (!graph) return null;
  const objetivo = new Set(unidades.map((u) => `${u.file}\u0000${u.unidad}`));
  const porId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  let n = 0;
  for (const e of graph.edges) {
    if (e.kind !== "calls") continue;
    const destino = porId.get(e.to);
    if (!destino || destino.symbolPath.length < 2) continue;
    if (destino.symbolPath[destino.symbolPath.length - 1] !== metodo) continue;
    if (!objetivo.has(`${destino.file}\u0000${destino.symbolPath[0]}`)) continue;
    const origen = porId.get(e.from);
    const mismoDuenio =
      origen !== undefined &&
      origen.file === destino.file &&
      origen.symbolPath.length > 0 &&
      origen.symbolPath[0] === destino.symbolPath[0];
    if (!mismoDuenio) n++;
  }
  return n;
}

function formaDe(archivos: readonly { file: FileUnit; sets: FileUnit["sets"] }[], problem: Finding, graph: CodeGraph | null): Forma | null {
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
  if (diagActivo) diagGrupos = [];

  for (const [ancestor, hermanos] of [...porAncestro.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (hermanos.length < MIN_HERMANOS) continue;

    const porMetodo = new Map<string, { u: Unidad; m: Metodo }[]>();
    for (const u of hermanos) {
      for (const m of u.methods) {
        const list = porMetodo.get(m.name) ?? [];
        // (5) UNA declaración por unidad-tipo: un juego de sobrecargas dentro
        // de una misma clase es legítimo y no es este olor. Se conserva la
        // PRIMERA en orden de archivo, igual que el detector-ancla.
        if (!list.some((d) => d.u.name === u.name && d.u.file === u.file)) list.push({ u, m });
        porMetodo.set(m.name, list);
      }
    }

    for (const [methodName, crudas] of [...porMetodo.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const ancUnidadD = porNombre.get(ancestor) ?? null;
      const baseDiag = {
        ancestor,
        methodName,
        declaraciones: crudas.length,
        ancestroVisible: ancUnidadD !== null,
        ancestroYaLoDeclara: ancUnidadD !== null && ancUnidadD.memberNames.has(methodName),
        ancestroConMiembros: ancUnidadD !== null && ancUnidadD.memberNames.size > 0,
        unidades: crudas.map((d) => d.u.name),
        archivos: [...new Set(crudas.map((d) => d.u.file))],
        lineas: crudas.map((d) => d.m.startLine),
        tocaElAncla: lineasAncla.some((r) => crudas.some((d) => d.u.file === r.f && d.u.startLine <= r.b && r.a <= d.u.endLine)),
      };
      if (crudas.length < MIN_HERMANOS) {
        pushDiag({ ...baseDiag, conPasos: 0, aridades: [], pasosPorCopia: [], comunes: 0, ordenCoincide: false, cortoEsSubconjunto: false, retornosEnDesacuerdo: false, muereEn: "un-solo-hermano" });
        continue;
      }

      const utiles = (m: Metodo): Paso[] => m.sequence.filter((s2) => s2.name !== m.name && !NON_STEP_KEYWORDS.has(s2.name));
      const pasosDe = (m: Metodo): string[] => utiles(m).map((s2) => s2.name);
      /** Los nombres invocados SOBRE SÍ MISMO: los únicos que pueden ser gancho. */
      const propiosDe = (m: Metodo): Set<string> => new Set(utiles(m).filter((s2) => s2.propio).map((s2) => s2.name));
      const todosLosPasos = crudas.map((d) => pasosDe(d.m).length);
      const conPasos = crudas.map((d) => ({ ...d, steps: pasosDe(d.m) })).filter((d) => d.steps.length >= MIN_PASOS_POR_COPIA);
      const aridadesCrudas = [...new Set(crudas.map((d) => d.m.arity))].sort((a, b) => a - b);
      if (conPasos.length < MIN_HERMANOS) {
        pushDiag({ ...baseDiag, conPasos: conPasos.length, aridades: aridadesCrudas, pasosPorCopia: todosLosPasos, comunes: 0, ordenCoincide: false, cortoEsSubconjunto: false, retornosEnDesacuerdo: false, muereEn: "cuerpos-con-menos-de-3-pasos" });
        continue;
      }

      const aridades = [...new Set(conPasos.map((d) => d.m.arity))].sort((a, b) => a - b);
      const retornos = new Set(conPasos.map((d) => d.m.returnType).filter((t): t is string => t !== undefined));
      const retornosEnDesacuerdo = retornos.size > 1;
      // (3) LA CONDICIÓN QUE DEFINE ESTA FAMILIA: la ARIDAD tiene que diferir.
      // El desacuerdo de TIPO DE RETORNO por sí solo NO alcanza y está medido:
      // `jenkins · SettingsProvider/GlobalSettingsProvider.parseSettingsProvider`
      // son dos fábricas ESTÁTICAS de un parámetro cada una cuyo tipo de retorno
      // ES su propia clase — tiene que diferir, y no hay ninguna llamada
      // polimórfica que unificar. El retorno divergente queda como EVIDENCIA,
      // nunca como disparador.
      if (aridades.length < 2) {
        pushDiag({ ...baseDiag, conPasos: conPasos.length, aridades, pasosPorCopia: todosLosPasos, comunes: 0, ordenCoincide: false, cortoEsSubconjunto: false, retornosEnDesacuerdo, muereEn: "misma-aridad" });
        continue;
      }

      const conjuntos = conPasos.map((d) => new Set(d.steps));
      const shared = new Set<string>([...conjuntos[0]!].filter((n) => conjuntos.every((s) => s.has(n))));
      if (shared.size < MIN_PASOS_COMUNES) {
        pushDiag({ ...baseDiag, conPasos: conPasos.length, aridades, pasosPorCopia: todosLosPasos, comunes: shared.size, ordenCoincide: false, cortoEsSubconjunto: false, retornosEnDesacuerdo, muereEn: "menos-de-2-pasos-comunes" });
        continue;
      }

      const ordenes = conPasos.map((d) => ordenComun(d.steps, shared).join("|"));
      const ordenCoincide = new Set(ordenes).size === 1;

      // (4b) los pasos del cuerpo MÁS CORTO son un subconjunto de los del más
      // largo: uno hace todo lo que hace el otro, y quizá algo más. Sin esto,
      // "comparten dos pasos" también lo cumplen dos operaciones distintas.
      const ordenados = [...conPasos].sort((a, b) => new Set(a.steps).size - new Set(b.steps).size);
      const corto = new Set(ordenados[0]!.steps);
      const largo = new Set(ordenados[ordenados.length - 1]!.steps);
      const cortoEsSubconjunto = [...corto].every((n) => largo.has(n));

      const decls: Declaracion[] = conPasos.map((d) => ({
        file: d.u.file,
        unidad: d.u.name,
        arity: d.m.arity,
        returnType: d.m.returnType,
        startLine: d.m.startLine,
        endLine: d.m.endLine,
        pasos: [...new Set(d.steps)],
        unidadStart: d.u.startLine,
        unidadEnd: d.u.endLine,
      }));

      const ancestroUnidad = porNombre.get(ancestor) ?? null;
      const forma: Forma = {
        ancestor,
        methodName,
        decls,
        aridades,
        comunes: ordenComun(conPasos[0]!.steps, shared),
        ordenCoincide,
        cortoEsSubconjunto,
        retornosEnDesacuerdo,
        ancestroVisible: ancestroUnidad !== null,
        ancestroYaLoDeclara: ancestroUnidad !== null && ancestroUnidad.memberNames.has(methodName),
        ancestroConMiembros: ancestroUnidad !== null && ancestroUnidad.memberNames.size > 0,
        // EL ANCLA TOCA LA FAMILIA A NIVEL DE UNIDAD-TIPO, no de miembro: el
        // hallazgo señala OTRO homónimo de la misma familia (por construcción
        // el detector-ancla exige aridad igual y éste exige aridad distinta),
        // así que exigir solapamiento de líneas de método dejaría la familia
        // muda sobre su ancla principal.
        tocaElAncla: lineasAncla.some((r) => decls.some((d) => d.file === r.f && d.unidadStart <= r.b && r.a <= d.unidadEnd)),
        invocadaDesdeAfuera: invocacionesDesdeAfuera(graph, methodName, decls.map((d) => ({ file: d.file, unidad: d.unidad }))),
      };
      pushDiag({
        ...baseDiag,
        conPasos: conPasos.length,
        aridades,
        pasosPorCopia: todosLosPasos,
        comunes: forma.comunes.length,
        ordenCoincide: forma.ordenCoincide,
        cortoEsSubconjunto: forma.cortoEsSubconjunto,
        retornosEnDesacuerdo,
        ancestroVisible: forma.ancestroVisible,
        ancestroYaLoDeclara: forma.ancestroYaLoDeclara,
        ancestroConMiembros: forma.ancestroConMiembros,
        tocaElAncla: forma.tocaElAncla,
        muereEn: null,
      });
      /**
       * OLA AW · AW3 — EL SEGUNDO DEFECTO QUE EL DIAGNÓSTICO DESTAPÓ, Y ES
       * PEOR QUE UNA COMPUERTA MAL PUESTA.
       *
       * `formaDe` elige UNA forma por hallazgo y el motor la evalúa; si esa
       * forma falla un `required`, la hipótesis CALLA — aunque otra forma de
       * la MISMA familia lo hubiera pasado. Medido en `nest`: de las 71
       * familias vistas desde `server-kafka.ts`, la ganadora era
       * `Server.getPublisher` (4 declaraciones, 3 pasos comunes) por tener
       * `cortoEsSubconjunto` y `ordenCoincide`; `Server.handleMessage` —SEIS
       * declaraciones, SIETE pasos comunes, el caso canónico— puntuaba menos
       * y ni se consideraba. La familia callaba por su propio desempate.
       *
       * EL ARREGLO: el término que más pesa, después de tocar el ancla, es
       * **si la forma pasa `hacen-lo-mismo`**. No es un peso nuevo inventado:
       * es poner en el desempate el mismo predicado que el `required` va a
       * aplicar, para no elegir una forma que se sabe que va a morir.
       */
      const pasaHacenLoMismo =
        forma.decls.length >= DECLARACIONES_SIN_ANIDAMIENTO
          ? forma.comunes.length >= MIN_PASOS_COMUNES_GRAFO
          : forma.ordenCoincide && forma.cortoEsSubconjunto;
      const puntaje =
        (forma.tocaElAncla ? 10000 : 0) +
        (pasaHacenLoMismo ? 5000 : 0) +
        (forma.cortoEsSubconjunto ? 1000 : 0) +
        (forma.ordenCoincide ? 500 : 0) +
        forma.comunes.length * 10 +
        forma.decls.length;
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = forma;
      }
    }
  }
  return mejor;
}

/* ── EL CAMINO POR GRAFO — AW3 ───────────────────────────────────────────
 *
 * POR QUÉ EXISTE, CON EL NÚMERO QUE LO MOTIVA. El camino de ÁRBOL de arriba
 * lee la herencia de la SINTAXIS (`extends`/`implements`/`base_list`/…), y por
 * eso está MUDO en Go, donde la implementación de una interfaz no se escribe:
 * se deduce. Medido sobre `gitea` (Go) con el volcado de este frente: **11
 * hallazgos-ancla, CERO familias** — ni un solo grupo (ancestro, miembro) se
 * forma, aunque el ancla `homonymous-divergent-construction` sí dispara,
 * porque ESE detector no lee la sintaxis: lee las aristas
 * `extends`/`implements`/`mixes-in`/`satisfies` del grafo.
 *
 * Y hay un segundo silencio, más grande: el camino de árbol sólo ve los
 * archivos que el hallazgo NOMBRA (`ctx.file` + `ctx.fileAt` de sus
 * `locations`, ver `archivosDe`). En Java/C#/Ruby, donde una clase por archivo
 * es la norma, los hermanos casi nunca comparten archivo con el hallazgo.
 *
 * EL GRAFO TIENE LAS CINCO PIEZAS Y NINGUNA PIDE TIPOS:
 *   · quién hereda de quién  → aristas `extends`/`implements`/`mixes-in`/`satisfies`;
 *   · qué miembro declara cada uno → aristas `contains` a nodos `function-like`;
 *   · CUÁNTOS PARÁMETROS tiene cada declaración → `CodeGraphNode.arity`
 *     (CONTRATO-F8G §2.2, poblado en las seis gramáticas; `null` = NO SE SABE,
 *     y una declaración sin aridad conocida no participa);
 *   · qué invoca cada declaración → aristas `calls`;
 *   · si el ancestro ya declara el miembro → sus propios hijos `contains`.
 *
 * LO QUE EL GRAFO **NO** TIENE, Y SE PAGA: el ORDEN de los pasos y la relación
 * "el cuerpo corto es subconjunto del largo" son propiedades del cuerpo, no
 * del grafo. Por eso este camino NO reutiliza `hacen-lo-mismo` tal cual: exige
 * MÁS pasos comunes (`MIN_PASOS_COMUNES_GRAFO`) en vez de exigir el orden. Es
 * un cambio de evidencia declarado, no un `required` que aprueba por no poder
 * mirar (`no-permissive-required.test.ts`): los pasos comunes se cuentan sobre
 * aristas reales.
 *
 * PRECEDENCIA: el camino de ÁRBOL manda siempre que produzca una familia. El
 * grafo entra sólo donde el árbol no vio nada — es ADITIVO sobre lo que hoy
 * emite, nunca lo pisa.
 */

/** Las cuatro aristas con que este proyecto escribe "es un hermano de" — la
 *  MISMA lista que `detect/inter-file/homonymous-divergent-construction.ts`
 *  usa para su condición (1). No se nombra ningún lenguaje. */
const ARISTAS_DE_HERENCIA: ReadonlySet<string> = new Set(["extends", "implements", "mixes-in", "satisfies"]);
/** Evidencia POSITIVA ⇒ `inferred`/`ambiguous` quedan afuera, mismo criterio
 *  que `dependency-cycle.ts` y que `divergent-change.ts` ya aplican. */
const PROVENANCE_CONFIABLE: ReadonlySet<string> = new Set(["declared", "resolved"]);
/** Sin el orden de los pasos, la evidencia de "hacen lo mismo" tiene que ser
 *  más ancha: tres pasos comunes en vez de dos. */
const MIN_PASOS_COMUNES_GRAFO = 3;

/**
 * OLA AW · AW3 — EL PISO PARA UNA FAMILIA DE TRES O MÁS, Y POR QUÉ NO ES
 * AFLOJAR LA COMPUERTA SINO CAMBIARLE LA FORMA.
 *
 * `hacen-lo-mismo` pedía DOS cosas al camino por árbol: que los pasos comunes
 * aparezcan en el MISMO ORDEN y que los pasos del cuerpo más corto sean un
 * SUBCONJUNTO de los del más largo. Las dos son la prueba correcta para DOS
 * declaraciones: con dos cuerpos, "uno hace todo lo que hace el otro" es
 * exactamente lo que distingue una sobrecarga de una alternativa.
 *
 * CON SEIS DECLARACIONES ESA PRUEBA NO PUEDE VALER, Y ESTÁ MEDIDO. En
 * `nest`, `Server.handleMessage` la declaran SEIS hermanos (`ServerKafka`/1,
 * `ServerMqtt`/4, `ServerNats`/2, `ServerRedis`/4, `ServerRMQ`/2,
 * `ServerTCP`/2), con cuerpos de 10 a 18 pasos y **SIETE pasos invocados por
 * las seis** (`deserialize`, `getHandlerByPattern`, `handleEvent`, `send`,
 * `transformToObservable`, …). Es el olor canónico en su forma más limpia — y
 * la familia callaba, porque exigirle a seis cuerpos independientes que estén
 * anidados uno dentro del otro es exigir algo que el código real nunca cumple.
 *
 * LA PRUEBA EQUIVALENTE PARA k DECLARACIONES ES LA INTERSECCIÓN, Y ES MÁS
 * EXIGENTE, NO MENOS: `comunes` se cuenta sobre la intersección de LOS k
 * cuerpos, así que cada declaración que se suma sólo puede achicarla. "Siete
 * pasos que invocan las seis" es evidencia más fuerte de "hacen lo mismo" que
 * "dos pasos que invocan las dos, anidados". Por eso el piso sube (de 2 a 3,
 * el mismo `MIN_PASOS_COMUNES_GRAFO` que el camino por grafo ya usaba por la
 * misma razón: sin orden, la evidencia tiene que ser más ancha).
 *
 * CON DOS DECLARACIONES NO CAMBIA NADA: sigue rigiendo orden + subconjunto.
 */
const DECLARACIONES_SIN_ANIDAMIENTO = 3;

interface IndiceGrafo {
  readonly byId: ReadonlyMap<string, CodeGraphNode>;
  /** ancestro → subtipos (nodos `class-like`) */
  readonly subtipos: ReadonlyMap<string, ReadonlySet<string>>;
  /** contenedor → hijos */
  readonly hijos: ReadonlyMap<string, readonly string[]>;
  /** símbolo → nombres invocados */
  readonly pasos: ReadonlyMap<string, ReadonlySet<string>>;
}

const INDICES = new WeakMap<CodeGraph, IndiceGrafo>();

function nombreDeNodo(n: CodeGraphNode | undefined): string {
  if (!n) return "";
  return n.symbolPath[n.symbolPath.length - 1] ?? "";
}

function indiceDe(graph: CodeGraph): IndiceGrafo {
  const cache = INDICES.get(graph);
  if (cache) return cache;
  const byId = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) byId.set(n.id, n);
  const subtipos = new Map<string, Set<string>>();
  const hijos = new Map<string, string[]>();
  const pasos = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (e.kind === "contains") {
      const l = hijos.get(e.from);
      if (l) l.push(e.to);
      else hijos.set(e.from, [e.to]);
      continue;
    }
    if (e.kind === "calls") {
      const nombre = nombreDeNodo(byId.get(e.to));
      if (!nombre) continue;
      const s = pasos.get(e.from);
      if (s) s.add(nombre);
      else pasos.set(e.from, new Set([nombre]));
      continue;
    }
    if (!ARISTAS_DE_HERENCIA.has(e.kind) || !PROVENANCE_CONFIABLE.has(e.provenance)) continue;
    const s = subtipos.get(e.to);
    if (s) s.add(e.from);
    else subtipos.set(e.to, new Set([e.from]));
  }
  const idx: IndiceGrafo = { byId, subtipos, hijos, pasos };
  INDICES.set(graph, idx);
  return idx;
}

/** La familia (ancestro, miembro) leída del GRAFO, sin árbol. Devuelve la
 *  mejor con el mismo puntaje que el camino de árbol. */
function formaPorGrafo(problem: Finding, graph: CodeGraph): Forma | null {
  const idx = indiceDe(graph);
  const lineasAncla = problem.locations.map((l) => ({ f: l.file, a: l.startLine, b: l.endLine }));
  if (lineasAncla.length === 0) return null;
  const archivosAncla = new Set(lineasAncla.map((l) => l.f));

  let mejor: Forma | null = null;
  let mejorPuntaje = -1;

  for (const [ancestroId, subs] of idx.subtipos) {
    if (subs.size < MIN_HERMANOS) continue;
    // El ancla tiene que TOCAR la familia: sin esto, cualquier hallazgo del
    // repo publicaría la misma propuesta. Se comprueba antes de trabajar.
    const subsNodos: CodeGraphNode[] = [];
    let tocaAlguno = false;
    for (const s of subs) {
      const n = idx.byId.get(s);
      if (!n || n.kind !== "symbol") continue;
      subsNodos.push(n);
      if (archivosAncla.has(n.file)) tocaAlguno = true;
    }
    if (!tocaAlguno || subsNodos.length < MIN_HERMANOS) continue;

    const ancestro = idx.byId.get(ancestroId);
    if (!ancestro) continue;
    const miembrosDelAncestro = new Set<string>();
    for (const h of idx.hijos.get(ancestroId) ?? []) {
      const n = idx.byId.get(h);
      if (n?.family === "function-like") miembrosDelAncestro.add(nombreDeNodo(n));
    }

    // miembro → una declaración por unidad-tipo (la primera en orden de archivo)
    const porMiembro = new Map<string, { sub: CodeGraphNode; m: CodeGraphNode }[]>();
    for (const sub of subsNodos) {
      const vistos = new Set<string>();
      for (const h of idx.hijos.get(sub.id) ?? []) {
        const n = idx.byId.get(h);
        if (!n || n.family !== "function-like") continue;
        const nombre = nombreDeNodo(n);
        if (!nombre || CONSTRUCTOR_NAMES.has(nombre) || nombre === nombreDeNodo(sub)) continue;
        if (vistos.has(nombre)) continue;
        vistos.add(nombre);
        const l = porMiembro.get(nombre);
        if (l) l.push({ sub, m: n });
        else porMiembro.set(nombre, [{ sub, m: n }]);
      }
    }

    for (const [methodName, crudas] of [...porMiembro.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (crudas.length < MIN_HERMANOS) continue;
      // (3) LA ARIDAD TIENE QUE SER CONOCIDA Y DIFERIR. `arity === null` es
      // "la gramática no expuso lista de parámetros" (Ruby sin paréntesis),
      // NO "cero": una declaración así no participa.
      const conAridad = crudas.filter((d) => typeof d.m.arity === "number");
      if (conAridad.length < MIN_HERMANOS) continue;
      const aridades = [...new Set(conAridad.map((d) => d.m.arity as number))].sort((a, b) => a - b);
      if (aridades.length < 2) continue;

      const conPasos = conAridad
        .map((d) => ({ ...d, steps: [...(idx.pasos.get(d.m.id) ?? [])] }))
        .filter((d) => d.steps.length >= MIN_PASOS_POR_COPIA);
      if (conPasos.length < MIN_HERMANOS) continue;
      const conjuntos = conPasos.map((d) => new Set(d.steps));
      const shared = [...conjuntos[0]!].filter((n) => conjuntos.every((s) => s.has(n))).sort();
      if (shared.length < MIN_PASOS_COMUNES_GRAFO) continue;

      const decls: Declaracion[] = conPasos.map((d) => ({
        file: d.sub.file,
        unidad: nombreDeNodo(d.sub),
        arity: d.m.arity as number,
        returnType: d.m.returnType,
        startLine: d.m.startLine ?? d.sub.startLine ?? 1,
        endLine: d.m.endLine ?? d.m.startLine ?? d.sub.endLine ?? 1,
        pasos: [...new Set(d.steps)],
        unidadStart: d.sub.startLine ?? 1,
        unidadEnd: d.sub.endLine ?? 1,
      }));
      const retornos = new Set(conPasos.map((d) => d.m.returnType).filter((t): t is string => t !== undefined));
      const forma: Forma = {
        ancestor: nombreDeNodo(ancestro),
        methodName,
        decls,
        aridades,
        comunes: shared,
        // El grafo no trae el ORDEN de los pasos ni el cuerpo: las dos
        // propiedades se declaran NO OBSERVADAS y `hacen-lo-mismo` las
        // reemplaza por un piso más alto de pasos comunes en este camino.
        ordenCoincide: false,
        cortoEsSubconjunto: false,
        retornosEnDesacuerdo: retornos.size > 1,
        ancestroVisible: true,
        ancestroYaLoDeclara: miembrosDelAncestro.has(methodName),
        ancestroConMiembros: miembrosDelAncestro.size > 0,
        tocaElAncla: lineasAncla.some((r) => decls.some((d) => d.file === r.f && d.unidadStart <= r.b && r.a <= d.unidadEnd)),
        invocadaDesdeAfuera: invocacionesDesdeAfuera(graph, methodName, decls.map((d) => ({ file: d.file, unidad: d.unidad }))),
      };
      const puntaje = (forma.tocaElAncla ? 10000 : 0) + shared.length * 10 + forma.decls.length;
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = forma;
      }
    }
  }
  return mejor;
}

/* ── los checks ─────────────────────────────────────────────────────────── */

const SOURCE = "refactoring.guru — *Alternative Classes with Different Interfaces* (https://refactoring.guru/es/smells/alternative-classes-with-different-interfaces)";
const TO_CONFIRM: readonly string[] = [
  "¿las dos firmas dicen lo mismo con distintas palabras, o de verdad reciben cosas distintas? El análisis cuenta parámetros; no puede leer qué significa cada uno. Si el parámetro de más aporta información que la otra no tiene, unificar las firmas la obliga a inventarla.",
  "¿alguien LLAMA a las dos a través del ancestro? El olor duele cuando el que usa la familia tiene que saber cuál subtipo es. Si cada una se usa siempre por su tipo concreto, el costo de unificar puede ser mayor que el beneficio.",
  "¿el ancestro es editable? Declarar el contrato unificado arriba es el segundo paso; si el ancestro viene de una biblioteca, sólo queda el primero (igualar las firmas), y eso cambia el costo.",
];

type Ctx = {
  readonly forma: Forma | null;
  readonly conArbol: boolean;
  /** De dónde salió la familia: del ÁRBOL (sintaxis) o del GRAFO (aristas). */
  readonly via: "arbol" | "grafo" | "ninguna";
};

const mismoNombreEnHermanos: Check<Ctx, Graph> = {
  id: "mismo-nombre-en-hermanos",
  describe: `>=${MIN_HERMANOS} unidades-tipo distintas que declaran el mismo ancestro declaran también un miembro del mismo nombre, cada una con cuerpo`,
  run: (c) =>
    !c.forma
      ? { holds: false, evidence: c.conArbol ? "no se encontró ninguna familia con un homónimo declarado por dos hermanos, ni en el árbol ni en las aristas de herencia del grafo: no demostrado." : "ni árbol vivo para este archivo ni familia en el grafo: no demostrado." }
      : { holds: true, evidence: `${c.forma.decls.length} hermanos de "${c.forma.ancestor}" declaran "${c.forma.methodName}": ${c.forma.decls.map((d) => `${d.unidad}/${d.arity}`).join(", ")}.` },
};

const elAnclaTocaLaFamilia: Check<Ctx, Graph> = {
  id: "el-ancla-toca-la-familia",
  describe: "alguna ubicación del hallazgo cae dentro de una de esas unidades-tipo (sin esto, cualquier hallazgo del archivo publicaría la misma propuesta)",
  run: (c) =>
    !c.forma
      ? { holds: false, evidence: "sin familia: no demostrado." }
      : { holds: c.forma.tocaElAncla, evidence: c.forma.tocaElAncla ? `el hallazgo cae dentro de "${c.forma.decls.map((d) => d.unidad).join('", "')}".` : "ninguna ubicación del hallazgo cae dentro de las unidades-tipo de la familia." },
};

const firmasDivergentes: Check<Ctx, Graph> = {
  id: "las-firmas-divergen",
  describe: "las ARIDADES declaradas difieren entre hermanos: eso es lo que impide invocar la operación a través del ancestro. Un tipo de retorno divergente NO alcanza — la covarianza es normal, y en una fábrica estática el retorno TIENE que diferir",
  run: (c) => {
    if (!c.forma) return { holds: false, evidence: "sin familia: no demostrado." };
    const ok = c.forma.aridades.length > 1;
    return {
      holds: ok,
      evidence: ok
        ? `aridades ${c.forma.aridades.join(" vs ")}${c.forma.retornosEnDesacuerdo ? " y tipos de retorno escritos en desacuerdo" : ""}.`
        : `las ${c.forma.decls.length} declaraciones comparten aridad ${c.forma.aridades[0]}: no hay dos interfaces que unificar (ese caso es de "Form Template Method"), aunque los tipos de retorno escritos ${c.forma.retornosEnDesacuerdo ? "SÍ" : "no"} se contradigan.`,
    };
  },
};

const hacenLoMismo: Check<Ctx, Graph> = {
  id: "hacen-lo-mismo",
  describe: `los cuerpos comparten >=${MIN_PASOS_COMUNES} pasos invocados EN EL MISMO ORDEN y los pasos del cuerpo más corto son un subconjunto de los del más largo (sin esto es una sobrecarga legítima: dos operaciones distintas que comparten nombre)`,
  run: (c) => {
    if (!c.forma) return { holds: false, evidence: "sin familia: no demostrado." };
    // EL CAMINO POR GRAFO NO TIENE EL ORDEN NI EL CUERPO — ver el bloque "EL
    // CAMINO POR GRAFO". La evidencia que reemplaza a esas dos propiedades es
    // un piso MÁS ALTO de pasos comunes, contados sobre aristas `calls`
    // reales; no es una rama que aprueba por no poder mirar.
    if (c.via === "grafo") {
      const okG = c.forma.comunes.length >= MIN_PASOS_COMUNES_GRAFO;
      return {
        holds: okG,
        evidence: okG
          ? `${c.forma.comunes.length} símbolos invocados por TODAS las declaraciones (${c.forma.comunes.join(", ")}), leídos de las aristas \`calls\` del grafo; el orden de los pasos no es observable por esta vía y no se afirma.`
          : `${c.forma.comunes.length} símbolos invocados en común: por debajo del piso de ${MIN_PASOS_COMUNES_GRAFO} que esta vía exige.`,
      };
    }
    // TRES O MÁS DECLARACIONES: la intersección de los k cuerpos reemplaza al
    // anidamiento — ver `DECLARACIONES_SIN_ANIDAMIENTO`.
    if (c.forma.decls.length >= DECLARACIONES_SIN_ANIDAMIENTO) {
      const okK = c.forma.comunes.length >= MIN_PASOS_COMUNES_GRAFO;
      return {
        holds: okK,
        evidence: okK
          ? `${c.forma.comunes.length} pasos invocados por LAS ${c.forma.decls.length} declaraciones (${c.forma.comunes.join(", ")}); con ${c.forma.decls.length} cuerpos independientes el anidamiento no es la prueba de "hacen lo mismo" y no se afirma — la intersección de los ${c.forma.decls.length} sí.`
          : `${c.forma.comunes.length} pasos invocados por las ${c.forma.decls.length} declaraciones: por debajo del piso de ${MIN_PASOS_COMUNES_GRAFO} que una familia de ${DECLARACIONES_SIN_ANIDAMIENTO} o más exige.`,
      };
    }
    const ok = c.forma.ordenCoincide && c.forma.cortoEsSubconjunto;
    return {
      holds: ok,
      evidence: ok
        ? `${c.forma.comunes.length} pasos comunes en el mismo orden (${c.forma.comunes.join(" > ")}), y el cuerpo más corto no invoca nada que el más largo no invoque.`
        : `${c.forma.comunes.length} pasos comunes; orden coincide: ${c.forma.ordenCoincide ? "sí" : "no"}; el más corto es subconjunto del más largo: ${c.forma.cortoEsSubconjunto ? "sí" : "no"}.`,
    };
  },
};

const contratoNoUnificado: Check<Ctx, Graph> = {
  id: "el-ancestro-no-declara-ya-el-contrato",
  describe:
    "el ancestro es VISIBLE en los archivos que el hallazgo nombra, DECLARA al menos un miembro (una interfaz marcadora no es una familia por la que nadie invoca) y NO declara ya ese miembro. " +
    "Las dos mitades son requisito: si el ancestro no se ve, no se puede saber si el contrato unificado ya existe ni si el ancestro es editable, " +
    "y un `required` que aprueba porque no pudo mirar no es un `required` (`no-permissive-required.test.ts`)",
  run: (c) => {
    if (!c.forma) return { holds: false, evidence: "sin familia: no demostrado." };
    if (!c.forma.ancestroVisible) return { holds: false, evidence: `"${c.forma.ancestor}" no está entre los archivos que el hallazgo nombra: el análisis no puede mirar si ya declara "${c.forma.methodName}" ni si es editable.` };
    if (!c.forma.ancestroConMiembros) return { holds: false, evidence: `"${c.forma.ancestor}" no declara ningún miembro: es una interfaz MARCADORA, y dos tipos que sólo comparten una marca no se invocan por ella.` };
    if (c.forma.ancestroYaLoDeclara) return { holds: false, evidence: `"${c.forma.ancestor}" ya declara "${c.forma.methodName}": el contrato unificado ya existe.` };
    return { holds: true, evidence: `"${c.forma.ancestor}" es visible y NO declara "${c.forma.methodName}".` };
  },
};

/**
 * OLA AW · AW3 — EL `toConfirm` QUE SE VOLVIÓ UN HECHO, PORQUE EL GRAFO LO SABE.
 *
 * La familia le PREGUNTABA al humano: *"¿alguien LLAMA a las dos a través del
 * ancestro? El olor duele cuando el que usa la familia tiene que saber cuál
 * subtipo es."* Es la pregunta correcta, y **medí que es la que decide**: de las
 * tres falsas juzgadas en esta ola, DOS mueren exactamente ahí.
 *
 *  · `nest · Server.getPublisher` — tres transportes lo declaran con 3/3/4
 *    parámetros y los cuerpos hacen lo mismo, pero `getPublisher` se invoca
 *    SÓLO como `this.getPublisher(…)` dentro de la propia subclase
 *    (`server-mqtt.ts:141`, `server-nats.ts:156`, `server-redis.ts:147`).
 *    Nadie tiene una referencia a `Server` y le pide `getPublisher`: no hay
 *    llamada polimórfica que unificar, es un helper interno repetido.
 *  · `jenkins · ModelObjectWithChildren.doConfigSubmit` — tres endpoints web
 *    que **Stapler rutea por URL**, no por tipo. Cero llamadas en el código.
 *
 * EL HECHO, Y NO PIDE TIPOS: en el grafo, el nodo del miembro
 * (`sym:archivo#Unidad.miembro`) tiene o no tiene una arista `calls` ENTRANTE
 * cuyo origen esté FUERA de su propia unidad-tipo. Si ninguna de las
 * declaraciones de la familia la tiene, nadie la invoca desde afuera y el olor
 * no duele: la familia calla.
 *
 * SIN GRAFO NO SE AFIRMA NADA Y LA FAMILIA CALLA (`no-permissive-required`):
 * un `required` que aprueba porque no pudo mirar no es un `required`.
 */
const alguienLaInvocaDesdeAfuera: Check<Ctx, Graph> = {
  id: "alguien-la-invoca-desde-afuera",
  describe:
    "alguna de las declaraciones tiene una llamada ENTRANTE desde fuera de su propia unidad-tipo: sin eso el miembro es un helper interno repetido " +
    "(o un gancho que el framework rutea por otro lado) y no hay ninguna llamada polimórfica que unificar",
  run: (c) => {
    if (!c.forma) return { holds: false, evidence: "sin familia: no demostrado." };
    if (c.forma.invocadaDesdeAfuera === null) {
      return { holds: false, evidence: "sin grafo no se puede saber quién invoca el miembro: no demostrado." };
    }
    // DISCRIMINADOR, NO `required`, Y LA RAZÓN ESTÁ MEDIDA EN §2.5 DEL INFORME:
    // como `required` la familia quedaría MUDA cada vez que `build` corre sin
    // grafo (`analyzeFile`), que es un `required` que reprueba por no poder
    // mirar — el defecto simétrico del que `no-permissive-required.test.ts`
    // prohíbe. Los DOS brazos están contados sobre los 21 repos y el número
    // decide, no la corazonada (la Ola AS midió que la compuerta de
    // visibilidad de `Remove Dead Code` daba 0/27 CON ella y 1/30 sin ella).
    return {
      holds: c.forma.invocadaDesdeAfuera > 0,
      evidence:
        c.forma.invocadaDesdeAfuera > 0
          ? `${c.forma.invocadaDesdeAfuera} llamada(s) a "${c.forma.methodName}" desde fuera de la unidad-tipo que la declara: hay quien la usa sin ser ella misma.`
          : `ninguna llamada a "${c.forma.methodName}" desde fuera de las unidades-tipo que la declaran: es un helper interno repetido, o un gancho que el framework invoca por otro camino. No hay llamada polimórfica que unificar.`,
    };
  },
};

const aridadesContiguas: Check<Ctx, Graph> = {
  id: "aridades-contiguas",
  describe: `las aridades difieren en ${ARIDADES_CONTIGUAS}: un valor por omisión unifica las dos firmas sin tocar ningún llamador`,
  run: (c) => {
    if (!c.forma) return { holds: false, evidence: "sin familia." };
    const a = c.forma.aridades;
    const d = a.length > 1 ? a[a.length - 1]! - a[0]! : 0;
    return { holds: d === ARIDADES_CONTIGUAS, evidence: `diferencia de ${d} parámetro(s).` };
  },
};

const muchosPasosComunes: Check<Ctx, Graph> = {
  id: "muchos-pasos-comunes",
  describe: `>=${MUCHOS_PASOS_COMUNES} pasos comunes: la evidencia de que hacen lo mismo es fuerte`,
  run: (c) => (!c.forma ? { holds: false, evidence: "sin familia." } : { holds: c.forma.comunes.length >= MUCHOS_PASOS_COMUNES, evidence: `${c.forma.comunes.length} pasos comunes.` }),
};

const muchasDeclaraciones: Check<Ctx, Graph> = {
  id: "tres-o-mas-declaraciones",
  describe: `>=${MUCHAS_DECLARACIONES} hermanos declaran la operación: el que usa la familia tiene que distinguir tres casos`,
  run: (c) => (!c.forma ? { holds: false, evidence: "sin familia." } : { holds: c.forma.decls.length >= MUCHAS_DECLARACIONES, evidence: `${c.forma.decls.length} declaraciones.` }),
};

/** SIEMPRE `"ausente"` — trampa #2. */
function appliedState(c: Ctx): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "no hay una firma única para la operación",
        passed: true,
        why: c.forma
          ? `"${c.forma.methodName}" está declarada con ${c.forma.aridades.length} aridades distintas (${c.forma.aridades.join(", ")}) y "${c.forma.ancestor}" no la declara: no existe todavía un contrato que un llamador pueda usar.`
          : "sin familia.",
      },
    ],
  };
}

function buildSpec(): HypothesisSpec<Ctx, Graph> {
  return {
    pattern: "Unify Alternative Interfaces",
    ceiling: "media",
    needs: [],
    required: [mismoNombreEnHermanos, elAnclaTocaLaFamilia, firmasDivergentes, hacenLoMismo, contratoNoUnificado],
    discriminators: [aridadesContiguas, muchosPasosComunes, muchasDeclaraciones, alguienLaInvocaDesdeAfuera],
    appliedState: (c) => appliedState(c),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── la traza ───────────────────────────────────────────────────────────── */

export interface UnifyAlternativeInterfacesTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly withFile: boolean;
  readonly language: string;
  readonly ancestor: string;
  readonly methodName: string;
  readonly aridades: readonly number[];
  readonly declaraciones: number;
  readonly comunes: number;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  /** AW3 — el brazo contrafáctico: llamadas entrantes al miembro desde fuera de su unidad-tipo. */
  readonly invocadaDesdeAfuera: number | null;
  readonly diesAt: string | null;
  readonly emitted: boolean;
  /** AW3 — de dónde salió la familia. */
  readonly via?: "arbol" | "grafo" | "ninguna";
  /** AW3 — TODOS los grupos (ancestro, miembro) vistos, con dónde muere cada uno. */
  readonly familias?: readonly UaiGrupoDiag[];
  readonly archivosVistos?: readonly string[];
  readonly unidadesVistas?: number;
}

let trace: UnifyAlternativeInterfacesTraceEntry[] | null = null;
export function startUnifyAlternativeInterfacesTrace(): void {
  trace = [];
}
export function takeUnifyAlternativeInterfacesTrace(): readonly UnifyAlternativeInterfacesTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function placesOf(f: Forma): readonly RoleLocation[] {
  const ancho = Math.max(...f.decls.map((d) => d.arity));
  return f.decls.map((d) => ({
    file: d.file,
    startLine: d.startLine,
    endLine: d.endLine,
    symbol: `${d.unidad}.${f.methodName}`,
    role:
      d.arity === ancho
        ? `declara "${f.methodName}" con ${d.arity} parámetro(s) — la firma más ancha, la que sirve de contrato unificado`
        : `declara "${f.methodName}" con ${d.arity} parámetro(s): el que tiene una referencia a "${f.ancestor}" no puede invocarla igual que la de ${ancho}`,
  }));
}

export const hypothesis: HypothesisBuilder = {
  id: "unify-alternative-interfaces",
  pattern: "Unify Alternative Interfaces",
  layer: "refactorizacion",
  anchors: ["homonymous-divergent-sequence", "homonymous-divergent-construction"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const archivos = archivosDe(problem, ctx, graph);
    const formaArbol = archivos.length > 0 ? formaDe(archivos, problem, graph) : null;
    const familiasDiag: readonly UaiGrupoDiag[] = diagActivo ? (diagGrupos ?? []) : [];
    // PRECEDENCIA: el árbol manda. El grafo entra sólo donde el árbol no vio
    // nada — aditivo sobre lo que hoy emite, nunca lo pisa.
    const formaGrafo = formaArbol === null && graph !== null ? formaPorGrafo(problem, graph) : null;
    const forma = formaArbol ?? formaGrafo;
    const via: Ctx["via"] = formaArbol !== null ? "arbol" : formaGrafo !== null ? "grafo" : "ninguna";
    const c: Ctx = { forma, conArbol: ctx.file !== null, via };
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
        aridades: forma?.aridades ?? [],
        declaraciones: forma?.decls.length ?? 0,
        comunes: forma?.comunes.length ?? 0,
        checks,
        invocadaDesdeAfuera: forma?.invocadaDesdeAfuera ?? null,
        diesAt: checks.find((k) => !k.holds)?.id ?? null,
        emitted: outcome !== null,
        via,
        familias: familiasDiag,
        archivosVistos: archivos.map((a) => a.file.path),
        unidadesVistas: archivos.reduce((n, a) => n + unidadesDe(a.file, a.sets).length, 0),
      });
    }
    if (!outcome || !forma) return null;
    const ancho = Math.max(...forma.decls.map((d) => d.arity));
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(forma),
      cost:
        `Igualar las ${forma.decls.length} firmas de "${forma.methodName}" en la más ancha (${ancho} parámetro(s)), con valor por omisión para los que sobran, ` +
        `y declarar la operación una sola vez en "${forma.ancestor}". Los cuerpos no cambian. El trabajo real es decidir qué significa el parámetro de más ` +
        "para el hermano que hoy no lo tiene: si no significa nada, el valor por omisión alcanza; si significa algo, la unificación es un cambio de diseño y no una refactorización.",
    });
  },
};
