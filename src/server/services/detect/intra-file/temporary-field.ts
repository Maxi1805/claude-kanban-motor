/**
 * `temporary-field` — un campo que sólo tiene valor durante PARTE de la vida
 * del objeto (Ola X, frente B7).
 *
 * EL OLOR, tal como lo define Fowler ("Temporary Field"): un campo de una
 * clase que no está poblado todo el tiempo, sino que se llena para una
 * operación y se vacía después. Todo el resto de la clase queda obligado a
 * tolerar los dos estados, y el lector no puede saber, mirando la
 * declaración, cuándo el campo significa algo.
 *
 * POR QUÉ ESTE KIND Y NO OTRO — el encargo del frente: es el disparador
 * canónico de **State** (el campo que aparece y desaparece ES el estado del
 * objeto escrito a mano) y, en segundo lugar, de *Extract Class*. Ningún
 * kind del catálogo lo cubría: `lazy-init-repetida` mide la forma OPUESTA
 * (un campo que, una vez construido, YA NO se vacía: memoización),
 * `self-referential-member` mira el TIPO del campo y `primitive-obsession`
 * su tipo primitivo. Verificado leyendo los 43 detectores del registro antes
 * de escribir este archivo.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA FORMA QUE SE BUSCA — dos escrituras, ninguna en el constructor
 * ────────────────────────────────────────────────────────────────────────
 *
 * Un campo `F` de una unidad-tipo `C` dispara cuando, MIRANDO SÓLO MÉTODOS
 * QUE NO SON EL CONSTRUCTOR, se ve el ciclo completo:
 *
 *   (a) **se vacía**: al menos una asignación `F = <literal nulo>`
 *       (`null`/`nil`/`None`/`undefined`), y
 *   (b) **se llena**: al menos una asignación `F = <algo que no es nulo>`.
 *
 * Las dos condiciones juntas son la definición literal de "sólo tiene valor
 * durante parte de la vida del objeto": hay un tramo en el que vale algo y
 * otro en el que, deliberadamente, no vale nada — y los dos tramos los
 * produce el propio código de la clase, después de construida.
 *
 * QUÉ **NO** ES, y por qué cada exclusión (esto es lo que el precedente de
 * `builder.ts` pide: nombrar también qué NO es):
 *
 *   - **Un campo inicializado en `null` en el constructor y llenado después**
 *     NO dispara por sí solo. Ése es el idiom normal de "todavía no lo sé";
 *     no hay ciclo, hay una única transición. Por eso la condición (a) exige
 *     el vaciado FUERA del constructor: un `this.x = null` dentro del
 *     constructor es una DECLARACIÓN de slot vacío, no una vida temporal.
 *     (Misma razón por la que la asignación en la declaración del campo
 *     —`private X a = null;`— tampoco se cuenta: no es una asignación dentro
 *     de un método.)
 *   - **Memoización / inicialización perezosa** (`@x ||= …`, `if (!this.x)
 *     this.x = new X()`) no dispara: nunca se vacía. Ése es el terreno de
 *     `lazy-init-repetida`, y la condición (a) lo separa sin necesidad de
 *     mirar guardas.
 *   - **`F = F`** (reasignación del propio campo, típica de un swap o de un
 *     `this.x = this.x || y`) no cuenta como "se llena": el lado derecho que
 *     sólo lee el MISMO campo no aporta un valor nuevo.
 *   - **Una variable local** no cuenta nunca: sólo se miran accesos por
 *     receptor propio (`this.`/`self.`/`@`/receptor de Go) o identificadores
 *     desnudos que la clase DECLARA como campo (el idiom de Java/C#, ver
 *     `declaredFieldNames`).
 *
 * ────────────────────────────────────────────────────────────────────────
 * SONDA DE GRAMÁTICA — cómo escribe cada gramática "campo puesto en nulo"
 * ────────────────────────────────────────────────────────────────────────
 *
 * Confirmado por sonda DIRECTA contra los `.wasm` reales
 * (`scripts/x-b7-sonda-gramatica.mts`, corrida el 13 de agosto de 2026 —
 * mismo mecanismo que `code-grammar.ts` documenta para `TERNARY_NAME`):
 *
 * | gramática | escritura del campo | literal nulo |
 * |---|---|---|
 * | javascript/typescript | `assignment_expression` (`left`=`member_expression` `this.a`) | tipo de nodo `null`; `undefined` es un `identifier` con ese texto |
 * | python | `assignment` (`left`=`attribute` `self.a`) | tipo de nodo `none` |
 * | ruby | `assignment` (`left`=`instance_variable` `@a`) | tipo de nodo `nil` |
 * | go | `assignment_statement` (`expression_list` `c.a`) | `identifier` con texto `nil` |
 * | java | `assignment_expression` (`left`=`field_access` `this.a` **o** `identifier` `a` desnudo) | tipo de nodo `null_literal` |
 * | csharp | `assignment_expression` (`left`=`identifier` `a` desnudo) | tipo de nodo `null_literal` |
 *
 * Dos consecuencias que el cuadro deja a la vista y que este archivo
 * implementa:
 *
 *   1. **Java y C# escriben el campo propio DESNUDO** (`a = null;`, sin
 *      `this.`). Es exactamente el idiom que tuvo a `hypotheses/state.ts`
 *      ciego en esos dos lenguajes durante tres olas
 *      (`selfPrefixCheck`/`declaredMemberSelf`, ver el estado de la Ola W).
 *      Acá se resuelve por DECLARACIÓN, no por prefijo: los nombres de campo
 *      se cosechan del cuerpo de la unidad-tipo (`declaredFieldNames`) y un
 *      identificador desnudo cuenta como campo propio si y sólo si la clase
 *      lo declara. Es forma, nunca vocabulario.
 *   2. **Go no tiene constructores** (confirmado: `sets.constructorNodes` es
 *      vacío para Go y `CONSTRUCTOR_NAMES` no aplica) — así que en Go
 *      *ningún* método queda excluido por la regla del constructor, que es
 *      lo correcto: el `New…()` idiomático es una función libre, no un
 *      método con receptor, y por lo tanto no entra en el escaneo de
 *      escrituras del campo de todos modos.
 *
 * ────────────────────────────────────────────────────────────────────────
 * GENERICIDAD
 * ────────────────────────────────────────────────────────────────────────
 *
 * Cero léxico de dominio: no hay ninguna lista de nombres de campo, de clase
 * ni de método. Las tres únicas listas de texto son **vocabulario de
 * lenguaje**, aplicado IDÉNTICAMENTE a los 9 lenguajes: `SELF_WORDS`
 * (`this`/`self`, la misma que `lazy-init-repetida.ts`), `NULL_WORD` (los
 * cuatro deletreos del literal nulo) y `CONSTRUCTOR_NAMES`, importada de
 * `code-grammar.ts` en vez de re-escrita. Es la misma clase de vocabulario
 * que `code-grammar.ts` ya declara permitida (`LOOP_WORD`, `SWITCH_WORD`,
 * `CONSTRUCTOR_NAMES`).
 *
 * DUPLICACIÓN DECLARADA: `namedChildren`, `objectOf`, `memberNameOf`,
 * `isSelfFieldAccess`, `fieldKeyOf`, `goReceiverOf` y `findAllDescendants`
 * son la misma copia adaptada que `lazy-init-repetida.ts` ya declara frente
 * a `hypotheses/proxy.ts` — `detect/*` no puede importar de `hypotheses/*`
 * (capas invertidas) y tampoco existe un módulo de primitivas compartido
 * entre detectores. Se copia y se dice, igual que ese archivo.
 *
 * PATRÓN AL QUE ALIMENTA: **State** (`hypotheses/state.ts`). Ver el informe
 * `ola-x/informes/B7.md`: el cableado del ancla lo pide este frente a B6,
 * dueño único de ese archivo en esta ola.
 */
