/**
 * Extract Class (campos temporales) — Ola AW, frente AW2.
 *
 * ── EL HUECO, CON SU NÚMERO ───────────────────────────────────────────────
 * `temporary-field` es el detector con la mayor población del catálogo
 * después de `long-function` —**489 hallazgos sobre 21 repos**, 64,8 % de
 * precisión— y **el único remedio que se le construyó jamás emitió cero**:
 * la Ola AU (frente AU5) escribió `Replace Temp Field with Parameter`, lo
 * midió sobre 580 candidatos y publicó **0 emisiones**, con el embudo
 * completo y los siete defectos arreglados uno por uno. Su conclusión, en
 * sus palabras: *«el remedio que `temporary-field` necesita es el que su
 * propio `advice.primary` ya nombra —Extract Class— y sigue sin hipótesis»*.
 * El propio `detect/intra-file/temporary-field.ts` lo dice en su
 * `advice.primary`: `name: "Extract Class"`.
 *
 * Este archivo lo construye, y la señal de dónde buscarlo salió del embudo
 * de AU5, no de una intuición: la última compuerta que AU5 tuvo que agregar
 * —`es-un-campo-solo`— **existe para apartar exactamente este caso**, y la
 * apartó nombrándolo (`Ghost · DragDropHandler._onMouseDown` llena
 * `grabbedElement` **y** `sourceContainer`; `sqlalchemy ·
 * _ORMSelectCompileState._setup_for_generate` llena `order_by`, `statement`
 * y `correlate` juntos).
 *
 * ── LA FORMA, Y POR QUÉ NO ES «pasarlo por parámetro» ─────────────────────
 * Fowler describe el olor así: *un campo que sólo tiene valor durante una
 * operación*. Cuando el campo es UNO, lo escondido es una variable de
 * trabajo y el remedio mecánico es pasarla por la cadena de llamadas — eso
 * es lo que AU5 midió y no aparece en código real. Cuando los campos son
 * VARIOS y **nacen en el mismo miembro y mueren en el mismo miembro**, lo
 * escondido no es un valor: es un OBJETO con una vida propia más corta que
 * la del objeto que lo aloja.
 *
 *     class MainWindow {                       class MainWindow {
 *       Task? _thumbnailDragFileTask;            ThumbnailDrag? _drag;
 *       Pointer? _thumbnailDragPointer;   ⇒      void PrepareThumbnailDrag(…) {
 *       Control? _thumbnailDragSource;             _drag = new ThumbnailDrag(…);
 *       Point? _thumbnailDragTrigger;            }
 *       void PrepareThumbnailDrag(…) { …4 asignaciones… }
 *       void ClearThumbnailDrag()    { …4 asignaciones a null… }
 *     }
 *
 * ── LA PRECONDICIÓN, QUE ES UN HECHO Y SE VERIFICA ABRIENDO EL ARCHIVO ────
 * La regla de la Ola AS: la precondición tiene que ser (1) un HECHO, (2)
 * VISIBLE EN LO QUE EL ANALIZADOR CARGA y (3) suficiente para que sea un
 * PROBLEMA y no sólo una FORMA. Las cinco condiciones se cuentan sobre el
 * árbol de ESTE archivo, sin grafo, sin tipos y sin resolución cruzada:
 *
 *   (1) **Hay un racimo**: >= 2 campos de la misma unidad-tipo tienen el
 *       ciclo llenar/vaciar fuera del constructor (la definición del propio
 *       ancla) **y los llena EL MISMO miembro**. Nacer juntos es lo que los
 *       hace un objeto y no dos variables sueltas.
 *   (2) **Un solo llenador por campo.** Con dos, el campo tiene dos puntos
 *       de entrada y no es una fase de una operación: es estado compartido.
 *       Es la compuerta que aparta los internos de una colección — medida
 *       sobre los volcados de AU5: mata los racimos de `CompactHashMap`,
 *       `CompactHashSet`, `CompactLinkedHashSet` y `HashBiMap` de guava,
 *       donde `table`/`entries`/`keys`/`values` los llenan de 2 a 5 miembros
 *       cada uno, y los de `ClientMqtt`/`ClientTCP`/`ClientNats` de nest,
 *       donde la conexión se rellena desde dos caminos.
 *   (3) **Mueren juntos**: un mismo miembro vacía >= 2 campos del racimo.
 *       Un racimo que nace junto pero se apaga campo por campo no tiene una
 *       vida común que un objeto pueda representar.
 *   (4) **El constructor no los llena.** Si lo hace, el campo es parte de la
 *       identidad del objeto desde que nace y no hay vida más corta que
 *       extraer.
 *   (5) **La clase tiene OTROS campos.** Si el racimo es toda la clase, la
 *       clase YA ES el objeto extraído y recomendar extraerlo sería
 *       recomendar lo que ya está puesto — trampa #3 en su forma más simple.
 *
 * ── TRAMPA #3: EL REMEDIO PUEDE YA ESTAR APLICADO ─────────────────────────
 * *De 21 casos en disputa de la Ola AP, en SIETE la solución YA EXISTÍA en
 * el código.* Acá la solución aplicada es literal —los campos viven en un
 * objeto propio y la clase guarda UNA referencia— y en ese caso hay **un
 * solo campo** en el racimo, no dos: `MIN_CAMPOS_DEL_RACIMO` es la
 * verificación. La forma intermedia —la clase ya extrajo PARTE del racimo—
 * la corta la condición (5): lo que queda tiene que convivir con otros
 * campos de la clase.
 *
 * ── TRAMPA #2: NO SE LE PUEDE BORRAR LA PROPUESTA A `State` ───────────────
 * `state.ts` (uno de los 19 patrones CONGELADOS) ancla en `temporary-field`
 * y emite 356 propuestas. `engine.ts#arbitrateRivalHypotheses:333-347` retira
 * una oportunidad sólo cuando otro patrón sobre el MISMO `Finding` está en
 * `ya-aplicado`/`aplicado-eludido`. **`appliedState` de esta familia devuelve
 * SIEMPRE `"ausente"`**, así que no puede aparecer en `overlappingRivals` y
 * no puede retirarle nada a nadie. Lo verifica un test propio y lo publica la
 * corrida.
 *
 * ── UNA PROPUESTA POR RACIMO, NO UNA POR CAMPO ────────────────────────────
 * Un racimo de cuatro campos son CUATRO `Finding` de `temporary-field`. Si
 * la familia emitiera sobre los cuatro, publicaría la misma recomendación
 * cuatro veces. Emite sólo sobre el hallazgo del campo **primero en orden
 * alfabético** del racimo —el mismo orden con el que `temporary-field.ts`
 * calcula su `ordinal`, así que es estable entre corridas— y nombra a los
 * otros en sus `places`.
 *
 * ── LENGUAJES ─────────────────────────────────────────────────────────────
 * `needs: []`. Ni una constante nombra un lenguaje. El acceso a un campo
 * propio se reconoce por las tres vías que `detect/intra-file/
 * temporary-field.ts` ya documenta con sonda directa contra los `.wasm`: el
 * token con sigilo de Ruby (`instance_variable`), el receptor explícito
 * (`this`/`self` y el parámetro receptor de Go) y el identificador DESNUDO
 * que la unidad-tipo declara como campo (el idiom de Java/C#). Es la misma
 * lectura que dejó a `state.ts#SELF_PREFIX` ciego durante tres olas,
 * resuelta por DECLARACIÓN y no por prefijo.
 *
 * DUPLICACIÓN DECLARADA: toda la mitad de lectura del árbol de este archivo
 * (`namedChildren`, `objectOf`, `memberNameOf`, `selfFieldNameOf`,
 * `declaredFieldNames`, `goReceiverOf`, `isNullLiteral`, `parameterNamesOf`,
 * `statementsOf`, `callNamesOf` y `analizarArchivo`) es la MISMA copia que
 * `replace-temp-field-with-parameter.ts` (Ola AU, AU5) declara frente a
 * `detect/intra-file/temporary-field.ts`: `hypotheses/*` no puede importar de
 * `detect/intra-file/*` (el detector no exporta sus helpers) y no existe un
 * módulo de primitivas compartido. Se copia y se dice, igual que esos dos
 * archivos. Los siete defectos que AU5 midió y arregló sobre esa mitad
 * —receptor propio en las llamadas, asignación dentro de un bucle, rango del
 * lector, sombreado por parámetro— vienen incluidos.
 */
