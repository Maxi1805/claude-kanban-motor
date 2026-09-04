/**
 * `data-class` — CLASE DE DATOS (Ola AU, frente AU6).
 *
 * El segundo de los dos detectores que le faltaban al catálogo canónico de 22
 * code smells. Fowler lo define en una línea: *"clases que tienen campos,
 * getters y setters, y nada más"*. Es un olor porque esos datos casi siempre
 * son manipulados con demasiado detalle por OTRAS clases: el comportamiento
 * que les corresponde vive afuera.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA FORMA QUE SE BUSCA — las tres condiciones, todas verificables abriendo
 * el archivo
 * ────────────────────────────────────────────────────────────────────────
 *
 *   (1) la unidad-tipo expone al menos `camposExpuestos` campos;
 *   (2) **tiene al menos UN accesor** — un miembro cuyo cuerpo entero es
 *       devolver un campo o asignarle un parámetro (o una propiedad
 *       automática, o un macro de accesores: son la misma cosa escrita más
 *       corto);
 *   (3) y **NINGÚN miembro hace nada más que eso**. Cero. Un solo método con
 *       una rama, un cálculo o una llamada a un colaborador y la clase deja
 *       de ser una clase de datos.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA CONDICIÓN (2) ES LA COMPUERTA, Y ES LA RAZÓN DE SER DE ESTE ARCHIVO
 * ────────────────────────────────────────────────────────────────────────
 *
 * El encargo lo dice sin vueltas: *"CUIDADO CON LOS FALSOS DE FORMA: los DTO,
 * los records, los tipos generados y los de configuración SON data classes a
 * propósito. Sin una compuerta para eso vas a emitir miles."*
 *
 * La compuerta NO es una lista de nombres de archivo ni de sufijos de clase
 * (`…DTO`, `…Options`, `…Config`), que sería léxico y no distinguiría nada.
 * Es la condición (2), que sale de la definición literal de Fowler: **una
 * clase que sólo tiene campos, sin un solo accesor, no es este olor — es un
 * REGISTRO.** Un `struct` de Go, un `record` de Java/C#, una `interface` de
 * TypeScript, un tipo generado por un compilador de esquemas: todos son
 * campos desnudos, y todos quedan afuera por (2) sin necesidad de reconocer
 * ni uno solo por nombre.
 *
 * Lo que (2) deja pasar es exactamente lo que el olor describe: alguien se
 * TOMÓ EL TRABAJO de escribir accesores —o sea, de tratar a esto como un
 * objeto— y sin embargo no le puso ni un comportamiento adentro.
 *
 * Las otras tres compuertas, cada una con su razón, y **todas medidas con y
 * sin ellas** (ver el informe AU6):
 *
 *   · **ANOTACIÓN/ATRIBUTO/DECORADOR sobre la clase o sobre sus campos.**
 *     Una unidad-tipo anotada está declarando que la lee o la escribe algo
 *     de AFUERA (un mapeo a base de datos, un serializador, un contenedor de
 *     inyección, un `@dataclass`). Que sea un contenedor de datos no es un
 *     descuido: es el contrato. Se reconoce por FORMA (un nodo cuyo tipo
 *     contiene `annotation`/`attribute`/`decorator`), nunca por el nombre de
 *     la anotación — así vale igual para Java, C#, Python y TypeScript sin
 *     una lista por lenguaje.
 *   · **ARCHIVO GENERADO.** Un comentario `generated … do not edit` o
 *     `@generated` en la cabecera. Es una convención COMPARTIDA (Go la
 *     estandarizó, pero la usan todos), no vocabulario de un lenguaje, y es
 *     lo único que separa un tipo escrito a mano de uno que va a volver a
 *     nacer igual en el próximo build.
 *   · **UNIDAD-TIPO PARCIAL / REABIERTA.** Éste es el modo de falla que el
 *     encargo nombra de antemano: *"`data-class` puede caer en lo mismo si
 *     una clase parece tonta porque su comportamiento está en otro lado"*.
 *     Un detector `intra-file` NO PUEDE VER la otra mitad de una clase
 *     parcial: la afirmación "ningún miembro hace nada" sería falsa por
 *     construcción. Se descarta, y se descarta por la palabra del MODIFICADOR
 *     (misma clase de vocabulario que `CONSTRUCTOR_NAMES` de
 *     `code-grammar.ts`), no por lenguaje.
 *
 * ────────────────────────────────────────────────────────────────────────
 * GO, Y POR QUÉ NO QUEDA MUDO NI GRITA
 * ────────────────────────────────────────────────────────────────────────
 *
 * Go es el caso que rompe la ingenuidad de "los miembros son los hijos de la
 * clase": los métodos de Go NO viven adentro del tipo, viven sueltos en el
 * archivo con un receptor. Sonda directa contra la gramática real
 * (`scripts/au6-sonda-gramatica-dc.mts`): `classNodes` de Go es exactamente
 * `{type_spec}`, y un `method_declaration` con `receiver` es un hermano del
 * `type_spec`, no un descendiente.
 *
 * Si este archivo contara sólo descendientes, **todo struct de Go con tres
 * campos sería una clase de datos** — miles de falsos, y por el motivo
 * exacto que el encargo anticipa. Se resuelve igual que
 * `temporary-field.ts`: los métodos se atribuyen a su tipo por el RECEPTOR
 * (`goReceiverOf`). Y la condición (2) hace el resto: un struct sin un solo
 * accesor con receptor no dispara.
 *
 * ────────────────────────────────────────────────────────────────────────
 * GENERICIDAD — las listas de texto que hay, y por qué ninguna es de un
 * lenguaje
 * ────────────────────────────────────────────────────────────────────────
 *
 * Precedente que no hay que repetir: `SELF_PREFIX` en `state.ts` dejó a Go
 * mudo en cuatro anclas. Acá:
 *
 *   · `SELF_WORDS` (`this`/`self`), `RUBY_IVAR_TYPE`, `CONSTRUCTOR_NAMES`,
 *     `goReceiverOf` — la MISMA copia declarada que `temporary-field.ts` ya
 *     documenta frente a `lazy-init-repetida.ts` (`detect/*` no puede
 *     importar de `hypotheses/*` y no hay módulo de primitivas compartido).
 *   · `ACCESSOR_MACRO` — los macros que generan accesores en vez de
 *     escribirlos (`attr_accessor`/`attr_reader`/`attr_writer`). Es la MISMA
 *     clase de vocabulario que `CONSTRUCTOR_NAMES`: un nombre que el
 *     lenguaje MANDATA, no una convención de proyecto. Sin esta lista, Ruby
 *     —donde la clase de datos canónica se escribe con un macro— quedaría
 *     mudo por una razón falsa.
 *   · `NOT_A_CLASS_WORD` — los tipos de nodo de `classNodes` que NO son una
 *     clase: `interface`, `enum`, `record`, `annotation_type`, `namespace`,
 *     `module`. Vocabulario de GRAMÁTICA, y la lista sale de la sonda, no de
 *     memoria.
 *   · `PARTIAL_WORD` (`partial`) — ver arriba.
 *
 * Nada acá lee `ctx.language` ni `file.language`.
 *
 * PATRÓN/REMEDIO: el `advice` propone *Move Method* (mudar a la clase de
 * datos el comportamiento que otras clases ejercen sobre sus campos) con
 * *Encapsulate Field* como alternativa. No cuelga ninguna hipótesis de
 * patrón de este kind.
 */