import { CONSTRUCTOR_NAMES } from "../../code-grammar.js";
import { presencia } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "ciclosFueraDelConstructor";

/** Mismo vocabulario que `lazy-init-repetida.ts#SELF_WORDS`. */
const SELF_WORDS = new Set(["this", "self"]);
/** Ruby: `@x` es un único token con sigilo, sin receptor explícito. */
const RUBY_IVAR_TYPE = "instance_variable";
const OBJECT_FIELDS = ["object", "operand"];
const COMMENT_NODE_TYPE = /comment/i;

/**
 * El literal nulo, por TIPO DE NODO cuando la gramática le da uno propio
 * (`null` en JS/TS, `null_literal` en Java/C#, `nil` en Ruby, `none` en
 * Python) y por TEXTO cuando no (Go escribe `nil` como un `identifier`
 * cualquiera; TS/JS escriben `undefined` igual). Vocabulario de lenguaje,
 * aplicado idénticamente a los 9 — nunca por lenguaje.
 */
const NULL_NODE_TYPE = /^(null|nil|none|null_literal|undefined)$/i;
const NULL_WORD = /^(null|nil|none|undefined)$/i;

/** Tipos de nodo que DECLARAN campos dentro del cuerpo de una unidad-tipo —
 *  vocabulario de gramática (`field_declaration` en Java/C#/Go,
 *  `property_declaration` en C#, `public_field_definition` en TS). Nunca se
 *  usa para decidir si algo dispara: sólo para saber qué identificadores
 *  DESNUDOS son campos propios en los lenguajes con `this` implícito. */