import { CONSTRUCTOR_NAMES } from "../code-grammar.js";
import type { AstNode, FileUnit, Finding, RoleLocation } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/* ── umbrales de FORMA (ninguno es una magnitud calibrada) ───────────────── */

/**
 * Dos campos ya son un racimo. No es un piso elegido: es la definición del
 * problema — UN campo temporal es una variable de trabajo (y ahí el remedio
 * es una local o un parámetro, la familia que la Ola AU midió en 0/580);
 * DOS campos que nacen y mueren juntos son un OBJETO escondido, porque
 * comparten una vida y la clase que los aloja tiene que tolerar los dos
 * huecos a la vez.
 */
const MIN_CAMPOS_DEL_RACIMO = 2;

/**
 * Un solo miembro puede llenar cada campo del racimo. Con dos, el campo tiene
 * dos puntos de entrada y no es una fase de una operación: es estado
 * compartido de la clase. Es el MISMO número y la MISMA razón que
 * `replace-temp-field-with-parameter.ts#MAX_LLENADORES` (Ola AU, AU5), y es
 * la compuerta que separa el racimo escondido de los internos de una
 * colección — medida: mata los cuatro racimos de `CompactHashMap`/
 * `CompactHashSet`/`CompactLinkedHashSet`/`HashBiMap` de guava, donde
 * `table`/`entries`/`keys`/`values` los llenan entre 2 y 5 miembros cada uno.
 */
const MAX_LLENADORES_POR_CAMPO = 1;

/**
 * Cuántos campos del racimo tiene que vaciar UN MISMO miembro para que se
 * pueda decir que "mueren juntos". Dos: la misma razón que
 * `MIN_CAMPOS_DEL_RACIMO`, del otro lado del ciclo.
 */
const MIN_CAMPOS_VACIADOS_JUNTOS = 2;

/** Un racimo de esto o más ya no es una pareja: es un objeto con varias partes. */
const RACIMO_GRANDE = 3;

/* ── vocabulario de GRAMÁTICA (idéntico para los nueve lenguajes) ────────── */

const SELF_WORDS = new Set(["this", "self"]);
const RUBY_IVAR_TYPE = "instance_variable";
const OBJECT_FIELDS = ["object", "operand"];
const COMMENT_NODE_TYPE = /comment/i;
const NULL_NODE_TYPE = /^(null|nil|none|null_literal|undefined)$/i;
const NULL_WORD = /^(null|nil|none|undefined)$/i;
const FIELD_DECL_NODE_TYPE = /(^|_)(field|property)_(declaration|definition)$/;
const CALL_NODE_WORD = /(^|_)(call|invocation)(_|$)/;
const CALLEE_FIELDS = ["function", "name", "method"];
const BLOCK_WORD = /(^|_)(block|body|statement_list|suite|compound_statement)(_|$)/;
/** Vocabulario de bucle — el mismo de `code-grammar.ts#LOOP_WORD`. */
const LOOP_WORD = /(^|_)(while|until|for|do|loop|each)(_|$)/;
const PARAMS_WORD = /(^|_)(parameters|block_parameters|parameter_list)(_|$)/;

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

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function findAllDescendants(node: AstNode, pred: (n: AstNode) => boolean, maxDepth: number, out: AstNode[]): void {
  if (pred(node)) out.push(node);
  if (maxDepth <= 0) return;
  for (const c of namedChildren(node)) findAllDescendants(c, pred, maxDepth - 1, out);
}