import { CONSTRUCTOR_NAMES } from "../../code-grammar.js";
import { pisoDeclarado, presupuesto } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "camposExpuestos";

/* ── vocabulario de gramática ───────────────────────────────────────────── */

const COMMENT_NODE_TYPE = /comment/i;
/** Mismo vocabulario que `temporary-field.ts#SELF_WORDS`/`lazy-init-repetida.ts`. */
const SELF_WORDS = new Set(["this", "self"]);
const RUBY_IVAR_TYPE = "instance_variable";
const OBJECT_FIELDS = ["object", "operand"];
/** Declaración de campo/propiedad — `field_declaration` (Java/C#/Go), `property_declaration` (C#), `public_field_definition` (TS). Sonda confirmada. */
const FIELD_DECL_NODE_TYPE = /(^|_)(field|property)_(declaration|definition)$/;
/** Accesor sin cuerpo de una propiedad automática de C# (`{ get; set; }`). */
const ACCESSOR_DECL_NODE_TYPE = /(^|_)accessor_declaration$/;
/** Anotación / atributo / decorador — la firma de "algo de AFUERA lee o escribe este tipo". */
const ANNOTATION_NODE_TYPE = /(^|_)(annotation|attribute|attribute_list|decorator)$/;
/**
 * Tipos de `classNodes` que NO son una clase: no tiene sentido preguntarles
 * si "no hacen nada". Sale de la sonda de gramática, no de memoria.
 */