const FIELD_DECL_NODE_TYPE = /(^|_)(field|property)_(declaration|definition)$/;

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

/**
 * ¿`node` nombra un campo del propio objeto? Tres vías, ninguna léxica:
 *   1. el token con sigilo de Ruby (`@x`);
 *   2. un acceso con receptor cuyo objeto está en `selfNames` (`this`/`self`
 *      o el parámetro receptor de Go);
 *   3. un identificador DESNUDO que la unidad-tipo declara como campo —
 *      el idiom de Java/C#, ver la sonda de gramática del docstring.
 * `null` si no es ninguna de las tres.
 */
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

/** Único vehículo de Go para "campo propio"/"unidad-tipo dueña": el `receiver` de un método libre. */
function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  const typeNode = findDescendant(decl, (n) => n.type === "type_identifier", 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}

/**
 * Los nombres que la unidad-tipo `classNode` DECLARA como campos, cosechados
 * de los nodos de declaración de su cuerpo (`FIELD_DECL_NODE_TYPE`). Sólo se
 * usa para reconocer el identificador DESNUDO de Java/C# como campo propio;
 * su ausencia nunca impide un hallazgo por la vía del receptor explícito.
 */
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

/** Una escritura del campo, con el único bit que decide: ¿deja el campo vacío? */
interface Write {
  field: string;
  methodName: string;
  isConstructor: boolean;
  startLine: number;
  endLine: number;
  toNull: boolean;
}

function isConstructorMethod(fnNode: AstNode, methodName: string, file: FileUnit): boolean {
  if (file.sets.constructorNodes.has(fnNode.type)) return true;
  return CONSTRUCTOR_NAMES.has(methodName);
}

/**
 * Los nombres de los parámetros de `fnNode` — un identificador DESNUDO que
 * coincide con un parámetro NO es el campo propio aunque la clase declare un
 * campo con ese nombre (la regla de sombreado que `hypotheses/state.ts`
 * llama `isShadowedByOwnParameter`). Se lee del campo genérico `parameters`
 * de cualquier gramática, más `parameter_list`/`formal_parameters` como
 * hijo posicional cuando no hay campo.
 */
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

/** Todas las escrituras a campos propios dentro de `body`. */
function collectWrites(
  body: AstNode,
  methodName: string,
  isConstructor: boolean,
  selfNames: ReadonlySet<string>,
  declaredFields: ReadonlySet<string>,
): Write[] {
  const out: Write[] = [];
  const assigns: AstNode[] = [];
  findAllDescendants(body, isAssignmentLike, 12, assigns);

  for (const assign of assigns) {
    const leftRaw = (assign.childForFieldName("left") as AstNode | null) ?? null;
    const rightRaw = (assign.childForFieldName("right") as AstNode | null) ?? null;
    if (!leftRaw || !rightRaw) continue;
    // Go escribe `c.a = nil` como `assignment_statement` con `left`/`right`
    // envueltos en `expression_list`; el desenvuelto de hijo único lo cubre
    // sin una rama por lenguaje (confirmado por la sonda).
    const left = unwrapSingleChild(leftRaw);
    const right = unwrapSingleChild(rightRaw);
    const field = selfFieldNameOf(left, selfNames, declaredFields);
    if (!field) continue;

    // `F = <algo que sólo lee F>` no aporta un valor nuevo (swap,
    // `this.x = this.x || y`): no cuenta como "se llena". Se decide por
    // forma —el lado derecho no contiene ninguna lectura de OTRO nombre— no
    // por vocabulario.
    const toNull = isNullLiteral(right);
    if (!toNull) {
      const readsOnlyItself =
        selfFieldNameOf(right, selfNames, declaredFields) === field ||
        (right.type === "identifier" && right.text === field);
      if (readsOnlyItself) continue;
    }

    // Un operador compuesto (`||=`, `??=`, `+=`) nunca VACÍA ni LLENA desde
    // cero: es una actualización sobre el valor previo. Se excluye por el
    // campo genérico `operator`, no por lenguaje.
    const operator = (assign.childForFieldName("operator") as AstNode | null)?.text ?? "=";
    if (operator !== "=" && operator !== ":=") continue;

    out.push({
      field,
      methodName,
      isConstructor,
      startLine: assign.startPosition.row + 1,
      endLine: assign.endPosition.row + 1,
      toNull,
    });
  }
  return out;
}