function findDescendant(node: AstNode, pred: (n: AstNode) => boolean, maxDepth = 8): AstNode | null {
  if (pred(node)) return node;
  if (maxDepth <= 0) return null;
  for (const c of namedChildren(node)) {
    const hit = findDescendant(c, pred, maxDepth - 1);
    if (hit) return hit;
  }
  return null;
}

function isAssignmentLike(node: AstNode): boolean {
  return hasField(node, "left") && hasField(node, "right");
}

function unwrapSingleChild(node: AstNode): AstNode {
  const kids = namedChildren(node);
  return kids.length === 1 ? unwrapSingleChild(kids[0]!) : node;
}

function objectOf(node: AstNode): AstNode | null {
  for (const f of OBJECT_FIELDS) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

function memberNameOf(node: AstNode): string | null {
  const obj = objectOf(node);
  if (!obj) return null;
  for (let i = node.childCount - 1; i >= 0; i--) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && c !== obj) return c.text;
  }
  return null;
}

function selfFieldNameOf(node: AstNode, selfNames: ReadonlySet<string>, declaredFields: ReadonlySet<string>): string | null {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  const obj = objectOf(node);
  if (obj && selfNames.has(obj.text)) return memberNameOf(node);
  if (node.type === "identifier" && declaredFields.has(node.text)) return node.text;
  return null;
}

function isNullLiteral(node: AstNode): boolean {
  if (NULL_NODE_TYPE.test(node.type)) return true;
  return NULL_WORD.test(node.text.trim());
}

function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  const typeNode = findDescendant(decl, (n) => n.type === "type_identifier", 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}

function declaredFieldNames(classNode: AstNode): Set<string> {
  const names = new Set<string>();
  const decls: AstNode[] = [];
  findAllDescendants(classNode, (n) => FIELD_DECL_NODE_TYPE.test(n.type), 3, decls);
  for (const decl of decls) {
    const declarators: AstNode[] = [];
    findAllDescendants(decl, (n) => /declarator$/.test(n.type), 3, declarators);
    if (declarators.length > 0) {
      for (const d of declarators) {
        const name = (d.childForFieldName("name") as AstNode | null)?.text ?? namedChildren(d)[0]?.text ?? null;
        if (name) names.add(name);
      }
      continue;
    }
    const name = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
    if (name) names.add(name);
  }
  return names;
}