const NOT_A_CLASS_WORD = /(^|_)(interface|enum|record|annotation_type|namespace|module)(_|$)/;
/** El modificador que dice "la otra mitad de esta clase está en otro archivo". */
const PARTIAL_WORD = /^partial$/;
/** Macros que GENERAN los accesores en vez de escribirlos. Misma clase de vocabulario que `CONSTRUCTOR_NAMES`. */
const ACCESSOR_MACRO = /^attr_(accessor|reader|writer)$/;
/** La convención COMPARTIDA de "esto lo escribió una herramienta". */
const GENERATED_HEADER = /(^|\b)(?:@generated\b|code generated\b[\s\S]{0,80}?\bdo not edit\b|\bgenerated by\b[\s\S]{0,60}?\bdo not (?:edit|modify)\b|\bauto-?generated\b[\s\S]{0,60}?\bdo not (?:edit|modify)\b)/i;
/** `super`/`base`: la llamada al constructor de arriba no es comportamiento propio. */
const SUPER_WORD = /^(super|base)\b/;
const RETURN_WORD = /(^|_)return/;
const BLOCK_WORD = /(^|_)(block|body|statement_list|suite|compound_statement|body_statement)(_|$)/;

/* ── primitivas de árbol (copia declarada de `temporary-field.ts`) ───────── */

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !COMMENT_NODE_TYPE.test(c.type)) out.push(c);
  }
  return out;
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

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
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

/** ¿`node` nombra un campo del propio objeto? Tres vías, ninguna léxica — igual que `temporary-field.ts`. */
function selfFieldNameOf(node: AstNode, selfNames: ReadonlySet<string>, declaredFields: ReadonlySet<string>): string | null {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  const obj = objectOf(node);
  if (obj && selfNames.has(obj.text)) return memberNameOf(node);
  if (node.type === "identifier" && declaredFields.has(node.text)) return node.text;
  return null;
}

/** Único vehículo de Go para "unidad-tipo dueña": el `receiver` de un método libre. */
function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  const typeNode = findDescendant(decl, (n) => n.type === "type_identifier", 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}

function parameterNamesOf(fnNode: AstNode): Set<string> {
  const names = new Set<string>();
  const paramsNode =
    (fnNode.childForFieldName("parameters") as AstNode | null) ??
    namedChildren(fnNode).find((c) => /parameter/i.test(c.type)) ??
    null;
  if (!paramsNode) return names;
  const idents: AstNode[] = [];
  findAllDescendants(paramsNode, (n) => /identifier$/.test(n.type), 4, idents);
  for (const id of idents) names.add(id.text);
  return names;
}

function bodyOf(fnNode: AstNode): AstNode | null {
  const declared = (fnNode.childForFieldName("body") as AstNode | null) ?? (fnNode.childForFieldName("consequence") as AstNode | null);
  if (declared) return declared;
  return namedChildren(fnNode).find((c) => BLOCK_WORD.test(c.type)) ?? null;
}

/* ── campos ──────────────────────────────────────────────────────────────── */