function classScopedAnchor(file: string, className: string, methodName: string, ordinal?: number) {
  return { file, symbolPath: [className, methodName], ...(ordinal != null ? { ordinal } : {}) };
}

interface Group {
  className: string;
  field: string;
  writes: Write[];
  /** Métodos DISTINTOS (no constructores) que leen el campo sin escribirlo. */
  readers: Set<string>;
}

export function computeTemporaryFieldFindings(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
  const threshold = ctx.threshold("ciclosFueraDelConstructor");
  const groups = new Map<string, Group>();

  const visit = (node: AstNode, cls: { name: string; key: string; fields: ReadonlySet<string> } | null): void => {
    let nextCls = cls;
    if (file.sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
      nextCls = { name, key: `${name}@${node.startPosition.row}`, fields: declaredFieldNames(node) };
    } else if (file.sets.functionNodes.has(node.type)) {
      const goReceiver = goReceiverOf(node);
      const selfNames = new Set(SELF_WORDS);
      let methodCls = nextCls;
      if (goReceiver) {
        selfNames.add(goReceiver.paramName);
        methodCls = { name: goReceiver.typeName, key: `receiver:${goReceiver.typeName}`, fields: new Set<string>() };
      }
      const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
      const methodName = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
      if (body && methodCls) {
        const isCtor = isConstructorMethod(node, methodName, file);
        // Sombreado: un parámetro con el mismo nombre que un campo tapa al
        // campo, así que ese identificador desnudo deja de contar como campo
        // propio en ESTE método (nunca en los demás).
        const shadowed = parameterNamesOf(node);
        const visibleFields = new Set([...methodCls.fields].filter((f) => !shadowed.has(f)));
        const writes = collectWrites(body, methodName, isCtor, selfNames, visibleFields);
        const written = new Set(writes.map((w) => w.field));
        for (const write of writes) {
          const key = `${methodCls.key}::${write.field}`;
          const group = groups.get(key) ?? { className: methodCls.name, field: write.field, writes: [], readers: new Set<string>() };
          group.writes.push(write);
          groups.set(key, group);
        }
        // Lectores: cualquier acceso al campo propio en un método que NO lo
        // escribe. Evidencia (cuántos miembros tienen que tolerar el hueco),
        // nunca criterio de disparo.
        const accesses: AstNode[] = [];
        findAllDescendants(body, (n) => selfFieldNameOf(n, selfNames, visibleFields) !== null, 12, accesses);
        for (const access of accesses) {
          const field = selfFieldNameOf(access, selfNames, visibleFields);
          if (!field || written.has(field)) continue;
          const key = `${methodCls.key}::${field}`;
          const group = groups.get(key) ?? { className: methodCls.name, field, writes: [], readers: new Set<string>() };
          group.readers.add(methodName);
          groups.set(key, group);
        }
      }
    }
    for (const c of namedChildren(node)) visit(c, nextCls);
  };
  visit(file.root, null);

  const findings: RawFinding[] = [];
  // ANCLA CON ORDINAL. `ids.ts#deriveAnchor` sólo mira `[clase, método]`, así
  // que DOS campos temporales distintos de la MISMA clase vaciados en el
  // MISMO método colapsan en el mismo `Finding.id` (un hallazgo pisa al otro
  // en cualquier colección indexada por id — el defecto que
  // `lazy-init-repetida.ts` ya documenta para clases hermanas). Medido: sin
  // ordinal, 24 de 195 ids se repetían sobre los 13 repos. El ordinal es el
  // índice del campo entre los campos temporales de SU clase, ordenados por
  // nombre: estable entre corridas, y sólo se emite cuando hay más de uno.
  const fieldsByClass = new Map<string, string[]>();
  for (const [key, group] of groups) {
    const classKey = key.slice(0, key.lastIndexOf("::"));
    const list = fieldsByClass.get(classKey) ?? [];
    list.push(group.field);
    fieldsByClass.set(classKey, list);
  }
  for (const list of fieldsByClass.values()) list.sort();

  for (const [key, group] of groups) {
    const classKey = key.slice(0, key.lastIndexOf("::"));
    const siblings = fieldsByClass.get(classKey) ?? [group.field];
    const ordinal = siblings.length > 1 ? siblings.indexOf(group.field) : undefined;
    const outside = group.writes.filter((w) => !w.isConstructor);
    const clears = outside.filter((w) => w.toNull);
    const fills = outside.filter((w) => !w.toNull);
    // El ciclo COMPLETO fuera del constructor es el hallazgo: se vacía y se
    // llena. `presencia` (valor 1): un ciclo ya es la forma entera.
    const cycles = Math.min(clears.length, fills.length);
    if (cycles < threshold.value) continue;

    const sites = [...clears, ...fills].sort((a, b) => a.startLine - b.startLine);
    const methodsInvolved = new Set(sites.map((s) => s.methodName));
    const toLocation = (w: Write, i: number): RoleLocation => ({
      file: file.path,
      startLine: w.startLine,
      endLine: w.endLine,
      symbol: w.methodName,
      anchor: classScopedAnchor(file.path, group.className, w.methodName, ordinal),
      role:
        (w.toNull ? `vacía \`${group.field}\`` : `llena \`${group.field}\``) +
        ` (\`${group.className}#${w.methodName}\`, sitio ${i + 1} de ${sites.length})`,
    });
    const [first, ...rest] = sites.map(toLocation);
    if (!first) continue;

    findings.push({
      title: `\`${group.className}.${group.field}\` sólo tiene valor durante parte de la vida del objeto`,
      detail:
        `El campo \`${group.field}\` se LLENA en ${fills.length} sitio(s) y se VACÍA (asignación a nulo) en ` +
        `${clears.length} sitio(s), todos fuera del constructor, repartidos en ${methodsInvolved.size} miembro(s) ` +
        `de \`${group.className}\`. No es un campo del objeto: es una variable de trabajo que vive en el objeto, y ` +
        `${group.readers.size} miembro(s) más que lo leen tienen que tolerar los dos estados. ` +
        "Quien lee la declaración no puede saber cuándo el campo significa algo.",
      trigger: [{ label: "ciclos llenar/vaciar fuera del constructor", value: cycles, threshold }],
      evidence: [
        { label: "sitios que vacían el campo", value: clears.length },
        { label: "sitios que lo llenan", value: fills.length },
        { label: "miembros que sólo lo leen", value: group.readers.size, note: [...group.readers].sort().join(", ") || undefined },
      ],
      locations: [first, ...rest],
      severity: Math.min(100, 35 + methodsInvolved.size * 10 + group.readers.size * 5),
      advice: {
        primary: {
          name: "Extract Class",
          kind: "refactorizacion",
          why: "Un campo que se llena y se vacía es una variable de trabajo disfrazada de estado: mudarla junto con los miembros que la usan a un objeto propio deja a la clase original sin huecos que tolerar.",
          source: "https://refactoring.guru/es/smells/temporary-field",
        },
        pattern: {
          name: "State",
          kind: "patron_de_diseno",
          why: "Si los miembros que leen el campo se comportan distinto según esté lleno o vacío, esa condición ES un estado del objeto, y State la convierte en un tipo en vez de una comprobación repetida.",
          source: "https://refactoring.guru/es/design-patterns/state",
          caveat:
            "Sólo aplica si el comportamiento cambia con el hueco; si el campo simplemente no se usa mientras está vacío, la respuesta es Extract Class y nada más.",
          cost: "Suma una jerarquía de estados: con dos estados y un solo lector, es más estructura que beneficio.",
        },
      },
    });
  }
  return findings;
}