function parameterNamesOf(fnNode: AstNode): Set<string> {
  const names = new Set<string>();
  const paramsNode = (fnNode.childForFieldName("parameters") as AstNode | null) ?? namedChildren(fnNode).find((c) => PARAMS_WORD.test(c.type)) ?? null;
  if (!paramsNode) return names;
  const idents: AstNode[] = [];
  findAllDescendants(paramsNode, (n) => /identifier$/.test(n.type), 4, idents);
  for (const id of idents) names.add(id.text);
  return names;
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
 * Los nombres que este cuerpo INVOCA **SOBRE SÍ MISMO**, sin deduplicar y en
 * orden. El receptor decide, y no es un detalle: sin este filtro,
 * `_comparisonResult?.Dispose()` contaba como una llamada al miembro propio
 * `Dispose()` —la clase declara uno— y el campo pasaba la compuerta de cadena
 * con un lector que en realidad es OTRO punto de entrada. Medido en
 * `ShareX · ShareX.Tools/Tools/ImageComparer/ImageComparerViewModel.cs:215`.
 *
 * Es la trampa #1 en su otro sentido: no un lenguaje mudo, sino un lenguaje
 * que afirma de más — la misma que AT4 documentó para el `receiver` de Ruby.
 *
 * La lectura es de FORMA y vale en las nueve gramáticas: si el texto del
 * callee trae un separador de miembro, lo que está ANTES del último separador
 * tiene que ser el receptor propio (`this`/`self`, el token con sigilo de Ruby
 * o el parámetro receptor de Go); si no trae separador, es una llamada
 * desnuda y cuenta.
 */
const MEMBER_SEP = /[.:]|->|\?\./;

const RECEIVER_FIELDS = ["object", "receiver", "operand"];

function calleeOwnerText(callNode: AstNode): string | null {
  // JAVA Y RUBY PRIMERO: exponen `object`/`receiver` EN EL PROPIO NODO DE
  // LLAMADA, no un `function` que sea un acceso a miembro (el mismo defecto
  // que AT4 midió en `calleeParts`). Sin esta rama, `iterator.remove()` se lee
  // como la llamada DESNUDA `remove()`.
  for (const field of RECEIVER_FIELDS) {
    const r = callNode.childForFieldName(field) as AstNode | null;
    if (r) return r.text.trim();
  }
  for (const field of CALLEE_FIELDS) {
    const callee = callNode.childForFieldName(field) as AstNode | null;
    if (!callee) continue;
    const text = callee.text.trim();
    const partes = text.split(/\?\.|->|::|\./);
    if (partes.length <= 1) return "";
    return partes.slice(0, -1).join(".").trim();
  }
  return null;
}

function callNamesOf(body: AstNode, selfNames: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const visit = (n: AstNode): void => {
    if (CALL_NODE_WORD.test(n.type)) {
      const name = calleeName(n);
      const owner = calleeOwnerText(n);
      if (name && owner !== null && (owner === "" || selfNames.has(owner))) out.push(name);
    }
    for (const c of namedChildren(n)) visit(c);
  };
  visit(body);
  return out;
}

/** Las sentencias de nivel superior de un cuerpo — mismo desenvuelto que `split-phase.ts`. */
function statementsOf(node: AstNode): AstNode[] {
  const keep = (c: AstNode): boolean => !PARAMS_WORD.test(c.type);
  let cursor = node;
  for (let i = 0; i < 3; i++) {
    const kids = namedChildren(cursor).filter(keep);
    if (kids.length === 1 && BLOCK_WORD.test(kids[0]!.type)) cursor = kids[0]!;
    else break;
  }
  return namedChildren(cursor).filter(keep);
}

/* ── el modelo: una unidad-tipo con sus miembros ─────────────────────────── */

interface Escritura {
  readonly field: string;
  readonly metodo: string;
  readonly esConstructor: boolean;
  readonly aNulo: boolean;
  readonly startLine: number;
  readonly endLine: number;
  /** Índice de la sentencia de NIVEL SUPERIOR que la contiene; -1 si está anidada. */
  readonly indiceSuperior: number;
  readonly sentenciasDelMetodo: number;
  /** La asignación está dentro de un bucle del método: no es "al empezar". */
  readonly enBucle: boolean;
}

interface Miembro {
  readonly nombre: string;
  readonly esConstructor: boolean;
  readonly startLine: number;
  readonly endLine: number;
  /** Nombres invocados que son miembros de la MISMA unidad-tipo. */
  readonly llamaA: ReadonlySet<string>;
}

interface Unidad {
  readonly nombre: string;
  readonly clave: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly miembros: Miembro[];
  readonly escrituras: Escritura[];
  /** campo → miembros que lo LEEN sin escribirlo. */
  readonly lectores: Map<string, Set<string>>;
}

function analizarArchivo(file: FileUnit): Unidad[] {
  const unidades = new Map<string, Unidad>();
  const pendientes: { unidad: Unidad; nombre: string; llamadas: string[] }[] = [];

  const obtener = (nombre: string, clave: string, node: AstNode): Unidad => {
    const previa = unidades.get(clave);
    if (previa) return previa;
    const nueva: Unidad = {
      nombre,
      clave,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      miembros: [],
      escrituras: [],
      lectores: new Map(),
    };
    unidades.set(clave, nueva);
    return nueva;
  };

  const visit = (node: AstNode, cls: { name: string; key: string; fields: ReadonlySet<string>; node: AstNode } | null): void => {
    let nextCls = cls;
    if (file.sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
      nextCls = { name, key: `${name}@${node.startPosition.row}`, fields: declaredFieldNames(node), node };
    } else if (file.sets.functionNodes.has(node.type)) {
      const goReceiver = goReceiverOf(node);
      const selfNames = new Set(SELF_WORDS);
      let methodCls = nextCls;
      if (goReceiver) {
        selfNames.add(goReceiver.paramName);
        methodCls = { name: goReceiver.typeName, key: `receiver:${goReceiver.typeName}`, fields: new Set<string>(), node };
      }
      const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
      const methodName = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
      if (body && methodCls) {
        const unidad = obtener(methodCls.name, methodCls.key, methodCls.node);
        const esCtor = file.sets.constructorNodes.has(node.type) || CONSTRUCTOR_NAMES.has(methodName) || methodName === methodCls.name;
        const shadowed = parameterNamesOf(node);
        const visibles = new Set([...methodCls.fields].filter((f) => !shadowed.has(f)));

        const superiores = statementsOf(body);
        const indiceDe = (line: number): number => {
          for (let i = 0; i < superiores.length; i++) {
            const s = superiores[i]!;
            if (s.startPosition.row + 1 <= line && line <= s.endPosition.row + 1) return i;
          }
          return -1;
        };

        // Las asignaciones que caen DENTRO de un bucle de este cuerpo: un campo
        // que se reasigna en cada vuelta no se "llena al empezar la operación",
        // es una variable rodante. Medido en `ShareX ·
        // ScrollingCaptureManager.cs:123/181` (`lastScreenshot`/
        // `previousScreenshot`, un búfer de dos ranuras que vive entre vueltas).
        const bucles: AstNode[] = [];
        findAllDescendants(body, (n) => LOOP_WORD.test(n.type), 12, bucles);
        const enBucleLinea = (line: number): boolean =>
          bucles.some((b) => b.startPosition.row + 1 <= line && line <= b.endPosition.row + 1);

        const asignaciones: AstNode[] = [];
        findAllDescendants(body, isAssignmentLike, 12, asignaciones);
        const escritos = new Set<string>();
        for (const assign of asignaciones) {
          const leftRaw = assign.childForFieldName("left") as AstNode | null;
          const rightRaw = assign.childForFieldName("right") as AstNode | null;
          if (!leftRaw || !rightRaw) continue;
          const left = unwrapSingleChild(leftRaw);
          const right = unwrapSingleChild(rightRaw);
          const field = selfFieldNameOf(left, selfNames, visibles);
          if (!field) continue;
          const aNulo = isNullLiteral(right);
          if (!aNulo) {
            const soloSeLee = selfFieldNameOf(right, selfNames, visibles) === field || (right.type === "identifier" && right.text === field);
            if (soloSeLee) continue;
          }
          const operator = (assign.childForFieldName("operator") as AstNode | null)?.text ?? "=";
          if (operator !== "=" && operator !== ":=") continue;
          escritos.add(field);
          unidad.escrituras.push({
            field,
            metodo: methodName,
            esConstructor: esCtor,
            aNulo,
            startLine: assign.startPosition.row + 1,
            endLine: assign.endPosition.row + 1,
            indiceSuperior: indiceDe(assign.startPosition.row + 1),
            sentenciasDelMetodo: superiores.length,
            enBucle: enBucleLinea(assign.startPosition.row + 1),
          });
        }

        const accesos: AstNode[] = [];
        findAllDescendants(body, (n) => selfFieldNameOf(n, selfNames, visibles) !== null, 12, accesos);
        for (const acceso of accesos) {
          const field = selfFieldNameOf(acceso, selfNames, visibles);
          if (!field || escritos.has(field)) continue;
          const set = unidad.lectores.get(field) ?? new Set<string>();
          set.add(methodName);
          unidad.lectores.set(field, set);
        }

        pendientes.push({ unidad, nombre: methodName, llamadas: callNamesOf(body, selfNames) });
        unidad.miembros.push({
          nombre: methodName,
          esConstructor: esCtor,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          llamaA: new Set<string>(),
        });
      }
    }
    for (const c of namedChildren(node)) visit(c, nextCls);
  };
  visit(file.root, null);

  // Segunda pasada: `llamaA` restringido a miembros de la MISMA unidad-tipo.
  for (const p of pendientes) {
    const propios = new Set(p.unidad.miembros.map((m) => m.nombre));
    const destino = p.unidad.miembros.find((m) => m.nombre === p.nombre);
    if (!destino) continue;
    for (const nombre of p.llamadas) if (propios.has(nombre) && nombre !== p.nombre) (destino.llamaA as Set<string>).add(nombre);
  }

  return [...unidades.values()];
}

/* ── el racimo ───────────────────────────────────────────────────────────── */

interface CampoDelRacimo {
  readonly nombre: string;
  readonly llenadores: readonly string[];
  readonly vaciadores: readonly string[];
  readonly lectores: readonly string[];
  readonly llenaEnLinea: number;
  readonly constructorLoLlena: boolean;
}

interface Racimo {
  readonly file: string;
  readonly unidad: string;
  readonly unidadStart: number;
  readonly unidadEnd: number;
  /** El miembro que llena TODOS los campos del racimo. */
  readonly llenador: string;
  readonly llenadorStart: number;
  readonly llenadorEnd: number;
  readonly campos: readonly CampoDelRacimo[];
  /** Miembros que vacían >= 2 campos del racimo, con cuántos vacía cada uno. */
  readonly vaciadoresJuntos: readonly { readonly nombre: string; readonly cuantos: number; readonly startLine: number; readonly endLine: number }[];
  /** Miembros que leen algún campo del racimo sin escribirlo, sin contar al llenador. */
  readonly lectores: readonly string[];
  readonly rangoMiembro: Readonly<Record<string, { readonly startLine: number; readonly endLine: number }>>;
  /** Campos de la unidad-tipo que NO están en el racimo (los que se quedan). */
  readonly otrosCampos: readonly string[];
  /** Campos del racimo con más de un llenador — la condición (2). */
  readonly camposConVariosLlenadores: readonly string[];
  /** El campo del racimo que el ancla señala, o `null` si el ancla no cae en ninguno. */
  readonly campoDelAncla: string | null;
  /** El primero en orden alfabético: el único hallazgo del racimo que emite. */
  readonly campoQueEmite: string;
  readonly miembrosDeLaUnidad: number;
  readonly miembrosQueTocanElRacimo: number;
}

/**
 * Los campos de la unidad-tipo con el ciclo COMPLETO fuera del constructor
 * —la misma condición con la que `detect/intra-file/temporary-field.ts`
 * construye su hallazgo—, agrupados por el miembro que los llena.
 */
function racimosDe(file: FileUnit, unidad: Unidad): Racimo[] {
  const campos = new Set(unidad.escrituras.map((e) => e.field));
  const porLlenador = new Map<string, CampoDelRacimo[]>();
  const todosLosCamposTemporales: string[] = [];

  for (const campo of [...campos].sort()) {
    const escrituras = unidad.escrituras.filter((e) => e.field === campo);
    const fuera = escrituras.filter((e) => !e.esConstructor);
    const llena = fuera.filter((e) => !e.aNulo);
    const vacia = fuera.filter((e) => e.aNulo);
    if (llena.length === 0 || vacia.length === 0) continue; // no es la forma que el ancla nombra
    todosLosCamposTemporales.push(campo);
    const llenadores = [...new Set(llena.map((e) => e.metodo))].sort();
    const c: CampoDelRacimo = {
      nombre: campo,
      llenadores,
      vaciadores: [...new Set(vacia.map((e) => e.metodo))].sort(),
      lectores: [...(unidad.lectores.get(campo) ?? new Set<string>())].sort(),
      llenaEnLinea: llena[0]!.startLine,
      constructorLoLlena: escrituras.some((e) => e.esConstructor && !e.aNulo),
    };
    // El racimo se agrupa por el PRIMER llenador del campo. Un campo con más
    // de un llenador entra igual —para que la compuerta (2) lo pueda contar y
    // publicar—, nunca se descarta en silencio.
    const clave = llenadores[0]!;
    const lista = porLlenador.get(clave) ?? [];
    lista.push(c);
    porLlenador.set(clave, lista);
  }

  const rangoMiembro: Record<string, { startLine: number; endLine: number }> = {};
  for (const m of unidad.miembros) rangoMiembro[m.nombre] ??= { startLine: m.startLine, endLine: m.endLine };

  const salida: Racimo[] = [];
  for (const [llenador, lista] of porLlenador) {
    if (lista.length < MIN_CAMPOS_DEL_RACIMO) continue;
    const nombres = new Set(lista.map((c) => c.nombre));

    // Quién vacía VARIOS del racimo a la vez.
    const cuenta = new Map<string, number>();
    for (const c of lista) for (const v of c.vaciadores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
    const vaciadoresJuntos = [...cuenta.entries()]
      .filter(([, n]) => n >= MIN_CAMPOS_VACIADOS_JUNTOS)
      .map(([nombre, cuantos]) => ({ nombre, cuantos, startLine: rangoMiembro[nombre]?.startLine ?? 0, endLine: rangoMiembro[nombre]?.endLine ?? 0 }))
      .sort((a, b) => b.cuantos - a.cuantos || a.nombre.localeCompare(b.nombre));

    const lectores = [...new Set(lista.flatMap((c) => c.lectores))].filter((n) => n !== llenador).sort();
    const tocan = new Set<string>([llenador, ...lectores, ...lista.flatMap((c) => [...c.llenadores, ...c.vaciadores])]);
    const otrosCampos = todosLosCamposTemporales.filter((f) => !nombres.has(f));
    const rango = rangoMiembro[llenador] ?? { startLine: unidad.startLine, endLine: unidad.endLine };

    salida.push({
      file: file.path,
      unidad: unidad.nombre,
      unidadStart: unidad.startLine,
      unidadEnd: unidad.endLine,
      llenador,
      llenadorStart: rango.startLine,
      llenadorEnd: rango.endLine,
      campos: lista,
      vaciadoresJuntos,
      lectores,
      rangoMiembro,
      otrosCampos,
      camposConVariosLlenadores: lista.filter((c) => c.llenadores.length > MAX_LLENADORES_POR_CAMPO).map((c) => c.nombre),
      campoDelAncla: null,
      campoQueEmite: [...nombres].sort()[0]!,
      miembrosDeLaUnidad: unidad.miembros.length,
      miembrosQueTocanElRacimo: tocan.size,
    });
  }
  return salida;
}

/**
 * OTROS campos de la unidad-tipo que NO son temporales. La condición (5)
 * pregunta si la clase tiene ALGO más que el racimo: si el racimo es toda la
 * clase, la clase ya ES el objeto extraído.
 */
function camposNoTemporalesDe(unidad: Unidad, delRacimo: ReadonlySet<string>): string[] {
  const todos = new Set<string>();
  for (const e of unidad.escrituras) todos.add(e.field);
  for (const f of unidad.lectores.keys()) todos.add(f);
  return [...todos].filter((f) => !delRacimo.has(f)).sort();
}

/** El racimo de la unidad-tipo que el ancla señala. */
function racimoDe(file: FileUnit, problem: Finding): Racimo | null {
  const lineasAncla = problem.locations.filter((l) => l.file === file.path).map((l) => ({ a: l.startLine, b: l.endLine }));
  // AW2, DEFECTO ENCONTRADO Y ARREGLADO CON EL TEST DE LOS SEIS LENGUAJES: el
  // solape de LÍNEAS no alcanza para saber a qué campo apunta el ancla cuando
  // dos campos del racimo se asignan en la MISMA línea
  // (`start() { this.consumer = mk(); this.producer = mk(); }`, el idiom de
  // una sola línea de TS/JS/Java/C#). Ahí los dos hallazgos del racimo se
  // creían "el que emite" y la familia publicaba la MISMA recomendación dos
  // veces. El desempate no es texto del código del usuario: es el `role` que
  // `detect/intra-file/temporary-field.ts` escribe con el nombre del campo
  // entre acentos graves (`` llena `consumer` (`Server#start`, sitio 1 de 2) ``)
  // — contrato de nuestra propia salida, no vocabulario de dominio.
  const rolesAncla = problem.locations.filter((l) => l.file === file.path).map((l) => l.role ?? "");
  const nombraElRole = (campo: string): boolean => rolesAncla.some((r) => r.includes(`\`${campo}\``));
  let mejor: Racimo | null = null;

  for (const unidad of analizarArchivo(file)) {
    for (const r of racimosDe(file, unidad)) {
      const nombres = new Set(r.campos.map((c) => c.nombre));
      // ¿Cuál de los campos del racimo señala el ancla? Se compara por
      // solape de líneas con las asignaciones de ESE campo, igual que
      // `replace-temp-field-with-parameter.ts#tocaElAncla`.
      let campoDelAncla: string | null = null;
      const porRole = r.campos.filter((c) => nombraElRole(c.nombre));
      if (porRole.length === 1) {
        campoDelAncla = porRole[0]!.nombre;
      } else {
        for (const c of r.campos) {
          const escrituras = unidad.escrituras.filter((e) => e.field === c.nombre);
          if (lineasAncla.some((rg) => escrituras.some((e) => e.startLine <= rg.b && rg.a <= e.endLine))) {
            campoDelAncla ??= c.nombre;
          }
        }
      }
      const conAncla: Racimo = { ...r, campoDelAncla, otrosCampos: camposNoTemporalesDe(unidad, nombres) };
      const puntaje = (campoDelAncla ? 1000 : 0) + conAncla.campos.length;
      const puntajeMejor = mejor ? (mejor.campoDelAncla ? 1000 : 0) + mejor.campos.length : -1e9;
      if (puntaje > puntajeMejor) mejor = conAncla;
    }
  }
  return mejor;
}

/* ── los checks ─────────────────────────────────────────────────────────── */

const SOURCE =
  "Fowler, *Refactoring*, «Extract Class» sobre el olor *Temporary Field* — el mismo remedio que " +
  "`detect/intra-file/temporary-field.ts` ya nombra en su `advice.primary` (https://refactoring.guru/es/smells/temporary-field)";

const TO_CONFIRM: readonly string[] = [
  "¿los campos del racimo son la representación deliberada de una estructura de datos (los arreglos paralelos de una tabla hash, la cabeza y la cola de una lista, un búfer de N ranuras)? Ahí el objeto ya existe conceptualmente y separarlo cuesta una asignación por operación — es exactamente el código escrito para evitarla.",
  "¿algún archivo FUERA de éste lee o escribe estos campos? El análisis mira una sola unidad de traducción: un escritor externo agrega un punto de entrada que la compuerta de «un solo llenador» no puede ver.",
  "¿los campos se serializan, se reflejan o los llena un framework por nombre (un ORM, un binder de vistas, un deserializador)? Eso no está en el árbol y mudarlos rompería en runtime sin que nada se ponga rojo.",
  "¿el racimo son campos que YA son objetos propios y el miembro sólo los reasigna en bloque (una tanda de settings, una tanda de sub-servicios)? Ahí no hay un objeto escondido: ya están extraídos, y lo que se repite es la asignación.",
];

type Ctx = {
  readonly racimo: Racimo | null;
  readonly conArbol: boolean;
};

const hayUnRacimo: Check<Ctx, Graph> = {
  id: "hay-un-racimo-de-campos-temporales",
  describe: `en la unidad-tipo del hallazgo hay >= ${MIN_CAMPOS_DEL_RACIMO} campos con el ciclo llenar/vaciar fuera del constructor que llena EL MISMO miembro, y el ancla señala uno de ellos`,
  run: (c) => {
    if (!c.racimo) return { holds: false, evidence: c.conArbol ? "ninguna unidad-tipo de este archivo tiene dos campos temporales que llene el mismo miembro: no demostrado." : "sin árbol vivo para este archivo: no demostrado." };
    if (!c.racimo.campoDelAncla) {
      return { holds: false, evidence: `el racimo de \`${c.racimo.unidad}#${c.racimo.llenador}\` (${c.racimo.campos.map((x) => x.nombre).join(", ")}) no cae en ninguna de las líneas del hallazgo: no es el campo que el ancla nombra.` };
    }
    return {
      holds: true,
      evidence: `\`${c.racimo.unidad}\`: ${c.racimo.campos.length} campos (${c.racimo.campos.map((x) => x.nombre).join(", ")}) los llena \`${c.racimo.llenador}\` y todos se vacían fuera del constructor. El ancla señala \`${c.racimo.campoDelAncla}\`.`,
    };
  },
};

const unSoloLlenadorPorCampo: Check<Ctx, Graph> = {
  id: "un-solo-llenador-por-campo",
  describe: `ningún campo del racimo lo llena más de ${MAX_LLENADORES_POR_CAMPO} miembro (con dos, el campo tiene dos puntos de entrada y es estado compartido de la clase, no una fase de una operación)`,
  run: (c) =>
    !c.racimo
      ? { holds: false, evidence: "sin racimo: no demostrado." }
      : {
          holds: c.racimo.camposConVariosLlenadores.length === 0,
          evidence:
            c.racimo.camposConVariosLlenadores.length === 0
              ? `los ${c.racimo.campos.length} campos tienen un solo llenador (\`${c.racimo.llenador}\`).`
              : `${c.racimo.camposConVariosLlenadores.length} campo(s) tienen más de un llenador: ${c.racimo.campos.filter((x) => x.llenadores.length > 1).map((x) => `${x.nombre} (${x.llenadores.join(", ")})`).join("; ")}.`,
        },
};

const muerenJuntos: Check<Ctx, Graph> = {
  id: "mueren-juntos",
  describe: `un mismo miembro vacía >= ${MIN_CAMPOS_VACIADOS_JUNTOS} campos del racimo: nacen y mueren en la misma operación, que es lo que les da una vida propia`,
  run: (c) =>
    !c.racimo
      ? { holds: false, evidence: "sin racimo: no demostrado." }
      : {
          holds: c.racimo.vaciadoresJuntos.length > 0,
          evidence:
            c.racimo.vaciadoresJuntos.length > 0
              ? `\`${c.racimo.vaciadoresJuntos[0]!.nombre}\` vacía ${c.racimo.vaciadoresJuntos[0]!.cuantos} de los ${c.racimo.campos.length} campos del racimo.`
              : `ningún miembro vacía dos campos del racimo a la vez (${c.racimo.campos.map((x) => `${x.nombre}: ${x.vaciadores.join("/") || "—"}`).join("; ")}): nacen juntos pero se apagan uno por uno.`,
        },
};

const elConstructorNoLosLlena: Check<Ctx, Graph> = {
  id: "el-constructor-no-los-llena",
  describe: "el constructor no le asigna un valor real a ninguno de los campos del racimo (si lo hiciera, esos campos son parte de la identidad del objeto desde que nace y no hay una vida más corta que extraer)",
  run: (c) => {
    if (!c.racimo) return { holds: false, evidence: "sin racimo: no demostrado." };
    const conCtor = c.racimo.campos.filter((x) => x.constructorLoLlena).map((x) => x.nombre);
    return { holds: conCtor.length === 0, evidence: conCtor.length === 0 ? "el constructor no le asigna un valor real a ninguno." : `el constructor llena ${conCtor.length}: ${conCtor.join(", ")}.` };
  },
};

const laClaseTieneOtrosCampos: Check<Ctx, Graph> = {
  id: "la-clase-tiene-otros-campos",
  describe: "la unidad-tipo tiene campos FUERA del racimo (si el racimo es toda la clase, la clase YA ES el objeto extraído y recomendar extraerlo sería recomendar lo que ya está puesto)",
  run: (c) =>
    !c.racimo
      ? { holds: false, evidence: "sin racimo: no demostrado." }
      : {
          holds: c.racimo.otrosCampos.length > 0,
          evidence:
            c.racimo.otrosCampos.length > 0
              ? `\`${c.racimo.unidad}\` toca ${c.racimo.otrosCampos.length} campo(s) más fuera del racimo: el racimo es una parte, no el todo.`
              : `\`${c.racimo.unidad}\` no toca ningún campo fuera del racimo: la clase YA ES ese objeto.`,
        },
};

/* ── discriminadores ─────────────────────────────────────────────────────── */

const racimoGrande: Check<Ctx, Graph> = {
  id: "racimo-grande",
  describe: `el racimo tiene >= ${RACIMO_GRANDE} campos: ya no es una pareja, es un objeto con varias partes`,
  run: (c) => (!c.racimo ? { holds: false, evidence: "sin racimo." } : { holds: c.racimo.campos.length >= RACIMO_GRANDE, evidence: `${c.racimo.campos.length} campos.` }),
};

const hayLectoresQueTolerarElHueco: Check<Ctx, Graph> = {
  id: "hay-lectores-que-toleran-el-hueco",
  describe: "algún miembro que no llena el racimo lo LEE: son los que hoy tienen que tolerar que los campos estén vacíos, y los que el objeto extraído se lleva o deja de obligar",
  run: (c) => (!c.racimo ? { holds: false, evidence: "sin racimo." } : { holds: c.racimo.lectores.length > 0, evidence: c.racimo.lectores.length > 0 ? `${c.racimo.lectores.length} lector(es): ${c.racimo.lectores.join(", ")}.` : "sólo el llenador y el vaciador lo tocan." }),
};

const elRacimoNoEsElNucleo: Check<Ctx, Graph> = {
  id: "el-racimo-no-es-el-nucleo-de-la-clase",
  describe: "a lo sumo la mitad de los miembros de la unidad-tipo tocan el racimo: si lo toca casi toda la clase, esos campos NO son un objeto escondido, son el estado central de la clase",
  run: (c) => {
    if (!c.racimo) return { holds: false, evidence: "sin racimo." };
    const n = c.racimo.miembrosDeLaUnidad;
    const t = c.racimo.miembrosQueTocanElRacimo;
    return { holds: n > 0 && t * 2 <= n, evidence: `${t} de ${n} miembros de \`${c.racimo.unidad}\` tocan el racimo.` };
  },
};

/** SIEMPRE `"ausente"` — trampa #2: no puede retirarle la propuesta a `State`. */
function appliedState(c: Ctx): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "¿los campos del racimo ya viven en un objeto propio y la clase guarda una sola referencia?",
        passed: false,
        why: c.racimo
          ? `no: \`${c.racimo.unidad}\` sigue declarando los ${c.racimo.campos.length} campos por separado (${c.racimo.campos.map((x) => x.nombre).join(", ")}) y los llena uno por uno en \`${c.racimo.llenador}\`. Si ya estuvieran extraídos habría UN campo, no ${c.racimo.campos.length}.`
          : "sin racimo.",
        role: "applied",
      },
    ],
  };
}