interface FieldInfo {
  readonly name: string;
  /** La declaración lleva anotación/atributo/decorador. */
  readonly annotated: boolean;
  /** Propiedad automática (`{ get; set; }`) o macro de accesores: trae su accesor puesto. */
  readonly autoAccessor: boolean;
}

/**
 * Los campos que `classNode` DECLARA, con los dos bits que después deciden.
 * No mira nombres: sólo tipos de nodo.
 */
function declaredFields(classNode: AstNode): Map<string, FieldInfo> {
  const fields = new Map<string, FieldInfo>();
  const decls: AstNode[] = [];
  findAllDescendants(classNode, (n) => n !== classNode && FIELD_DECL_NODE_TYPE.test(n.type), 4, decls);
  for (const decl of decls) {
    const annotated = findDescendant(decl, (n) => ANNOTATION_NODE_TYPE.test(n.type), 3) !== null;
    const autoAccessor = findDescendant(decl, (n) => ACCESSOR_DECL_NODE_TYPE.test(n.type), 3) !== null;
    const names: string[] = [];
    const declarators: AstNode[] = [];
    findAllDescendants(decl, (n) => n !== decl && /declarator$/.test(n.type), 3, declarators);
    if (declarators.length > 0) {
      for (const d of declarators) {
        const name = (d.childForFieldName("name") as AstNode | null)?.text ?? namedChildren(d)[0]?.text ?? null;
        if (name) names.push(name);
      }
    } else {
      const name = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
      if (name) names.push(name);
    }
    for (const name of names) fields.set(name, { name, annotated, autoAccessor });
  }
  return fields;
}

/**
 * Los campos que un MACRO de accesores declara (`attr_accessor :a, :b`). Sin
 * esto Ruby —donde la clase de datos canónica se escribe así— queda mudo por
 * una razón falsa.
 */