export const detector: IntraFileDetector<ThresholdKey, "temporary-field"> = {
  id: "temporary-field",
  kind: "temporary-field",
  scope: "intra-file",
  title: "Campo temporal",
  // SIN `needs: ["unidad-tipo-clase"]`, misma razón exacta que
  // `lazy-init-repetida.ts` documenta: la forma "dueño de campos" se
  // reconoce por DOS vías independientes — la gramática (`classNodes`) y el
  // receptor de método de Go — y Go no declara esa capacidad pese a tener la
  // forma. Declararla dejaría a Go en silencio por una razón falsa.
  needs: [],
  thresholds: {
    // R3 (auditoría de umbrales inventados): binario por definición del
    // hallazgo. "¿Existe, fuera del constructor, un ciclo llenar/vaciar?" no
    // tiene magnitud intermedia que calibrar: con cero ciclos el campo es un
    // campo normal, con uno ya es un campo temporal. No es un piso elegido a
    // mano.
    ciclosFueraDelConstructor: presencia({
      rationale:
        "Un campo que se llena y se vacía UNA sola vez fuera del constructor ya tiene el ciclo completo que define el olor: hay un tramo de la vida del objeto en el que vale algo y otro en el que, por decisión del propio código, no vale nada. No hay una magnitud intermedia entre 'nunca se vacía' (un campo normal, o memoización) y 'se vacía'.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    return computeTemporaryFieldFindings(file, ctx);
  },
};