function buildSpec(): HypothesisSpec<Ctx, Graph> {
  return {
    pattern: "Extract Class (campos temporales)",
    ceiling: "media",
    needs: [],
    required: [hayUnRacimo, unSoloLlenadorPorCampo, muerenJuntos, elConstructorNoLosLlena, laClaseTieneOtrosCampos],
    discriminators: [racimoGrande, hayLectoresQueTolerarElHueco, elRacimoNoEsElNucleo],
    appliedState: (c) => appliedState(c),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── la traza ───────────────────────────────────────────────────────────── */

export interface ExtractClassTempTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly withFile: boolean;
  readonly language: string;
  readonly unidad: string;
  readonly llenador: string;
  readonly campos: readonly string[];
  readonly campoDelAncla: string | null;
  readonly campoQueEmite: string;
  readonly esElQueEmite: boolean;
  readonly vaciadoresJuntos: number;
  readonly lectores: number;
  readonly otrosCampos: number;
  readonly miembros: number;
  readonly tocan: number;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly emitted: boolean;
}

let trace: ExtractClassTempTraceEntry[] | null = null;
export function startExtractClassTempTrace(): void {
  trace = [];
}
export function takeExtractClassTempTrace(): readonly ExtractClassTempTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function placesOf(r: Racimo): readonly RoleLocation[] {
  const out: RoleLocation[] = [
    {
      file: r.file,
      startLine: r.llenadorStart,
      endLine: r.llenadorEnd,
      symbol: `${r.unidad}.${r.llenador}`,
      role: `llena los ${r.campos.length} campos del racimo (${r.campos.map((c) => c.nombre).join(", ")}): acá nace el objeto que hoy no tiene tipo`,
    },
  ];
  for (const v of r.vaciadoresJuntos.slice(0, 2)) {
    out.push({
      file: r.file,
      startLine: v.startLine,
      endLine: v.endLine,
      symbol: `${r.unidad}.${v.nombre}`,
      role: `vacía ${v.cuantos} de los ${r.campos.length} campos del racimo: acá muere, y con el objeto extraído es una sola asignación a nulo`,
    });
  }
  for (const campo of r.campos) {
    out.push({
      file: r.file,
      startLine: campo.llenaEnLinea,
      endLine: campo.llenaEnLinea,
      symbol: `${r.unidad}.${campo.nombre}`,
      role: `campo del racimo (${campo.lectores.length} miembro(s) lo leen y tienen que tolerar que esté vacío)`,
    });
  }
  for (const lector of r.lectores.slice(0, 4)) {
    const rango = r.rangoMiembro[lector];
    if (!rango) continue;
    out.push({
      file: r.file,
      startLine: rango.startLine,
      endLine: rango.endLine,
      symbol: `${r.unidad}.${lector}`,
      role: `lee el racimo sin llenarlo: hoy tiene que tolerar el hueco, con el objeto extraído pregunta por UNA referencia`,
    });
  }
  return out;
}

export const hypothesis: HypothesisBuilder = {
  id: "extract-class-from-temporary-fields",
  pattern: "Extract Class (campos temporales)",
  layer: "refactorizacion",
  anchors: ["temporary-field"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const racimo = ctx.file ? racimoDe(ctx.file, problem) : null;
    // UNA PROPUESTA POR RACIMO: sólo el hallazgo del campo primero en orden
    // alfabético emite. Ver el docstring del módulo.
    const esElQueEmite = racimo !== null && racimo.campoDelAncla !== null && racimo.campoDelAncla === racimo.campoQueEmite;
    const c: Ctx = { racimo: esElQueEmite ? racimo : racimo && racimo.campoDelAncla !== null ? { ...racimo, campoDelAncla: null } : racimo, conArbol: ctx.file !== null };
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
        unidad: racimo?.unidad ?? "",
        llenador: racimo?.llenador ?? "",
        campos: racimo?.campos.map((x) => x.nombre) ?? [],
        campoDelAncla: racimo?.campoDelAncla ?? null,
        campoQueEmite: racimo?.campoQueEmite ?? "",
        esElQueEmite,
        vaciadoresJuntos: racimo?.vaciadoresJuntos.length ?? 0,
        lectores: racimo?.lectores.length ?? 0,
        otrosCampos: racimo?.otrosCampos.length ?? 0,
        miembros: racimo?.miembrosDeLaUnidad ?? 0,
        tocan: racimo?.miembrosQueTocanElRacimo ?? 0,
        checks,
        diesAt: checks.find((k) => !k.holds)?.id ?? null,
        emitted: outcome !== null,
      });
    }
    if (!outcome || !racimo || !esElQueEmite) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(racimo),
      cost:
        `Una clase nueva con los ${racimo.campos.length} campos adentro (${racimo.campos.map((x) => x.nombre).join(", ")}), construida entera en ` +
        `\`${racimo.llenador}\` y puesta a nulo de una sola vez donde hoy se vacían uno por uno. ` +
        `\`${racimo.unidad}\` pasa de ${racimo.campos.length} huecos que tolerar a UNO. El trabajo real es comprobar que nadie de afuera ` +
        "toque esos campos por separado: si alguno es público o lo llena un framework por nombre, el costo cambia.",
    });
  },
};