function macroFields(classNode: AstNode): string[] {
  const out: string[] = [];
  const calls: AstNode[] = [];
  findAllDescendants(classNode, (n) => n !== classNode && /(^|_)call$/.test(n.type), 3, calls);
  for (const call of calls) {
    const method = (call.childForFieldName("method") as AstNode | null)?.text ?? namedChildren(call)[0]?.text ?? "";
    if (!ACCESSOR_MACRO.test(method)) continue;
    const args = call.childForFieldName("arguments") as AstNode | null;
    if (!args) continue;
    for (const a of namedChildren(args)) out.push(a.text.replace(/^[:'"]|['"]$/g, ""));
  }
  return out;
}

/* ── miembros ────────────────────────────────────────────────────────────── */

type MemberKind = "accesor" | "trivial" | "comportamiento";

interface MemberVerdict {
  readonly kind: MemberKind;
  /** El campo que este accesor expone, si lo es. */
  readonly field: string | null;
}

function returnValueOf(stmt: AstNode): AstNode | null {
  return (
    (stmt.childForFieldName("value") as AstNode | null) ??
    (stmt.childForFieldName("expression") as AstNode | null) ??
    namedChildren(stmt)[0] ??
    null
  );
}

/**
 * Qué hace este miembro. TRES resultados y nada de nombres: se decide por la
 * FORMA del cuerpo.
 */
function classifyMember(
  fnNode: AstNode,
  isConstructor: boolean,
  selfNames: ReadonlySet<string>,
  fields: ReadonlySet<string>,
): MemberVerdict {
  const body = bodyOf(fnNode);
  if (!body) return { kind: "trivial", field: null };
  const stmts = namedChildren(body);
  const params = parameterNamesOf(fnNode);
  const visible = new Set([...fields].filter((f) => !params.has(f)));

  if (isConstructor) {
    // Un constructor que SÓLO reparte sus parámetros en campos (y llama al de
    // arriba) no es comportamiento: es la declaración de los campos escrita de
    // otra forma. Uno que hace cualquier otra cosa, sí lo es.
    for (const raw of stmts) {
      const s = unwrapSingleChild(raw);
      if (SUPER_WORD.test(s.text.trim())) continue;
      if (isAssignmentLike(s)) {
        const left = unwrapSingleChild((s.childForFieldName("left") as AstNode | null) ?? s);
        if (selfFieldNameOf(left, selfNames, visible) !== null) continue;
      }
      return { kind: "comportamiento", field: null };
    }
    return { kind: "trivial", field: null };
  }

  if (stmts.length === 0) return { kind: "trivial", field: null };
  if (stmts.length > 1) return { kind: "comportamiento", field: null };

  const s = unwrapSingleChild(stmts[0]!);

  // getter explícito: `return <campo propio>`
  if (RETURN_WORD.test(s.type)) {
    const value = returnValueOf(s);
    if (value) {
      const field = selfFieldNameOf(unwrapSingleChild(value), selfNames, visible);
      if (field) return { kind: "accesor", field };
      // `return <literal>` / `return this`: trivial, pero no expone un campo.
      if (namedChildren(value).length === 0) return { kind: "trivial", field: null };
    } else {
      return { kind: "trivial", field: null };
    }
    return { kind: "comportamiento", field: null };
  }

  // setter: `<campo propio> = <parámetro>`
  if (isAssignmentLike(s)) {
    const left = unwrapSingleChild((s.childForFieldName("left") as AstNode | null) ?? s);
    const right = unwrapSingleChild((s.childForFieldName("right") as AstNode | null) ?? s);
    const field = selfFieldNameOf(left, selfNames, visible);
    if (field && right.type === "identifier" && params.has(right.text)) return { kind: "accesor", field };
    return { kind: "comportamiento", field: null };
  }

  // getter implícito (Ruby: `def a; @a; end`)
  const bare = selfFieldNameOf(s, selfNames, visible);
  if (bare) return { kind: "accesor", field: bare };

  return { kind: "comportamiento", field: null };
}

/* ── el recorrido ────────────────────────────────────────────────────────── */

interface ClassBucket {
  readonly name: string;
  readonly node: AstNode;
  readonly fields: Map<string, FieldInfo>;
  readonly macroNames: string[];
  readonly annotated: boolean;
  readonly partial: boolean;
  members: MemberVerdict[];
  accessorFields: Set<string>;
  behaviourNames: string[];
}

function isRealClass(node: AstNode, file: FileUnit): boolean {
  return file.sets.classNodes.has(node.type) && !NOT_A_CLASS_WORD.test(node.type);
}

function classAnnotated(node: AstNode): boolean {
  // Sólo la CABECERA de la declaración: una anotación sobre un miembro no
  // convierte a la clase entera en un contenedor declarado.
  for (const c of namedChildren(node)) {
    if (BLOCK_WORD.test(c.type) || /(^|_)(body|declaration_list|class_body|field_declaration_list)$/.test(c.type)) break;
    if (ANNOTATION_NODE_TYPE.test(c.type)) return true;
    if (findDescendant(c, (n) => ANNOTATION_NODE_TYPE.test(n.type), 2)) return true;
  }
  return false;
}

function classPartial(node: AstNode): boolean {
  for (const c of namedChildren(node)) {
    if (BLOCK_WORD.test(c.type)) break;
    if (PARTIAL_WORD.test(c.text.trim())) return true;
    for (const g of namedChildren(c)) if (PARTIAL_WORD.test(g.text.trim())) return true;
  }
  return false;
}

export interface DataClassCandidate {
  readonly className: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly exposedFields: readonly string[];
  readonly accessors: number;
  readonly behaviourMembers: readonly string[];
  readonly annotated: boolean;
  readonly generatedFile: boolean;
  readonly partial: boolean;
}

/**
 * Los candidatos del archivo, CON los bits de compuerta puestos pero SIN
 * aplicarlos: `gates: false` devuelve también los que una compuerta
 * descartaría. Es lo que permite medir "con y sin" sin dos implementaciones
 * — exactamente lo que el encargo pide para las compuertas de este detector.
 */
export function dataClassCandidates(file: FileUnit, minFields: number, gates = true): readonly DataClassCandidate[] {
  const generatedFile = GENERATED_HEADER.test(file.root.text.slice(0, 4000));
  const buckets = new Map<string, ClassBucket>();

  const bucketFor = (node: AstNode, name: string): ClassBucket => {
    const key = `${name}@${node.startPosition.row}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        name,
        node,
        fields: declaredFields(node),
        macroNames: macroFields(node),
        annotated: classAnnotated(node),
        partial: classPartial(node),
        members: [],
        accessorFields: new Set<string>(),
        behaviourNames: [],
      };
      buckets.set(key, b);
    }
    return b;
  };

  // Pasada 1: las unidades-tipo. Se registran TODAS antes de mirar métodos,
  // porque en Go el método es HERMANO del tipo y puede aparecer antes.
  const classNodes: AstNode[] = [];
  const collect = (node: AstNode): void => {
    if (isRealClass(node, file)) classNodes.push(node);
    for (const c of namedChildren(node)) collect(c);
  };
  collect(file.root);
  const byName = new Map<string, ClassBucket>();
  for (const node of classNodes) {
    const name = (node.childForFieldName("name") as AstNode | null)?.text ?? null;
    if (!name) continue;
    const b = bucketFor(node, name);
    if (!byName.has(name)) byName.set(name, b);
  }

  // Pasada 2: los miembros. Cada función se atribuye a su clase ENVOLVENTE, o
  // —en Go, donde no hay envolvente— a la del RECEPTOR.
  const visit = (node: AstNode, enclosing: ClassBucket | null): void => {
    let next = enclosing;
    if (isRealClass(node, file)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? null;
      next = name ? bucketFor(node, name) : enclosing;
    } else if (file.sets.functionNodes.has(node.type)) {
      const receiver = goReceiverOf(node);
      const owner = receiver ? (byName.get(receiver.typeName) ?? null) : enclosing;
      if (owner) {
        const selfNames = new Set(SELF_WORDS);
        if (receiver) selfNames.add(receiver.paramName);
        const methodName = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónimo)";
        const isCtor = file.sets.constructorNodes.has(node.type) || CONSTRUCTOR_NAMES.has(methodName);
        const verdict = classifyMember(node, isCtor, selfNames, new Set(owner.fields.keys()));
        owner.members.push(verdict);
        if (verdict.kind === "accesor" && verdict.field) owner.accessorFields.add(verdict.field);
        if (verdict.kind === "comportamiento") owner.behaviourNames.push(methodName);
        // Un método NO aporta más miembros: no se desciende a sus funciones
        // internas (una lambda dentro de un getter no es un miembro).
        return;
      }
    }
    for (const c of namedChildren(node)) visit(c, next);
  };
  visit(file.root, null);

  const out: DataClassCandidate[] = [];
  for (const b of buckets.values()) {
    const autoFields = [...b.fields.values()].filter((f) => f.autoAccessor).map((f) => f.name);
    const exposed = new Set<string>([...b.accessorFields, ...autoFields, ...b.macroNames]);
    const accessors = b.members.filter((m) => m.kind === "accesor").length + autoFields.length + b.macroNames.length;
    if (exposed.size < minFields) continue;
    if (accessors < 1) continue;
    if (b.behaviourNames.length > 0) continue;
    const fieldAnnotated = [...b.fields.values()].some((f) => f.annotated);
    const annotated = b.annotated || fieldAnnotated;
    if (gates && (annotated || generatedFile || b.partial)) continue;
    out.push({
      className: b.name,
      startLine: b.node.startPosition.row + 1,
      endLine: b.node.endPosition.row + 1,
      exposedFields: [...exposed].sort(),
      accessors,
      behaviourMembers: b.behaviourNames,
      annotated,
      generatedFile,
      partial: b.partial,
    });
  }
  out.sort((a, b) => b.exposedFields.length - a.exposedFields.length || a.className.localeCompare(b.className));
  return out;
}

/**
 * TRES campos, la Regla de Tres. Con uno o dos campos expuestos y nada de
 * comportamiento, lo que hay es un par de valores con nombre —un envoltorio,
 * el terreno de `Value Object`—, no una clase a la que le falta su
 * comportamiento. Tres es donde "esto es una estructura de datos con dueño
 * ausente" empieza a tener sustancia. MEDIDO: ver el informe AU6 para el
 * volumen y la precisión con este piso.
 */
const MIN_FIELDS_SPEC = pisoDeclarado(3, {
  rationale:
    "con uno o dos campos expuestos y ningún comportamiento, lo que hay es un envoltorio de valor (el terreno de " +
    "Value Object), no una clase a la que se le llevaron el comportamiento; tres es el piso donde la afirmación " +
    "'esto es una estructura de datos que alguien más manipula' empieza a tener sustancia. Regla de Tres, medida " +
    "sobre los 21 repos del corpus en la Ola AU.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. */
const MAX_FINDINGS_SPEC = presupuesto(60, {
  rationale:
    "una clase de datos se arregla mudándole comportamiento, que es trabajo de diseño y no un cambio mecánico: un " +
    "panel con más de unas pocas decenas de candidatas a la vez no se puede atender. Es un tope de volumen, no un " +
    "umbral de detección.",
});

export const detector: IntraFileDetector<ThresholdKey, "data-class"> = {
  id: "data-class",
  kind: "data-class",
  scope: "intra-file",
  title: "Clase de datos",
  // SIN `needs: ["unidad-tipo-clase"]`, misma razón exacta que
  // `temporary-field.ts`/`lazy-init-repetida.ts` documentan: la forma "dueño
  // de campos" se reconoce por DOS vías independientes — la gramática
  // (`classNodes`) y el receptor de método de Go — y Go no declara esa
  // capacidad pese a tener la forma.
  needs: [],
  thresholds: { camposExpuestos: MIN_FIELDS_SPEC },
  maxFindings: MAX_FINDINGS_SPEC,
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("camposExpuestos");
    const findings: RawFinding[] = [];
    for (const c of dataClassCandidates(file, threshold.value)) {
      const location: RoleLocation = {
        file: file.path,
        startLine: c.startLine,
        endLine: c.endLine,
        symbol: c.className,
        role: `expone ${c.exposedFields.length} campos (${c.exposedFields.join(", ")}) y no hace nada con ellos`,
      };
      findings.push({
        title: `"${c.className}" expone ${c.exposedFields.length} campos y no hace nada con ellos`,
        detail:
          `\`${c.className}\` tiene ${c.exposedFields.length} campos alcanzables desde afuera ` +
          `(${c.exposedFields.join(", ")}) y ${c.accessors} accesor(es), y NINGÚN miembro que haga algo más que ` +
          "devolver o asignar un campo. Alguien se tomó el trabajo de escribirle accesores —o sea, de tratarla " +
          "como un objeto— y sin embargo el comportamiento que le corresponde no está acá: está repartido en las " +
          "clases que leen estos campos y deciden con ellos. Queda por confirmar a mano lo único que este " +
          "análisis no puede ver: que ese comportamiento exista en algún lado y que de verdad pertenezca a estos " +
          "datos.",
        trigger: [{ label: "campos expuestos sin comportamiento propio", value: c.exposedFields.length, threshold }],
        evidence: [{ label: "accesores", value: c.accessors }],
        locations: [location],
        severity: Math.min(100, 30 + c.exposedFields.length * 6),
        advice: {
          primary: {
            name: "Move Method",
            kind: "refactorizacion",
            why:
              "Buscá en las clases que usan estos campos un bloque que sólo dependa de ellos: ese bloque es un " +
              "método de esta clase escrito en el lugar equivocado. Mudarlo hace que los datos y las decisiones " +
              "que dependen de ellos vivan juntos.",
            source: "https://refactoring.guru/es/smells/data-class",
          },
          alternatives: [
            {
              name: "Encapsulate Field",
              kind: "refactorizacion",
              why:
                "Si los campos se leen y se escriben desde afuera sin ninguna regla, empezar por cerrarlos deja " +
                "un solo lugar donde después poner esa regla.",
              source: "https://refactoring.guru/es/encapsulate-field",
            },
          ],
        },
      });
    }
    return findings;
  },
};
