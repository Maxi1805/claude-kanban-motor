/**
 * *** REACTIVADO — frente de precisión de smells (8 lenguajes), tras haber
 * estado APAGADO desde la ola de precisión posterior a la Ola D ***
 *
 * POR QUÉ ESTABA APAGADO. `hypotheses/proxy.ts` había juzgado 28 hipótesis
 * a mano contra código real (Rails + `src/`): 0 verdaderas. Causa medida:
 * el criterio de esta ancla era "2+ miembros TOCAN el mismo campo" —
 * cualquier campo usado por más de un método de una clase cumple eso, sea o
 * no perezoso (`ancla-equivocada`, 7/28: un campo inyectado UNA vez en el
 * constructor y usado desde 2+ métodos — composición normal, lo OPUESTO de
 * "perezoso"). La condición de reactivación que ese archivo dejó escrita:
 * *"medí primero cuántos casos con guarda real existen; si son cero, apagar
 * es la respuesta correcta"* — medido entonces sobre Rails (0/254) y `src/`
 * (0/173): 0 de 427 grupos tenían `guardSites.length >= 2`. Apagar era, en
 * ese momento, con esa evidencia, la decisión correcta.
 *
 * POR QUÉ SE REACTIVA AHORA — LA MEDICIÓN QUE FALTABA. Esta ola mide sobre
 * el CORPUS de 8 lenguajes, no sólo Ruby/TypeScript — y ahí la condición
 * SÍ se cumple: `corpus/jekyll` (103 archivos `.rb`, población real,
 * `scripts/measure-proxy-real-guards.mts`) tiene **1 grupo con
 * `guardSites.length >= 2`**: `Jekyll::Plugin@children`
 * (`lib/jekyll/plugin.rb:25` y `:33`) —
 * `(@children ||= Set.new).add const_` dentro de `catch_inheritance`, y
 * `@children ||= Set.new` dentro de `descendants`, la MISMA guarda
 * independiente repetida en 2 métodos de clase distintos. Es exactamente
 * la forma que el nombre del kind promete, verificada a mano abriendo el
 * archivo. La condición (a) de reactivación de `hypotheses/proxy.ts` —
 * "`groupsWithGuardSites2plus > 0`, medido de nuevo sobre una población
 * fresca" — se cumple.
 *
 * EL ARREGLO, no sólo la reactivación: el criterio de emisión de este
 * archivo cambió de "2+ miembros CONSTRUYEN o REFERENCIAN el campo" (la
 * forma vieja, envolvente de ambas variantes) a **"2+ miembros GUARDAN
 * (`isGuarded`, ver `matchGuardField`) su propia construcción del campo"**
 * — sólo la variante perezosa-con-guarda, nunca la variante general de
 * reenvío sin guarda (que medía 0% de precisión). La fixture canónica
 * `ShapeProxy` (construcción única, sin guarda, en el constructor, reenviada
 * desde 2+ métodos) YA NO produce un hallazgo — ver los tests: es,
 * literalmente, la forma que el juicio de 28 casos mostró como falsa.
 *
 * `hypotheses/proxy.ts` NO es archivo mío en esta ola (es de Ola I) — sigue
 * con SU PROPIO apagado (`build`/`refresh` devuelven `null`), así que la
 * recomendación de PATRÓN Proxy sigue sin colgar de este ancla hasta que ese
 * frente reactive la suya. Lo que SÍ cambia, y es mío: el `Finding` crudo
 * (el "smell") vuelve a emitirse, con el criterio corregido — antes emitía
 * con un criterio medido en 0% de precisión; ahora emite sólo la forma con
 * evidencia real de repetición.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Lo que sigue (histórico, Ola 10) describe el diseño ORIGINAL, antes del
 * apagado y de este arreglo — la forma "ambas variantes envueltas" que el
 * párrafo de arriba explica por qué se abandonó.
 * ────────────────────────────────────────────────────────────────────────
 *
 * `lazy-init-repetida` — Ola 10, CONTRATO-F10.md, tarea Proxy: promueve a
 * detector propio la forma AUSENTE que hasta ahora sólo `hypotheses/proxy.ts`
 * podía leer, y sólo vía `ctx.repo.clones` (el mismo índice de huellas que
 * `duplication.ts`/`scattered-instantiation.ts` ya arman) — nunca de forma
 * independiente. Nota del encargo: "la forma '>=2 miembros de X con
 * `references(receiver-member)` al MISMO campo, cada uno bajo una guarda de
 * nulidad' es medible sin clones y se sostiene sola".
 *
 * *** GENERALIZACIÓN DECLARADA (requisito 3 del encargo: "si no podés
 * distinguir, decilo") *** La nota describe LITERALMENTE la variante
 * perezosa-con-guarda (cada sitio repite `if (!this.x) { this.x = new X() }`).
 * Verificado contra la fixture canónica de Proxy (`fixtures-multi/proxy/*`):
 * su forma POSITIVA (`ShapeProxy`) no tiene NINGUNA guarda — construye el
 * colaborador una única vez, sin condición, en el constructor, y lo reenvía
 * desde 2+ miembros. Si este detector exigiera la guarda al pie de la letra,
 * jamás ancoraría esa fixture y `hypotheses/proxy.ts` quedaría en silencio
 * sobre su propio caso canónico — exactamente el séptimo síntoma que esta
 * ola vino a cerrar (maquinaria construida, nadie con qué invocarla). Por
 * eso el REQUISITO aquí es el ENVOLVENTE de ambas variantes, ambas
 * estructurales, cero vocabulario de nombres:
 *
 *   1. El campo `F` de una clase `X` se construye (`new`/equivalente) en AL
 *      MENOS un sitio de `X` (guardado o no).
 *   2. `F` se REFERENCIA por receptor (`this.F`/`self.F`/`@F`/`recv.F`) desde
 *      AL MENOS 2 miembros DISTINTOS de `X` — la prueba de una guarda cuenta
 *      como referencia igual que un reenvío (`this.F.metodo()`).
 *
 * La forma PARTICULAR (¿las ≥2 referencias son guardas redundantes, o son
 * reenvíos homónimos a un colaborador ya construido una vez?) es DELIBERA-
 * DAMENTE terreno de `hypotheses/proxy.ts`, no de este detector: el detector
 * sólo confirma que hay evidencia suficiente para que valga la pena mirar
 * con más cuidado (mismo reparto de trabajo que `duplication`/`clones` ya
 * tenían con la hipótesis antes de esta ola). Declarado, no escondido.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: ningún nombre de campo, clase o método
 * se compara contra una lista — "es un acceso al propio receptor" se decide
 * por tipo de nodo (`instance_variable` de Ruby) o por pertenencia a
 * `selfNames` (`this`/`self`/el parámetro receptor de Go, nunca una lista de
 * nombres de dominio), y "es construcción" por forma de nodo
 * (`new_expression`/`object_creation_expression`/`composite_literal`/`&Tipo{`/
 * `Tipo.new`/`Tipo(...)` con receptor en mayúscula) — el mismo criterio que
 * `hypotheses/proxy.ts` (Ola 9/F6) ya documenta y prueba.
 *
 * DUPLICACIÓN DECLARADA: las primitivas de forma (`namedChildren`, `objectOf`,
 * `isSelfFieldAccess`, `isConstructionLike`, `goReceiverOf`, ...) son una
 * copia deliberada del mismo subconjunto que `hypotheses/proxy.ts` trae
 * adaptado a `AstNode` — mismo criterio que ese archivo documenta para
 * `pattern-wrapping.ts` (`detect/*` no puede importar de `hypotheses/*`,
 * capas invertidas; ver también `detect/intra-function/flag-accumulator.ts`,
 * que declara la MISMA duplicación frente a `hypotheses/decorator.ts` esta
 * misma ola).
 *
 * QUÉ YA NO HACE (post-arreglo, ver "REACTIVADO" arriba): YA NO cuenta un
 * reenvío sin guarda como evidencia suficiente — `isGuarded` (`matchGuardField`)
 * exige la guarda real. Lo que sigue sin decidir: si algún reenvío hace algo
 * más que reenviar (control de acceso, caché, log) — esa pregunta necesita
 * mirar CADA miembro con más detalle del que un `RawFinding` puede cargar
 * (`hypotheses/proxy.ts` re-escanea `ctx.fileAt` con esa granularidad, ahora
 * alcanzable en producción porque este detector es `intra-file`: su
 * `Finding` pasa por `attachHypotheses` DENTRO de `analyzeFile`, con árbol
 * vivo — a diferencia de `duplication`/`scattered-instantiation`, que son
 * `inter-file` y SIEMPRE ven `ctx.file ===
 * null`, ver `hypotheses/run.ts`).
 */
import { presencia } from "../thresholds.js";
import type { AstNode, FileUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

/**
 * `RoleLocation.anchor` explícito, con la CLASE como primer segmento del
 * `symbolPath` — sin esto, `ids.ts#deriveAnchor` cae a `symbolPath:
 * [loc.symbol]` (sólo el nombre del miembro), y dos clases hermanas en el
 * MISMO archivo con miembros homónimos (`constructor`/`area`/`paint`, EXACTA-
 * MENTE la forma de la fixture canónica de Proxy — `ShapeProxy`/`PureWrapper`)
 * producen el MISMO `Anchor` serializado para ambas, y por lo tanto el MISMO
 * `Finding.id` (`findingId`, `ids.ts`) — un hallazgo pisa al otro en
 * cualquier colección indexada por id. Encontrado por prueba directa contra
 * esta fixture: sin este campo, el hallazgo de `ShapeProxy` desaparecía y el
 * de `PureWrapper` quedaba duplicado.
 */
function classScopedAnchor(file: string, className: string, methodName: string) {
  return { file, symbolPath: [className, methodName] };
}

type ThresholdKey = "distinctMembers";

const SELF_WORDS = new Set(["this", "self"]);
/** Ruby: `@x` es un único token con sigilo, sin receptor explícito. */
const RUBY_IVAR_TYPE = "instance_variable";
const OBJECT_FIELDS = ["object", "operand"];
const NEW_EXPR_TYPE = /^(new_expression|object_creation_expression)$/;

/** Mismo filtro que `hypotheses/proxy.ts#namedChildren` (ver ahí el porqué:
 *  un comentario puede ser hijo NOMBRADO de un bloque en varias gramáticas,
 *  confirmado por sonda directa contra `tree-sitter-java`) — acá no alimenta
 *  ningún heurístico de conteo de statements (este detector no calcula
 *  `hasExtraBehavior`), pero se mantiene igual por consistencia con la
 *  duplicación declarada frente a ese archivo. */
const COMMENT_NODE_TYPE = /comment/i;

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

/** Todos los descendientes (incluido `node`) que cumplen `pred`, acotados en profundidad. */
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

function isSelfFieldAccess(node: AstNode, selfNames: ReadonlySet<string>): boolean {
  if (node.type === RUBY_IVAR_TYPE) return true;
  const obj = objectOf(node);
  return obj !== null && selfNames.has(obj.text);
}

function fieldKeyOf(node: AstNode): string {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  return memberNameOf(node) ?? node.text;
}

function calleeLeadText(node: AstNode): string {
  const m = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/.exec(node.text);
  return m ? m[1]! : "";
}

/** Cualquier nodo "de llamada": Ruby (`call`), Go (`call_expression`), y
 *  cualquier otra gramática con un tipo que contenga "call" — mismo criterio
 *  genérico que `isCallLike` ya usa en `hypotheses/proxy.ts`, en vez de
 *  listar un tipo exacto por lenguaje (confirmado por sonda directa contra
 *  `tree-sitter-go.wasm`: el nodo de `NewRealShape()` es `call_expression`,
 *  NUNCA `call` a secas — un match exacto lo perdía en silencio). */
const CALL_NODE_TYPE = /call/i;

/** Misma forma que `hypotheses/proxy.ts#isConstructionLike` — genérica entre
 *  `new X()` (JS/TS/C#/Java), `&Tipo{...}` (Go), `Tipo.new` (Ruby) y
 *  `Tipo(...)` con receptor en mayúscula (Python/Go). */
function isConstructionLike(node: AstNode): boolean {
  if (NEW_EXPR_TYPE.test(node.type)) return true;
  if (node.type === "composite_literal") return true;
  if (node.type === "unary_expression" && node.text.startsWith("&")) {
    return findDescendant(node, (n) => n.type === "composite_literal", 2) !== null;
  }
  if (CALL_NODE_TYPE.test(node.type)) {
    const lead = calleeLeadText(node);
    if (!lead) return false;
    return /\.new$/.test(lead) || /^[A-Z]/.test(lead.split(".")[0]!);
  }
  return false;
}

/** Único vehículo de Go para "campo propio"/"clase dueña": el `receiver` de un método libre. */
function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  const typeNode = findDescendant(decl, (n) => n.type === "type_identifier", 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}

interface Touch {
  field: string;
  methodName: string;
  startLine: number;
  endLine: number;
  /** `true` ⇒ este sitio CONSTRUYE el campo (además de referenciarlo). */
  isConstruction: boolean;
  /** `true` ⇒ este sitio construye el campo bajo una GUARDA real (ver
   *  `matchGuardField`) — el requisito que distingue el ARREGLO de esta
   *  ola de la forma vieja (cualquier construcción, guardada o no). */
  isGuarded: boolean;
}

/**
 * ARREGLO (medido en el corpus, no en Rails/`src/` como la Ola D): ¿es
 * `node` una guarda REAL de inicialización perezosa? Copia adaptada,
 * deliberada, de `hypotheses/proxy.ts#matchGuardFieldAst` sobre las
 * primitivas propias de este archivo (ver "DUPLICACIÓN DECLARADA" en el
 * docstring de cabecera — `detect/*` no puede importar de `hypotheses/*`).
 * Dos formas, confirmadas por sonda directa contra Ruby/TypeScript/Python:
 *
 *   1. `if (<prueba de F>) { F = <construcción> }` — el campo TESTEADO en
 *      la condición y el campo ASIGNADO en el cuerpo son EL MISMO
 *      (`fieldKeyOf` de ambos coincide) — cubre `if (!this.x) this.x = new
 *      Y()` y el `unless defined?(@x)` de Ruby (ambos exponen `condition`).
 *   2. `F ||= <construcción>` / `F ??= <construcción>` — nodo de asignación
 *      cuyo campo `operator` (confirmado por sonda: `operator_assignment`
 *      en Ruby, `augmented_assignment_expression` en TS/JS, ambos con
 *      `left`/`right`/`operator` como campos genéricos) es uno de los dos
 *      operadores compuestos — la nulidad queda implícita en el operador,
 *      sin necesitar un `if` envolvente.
 *
 * Devuelve la clave del campo guardado, o `null` si `node` no es ninguna de
 * las dos formas — nunca decide por nombre de campo o de clase, sólo por
 * FORMA (campo `condition`/`operator`, nunca vocabulario de dominio).
 */
function matchGuardField(node: AstNode, selfNames: ReadonlySet<string>): string | null {
  if (hasField(node, "condition")) {
    const condition = node.childForFieldName("condition") as AstNode;
    const tested = findDescendant(condition, (n) => isSelfFieldAccess(n, selfNames), 4);
    if (!tested) return null;
    const consequence = (node.childForFieldName("consequence") as AstNode | null) ?? (node.childForFieldName("body") as AstNode | null);
    if (!consequence) return null;
    const assign = findDescendant(consequence, isAssignmentLike, 4);
    if (!assign) return null;
    const left = unwrapSingleChild((assign.childForFieldName("left") as AstNode | null) ?? assign);
    if (!isSelfFieldAccess(left, selfNames)) return null;
    const key = fieldKeyOf(left);
    if (key !== fieldKeyOf(tested)) return null;
    const right = assign.childForFieldName("right") as AstNode | null;
    if (!right || !isConstructionLike(unwrapSingleChild(right))) return null;
    return key;
  }
  if (isAssignmentLike(node)) {
    const operator = (node.childForFieldName("operator") as AstNode | null)?.text ?? "";
    if (!/\|\||\?\?/.test(operator)) return null;
    const left = unwrapSingleChild((node.childForFieldName("left") as AstNode | null) ?? node);
    if (!isSelfFieldAccess(left, selfNames)) return null;
    const right = node.childForFieldName("right") as AstNode | null;
    if (!right || !isConstructionLike(unwrapSingleChild(right))) return null;
    return fieldKeyOf(left);
  }
  return null;
}

/** Todos los campos guardados (forma real, ver `matchGuardField`) dentro de
 *  `body` — un `Set` porque un mismo método puede guardar varios campos
 *  distintos, cada uno independiente. Busca candidatos por FORMA (cualquier
 *  nodo con campo `condition`, o cualquier asignación) antes de pedirle a
 *  `matchGuardField` que decida — mismo criterio de dos pasos que
 *  `hypotheses/proxy.ts#analyzeMethod`. */
function guardedFieldsIn(body: AstNode, selfNames: ReadonlySet<string>): Set<string> {
  const candidates: AstNode[] = [];
  findAllDescendants(body, (n) => hasField(n, "condition") || isAssignmentLike(n), 10, candidates);
  const guarded = new Set<string>();
  for (const candidate of candidates) {
    const field = matchGuardField(candidate, selfNames);
    if (field) guarded.add(field);
  }
  return guarded;
}

/**
 * Go NO tiene constructores: el idioma es una función libre (`func
 * NewShapeProxy() *ShapeProxy { return &ShapeProxy{real: NewRealShape()} }`,
 * ver la fixture canónica de Proxy) que construye el struct con un LITERAL
 * de composición, NUNCA con una asignación (`recv.campo = ...`) — esa función
 * no tiene receptor, así que `isSelfFieldAccess`/`collectFieldTouches` (que
 * dependen de `this`/`self`/receptor) no ven nada ahí. Esta función busca,
 * en TODO el cuerpo (de cualquier función, tenga o no receptor), literales
 * `TipoStruct{campo: <construcción>, ...}` y devuelve un sitio de
 * CONSTRUCCIÓN por cada campo cuyo valor es construction-like — clave por
 * `receiver:<TipoStruct>`, la MISMA que usa `collectFieldTouches` para los
 * métodos CON receptor de ese struct (`goReceiverOf`), así que ambos lados
 * (el sitio que construye, los sitios que reenvían) terminan en el MISMO
 * grupo (clase, campo).
 */
function collectCompositeLiteralWrites(fnNode: AstNode, body: AstNode, methodName: string): { classKey: string; className: string; touch: Touch }[] {
  const out: { classKey: string; className: string; touch: Touch }[] = [];
  const literals: AstNode[] = [];
  findAllDescendants(body, (n) => n.type === "composite_literal", 12, literals);
  for (const lit of literals) {
    const typeNode = lit.childForFieldName("type") as AstNode | null;
    if (!typeNode) continue;
    const className = typeNode.text;
    const keyedElements: AstNode[] = [];
    findAllDescendants(lit, (n) => n.type === "keyed_element", 4, keyedElements);
    for (const ke of keyedElements) {
      const kids = namedChildren(ke);
      const keyNode = (ke.childForFieldName("key") as AstNode | null) ?? kids[0] ?? null;
      const valueNode = (ke.childForFieldName("value") as AstNode | null) ?? kids[1] ?? null;
      if (!keyNode || !valueNode) continue;
      if (!isConstructionLike(unwrapSingleChild(valueNode))) continue;
      out.push({
        classKey: `receiver:${className}`,
        className,
        touch: {
          field: keyNode.text,
          methodName,
          startLine: fnNode.startPosition.row + 1,
          endLine: fnNode.endPosition.row + 1,
          isConstruction: true,
          // Un literal de composición es SIEMPRE construcción incondicional
          // (no hay forma de "guardar" un campo dentro de `Tipo{campo: ...}`)
          // — nunca puede ser la forma perezosa que esta ola exige.
          isGuarded: false,
        },
      });
    }
  }
  return out;
}

/** Todos los sitios donde ALGÚN miembro de `cls` referencia (por receptor)
 *  un campo propio — como prueba de guarda, como LHS de una construcción, o
 *  como receptor de un reenvío (`this.F.metodo()`, cualquier profundidad). */
function collectFieldTouches(fnNode: AstNode, body: AstNode, methodName: string, selfNames: ReadonlySet<string>): Touch[] {
  const out: Touch[] = [];
  const seenPerField = new Set<string>();

  const selfAccesses: AstNode[] = [];
  findAllDescendants(body, (n) => isSelfFieldAccess(n, selfNames), 10, selfAccesses);

  // Una sola pasada por método (no por acceso) — mismo campo que
  // `matchGuardField` reconoce, ver su docstring para las dos formas.
  const guardedFields = guardedFieldsIn(body, selfNames);

  for (const access of selfAccesses) {
    const field = fieldKeyOf(access);
    if (seenPerField.has(field)) continue; // un sitio por (miembro, campo) — evita contar 2 veces el mismo reenvío
    seenPerField.add(field);

    // ¿Este acceso es el LADO IZQUIERDO de una construcción? Se busca el
    // ancestro asignación más cercano cuyo `left` (desenvuelto) SEA este
    // nodo — como no hay puntero al padre, se recorre `body` buscando la
    // asignación cuyo LHS coincide, acotado en profundidad (mismo criterio
    // que `hypotheses/proxy.ts#matchGuardFieldAst`).
    let isConstruction = false;
    const assigns: AstNode[] = [];
    findAllDescendants(body, isAssignmentLike, 10, assigns);
    for (const assign of assigns) {
      const left = unwrapSingleChild((assign.childForFieldName("left") as AstNode | null) ?? assign);
      if (!isSelfFieldAccess(left, selfNames) || fieldKeyOf(left) !== field) continue;
      const right = assign.childForFieldName("right") as AstNode | null;
      if (right && isConstructionLike(unwrapSingleChild(right))) {
        isConstruction = true;
        break;
      }
    }

    out.push({
      field,
      methodName,
      startLine: fnNode.startPosition.row + 1,
      endLine: fnNode.endPosition.row + 1,
      isConstruction,
      isGuarded: guardedFields.has(field),
    });
  }
  return out;
}

/**
 * El escaneo entero, SIN CAMBIOS de comportamiento respecto de antes del
 * apagado (ver el docstring de cabecera del archivo) — ya no la llama
 * `detector.run` (abajo, devuelve `[]` sin invocarla). Exportada para que
 * `lazy-init-repetida.test.ts` la siga ejerciendo directamente y para que
 * una reactivación futura (condición exacta en `hypotheses/proxy.ts`) la
 * tenga ya escrita y ya probada.
 */
export function computeLazyInitRepetidaFindings(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("distinctMembers");
    const findings: RawFinding[] = [];

    // (className, field) -> sitios que la tocan, uno por miembro distinto.
    const groups = new Map<string, { className: string; field: string; touches: Touch[] }>();

    const visit = (node: AstNode, cls: { name: string; key: string } | null): void => {
      let nextCls = cls;
      if (file.sets.classNodes.has(node.type)) {
        const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
        nextCls = { name, key: `${name}@${node.startPosition.row}` };
      } else if (file.sets.functionNodes.has(node.type)) {
        const goReceiver = goReceiverOf(node);
        const selfNames = new Set(SELF_WORDS);
        let methodCls = nextCls;
        if (goReceiver) {
          selfNames.add(goReceiver.paramName);
          methodCls = { name: goReceiver.typeName, key: `receiver:${goReceiver.typeName}` };
        }
        const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
        const methodName = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
        if (body) {
          if (methodCls) {
            for (const touch of collectFieldTouches(node, body, methodName, selfNames)) {
              const key = `${methodCls.key}::${touch.field}`;
              const group = groups.get(key) ?? { className: methodCls.name, field: touch.field, touches: [] };
              group.touches.push(touch);
              groups.set(key, group);
            }
          }
          // Go: función libre sin receptor que construye un struct por
          // literal de composición (`&Tipo{campo: ...}`) — ver el docstring
          // de `collectCompositeLiteralWrites`. Corre SIEMPRE, tenga o no
          // `methodCls`, porque el idioma no depende de un receptor.
          for (const { classKey, className, touch } of collectCompositeLiteralWrites(node, body, methodName)) {
            const key = `${classKey}::${touch.field}`;
            const group = groups.get(key) ?? { className, field: touch.field, touches: [] };
            group.touches.push(touch);
            groups.set(key, group);
          }
        }
      }
      for (const c of namedChildren(node)) visit(c, nextCls);
    };
    visit(file.root, null);

    for (const { className, field, touches } of groups.values()) {
      // ARREGLO (frente de precisión — ver el docstring de cabecera para la
      // medición completa): el criterio YA NO es "2+ miembros TOCAN el
      // campo" (eso es composición normal: cualquier campo usado por más de
      // un método lo cumple, medido en 0/28 verdaderos) — es "2+ miembros
      // GUARDAN su propia construcción" (`isGuarded`, ver `matchGuardField`),
      // la forma LITERAL que el nombre del kind promete. Un mapa por
      // miembro, quedándose con el primer toque GUARDADO de cada uno.
      const guardedMembers = new Map<string, Touch>();
      for (const t of touches) if (t.isGuarded && !guardedMembers.has(t.methodName)) guardedMembers.set(t.methodName, t);
      // `threshold.value` es 1 (`presencia()`, R3): `> 1` es exactamente `>= 2`.
      if (guardedMembers.size <= threshold.value) continue;

      const sites = [...guardedMembers.values()].sort((a, b) => a.startLine - b.startLine);
      const restLocations: RoleLocation[] = sites.slice(1).map((s, i) => ({
        file: file.path,
        startLine: s.startLine,
        endLine: s.endLine,
        symbol: s.methodName,
        anchor: classScopedAnchor(file.path, className, s.methodName),
        role: `sitio ${i + 2} de ${sites.length} que referencia \`${field}\` (\`${className}\`)`,
      }));
      const locations: readonly [RoleLocation, ...RoleLocation[]] = [
        {
          file: file.path,
          startLine: sites[0]!.startLine,
          endLine: sites[0]!.endLine,
          symbol: sites[0]!.methodName,
          anchor: classScopedAnchor(file.path, className, sites[0]!.methodName),
          role: `sitio 1 de ${sites.length} que referencia \`${field}\` (\`${className}\`)`,
        },
        ...restLocations,
      ];

      findings.push({
        title: `\`${className}\` repite la guarda de inicialización perezosa de \`${field}\` en ${sites.length} miembros`,
        detail:
          `El campo \`${field}\` de \`${className}\` se inicializa de forma perezosa (guarda de nulidad + construcción) ` +
          `de forma INDEPENDIENTE en ${sites.length} miembros distintos — la misma comprobación y la misma construcción, ` +
          "copiada en cada sitio en vez de vivir en un único accessor. Un dato nuevo que agregar a la construcción, o un " +
          "cambio en la condición de guarda, obliga a tocar cada copia por separado.",
        trigger: [{ label: "miembros que repiten la guarda", value: sites.length, threshold }],
        locations,
        severity: Math.min(100, 30 + sites.length * 15),
        advice: {
          primary: {
            name: "Extract dedicated accessor",
            kind: "refactorizacion",
            why: "Centralizar la guarda y la construcción del campo colaborador en un único accessor perezoso evita que cada miembro repita la misma comprobación por su cuenta.",
            source: "https://refactoring.guru/design-patterns/proxy",
          },
        },
      });
    }

    return findings;
}

export const detector: IntraFileDetector<ThresholdKey, "lazy-init-repetida"> = {
  id: "lazy-init-repetida",
  kind: "lazy-init-repetida",
  scope: "intra-file",
  title: "Guarda de inicialización perezosa repetida",
  // SIN "unidad-tipo-clase": a diferencia de `large-class` (que sólo cuenta
  // miembros de una unidad-tipo ya identificada por la gramática), este
  // detector reconoce la forma "clase" por DOS vías independientes — la
  // gramática (`file.sets.classNodes`, JS/TS/Python/Ruby/Java/C#) Y el
  // receptor de método de Go (`goReceiverOf`)/el struct de un literal de
  // composición (`collectCompositeLiteralWrites`), NINGUNA de las cuales
  // depende de que el lenguaje tenga una capacidad "unidad-tipo-clase"
  // declarada — Go no la declara (confirmado por prueba directa: `run()`
  // nunca se invocaba con `needs` puesto, la fixture canónica de Proxy en
  // Go quedaba en silencio) pese a que SÍ tiene la forma "struct + método
  // con receptor" que este detector necesita.
  needs: [],
  thresholds: {
    // R3 (auditoría de umbrales inventados): binario por definición del
    // hallazgo ("¿MÁS de un miembro repite la misma guarda?"), no un piso
    // elegido a mano — 1 sola ocurrencia es memoización/reenvío normal (un
    // accessor perezoso), y no hay magnitud intermedia entre "un miembro" y
    // "más de uno" que calibrar. Antes `pisoDeclarado(2, …)`, alineado con
    // `hypotheses/threshold-alignment.test.ts` (sigue alineado: ese archivo
    // lee `spec.value`, que ahora es 1 — el comportamiento real del
    // detector, "2 o más miembros distintos", no cambia, ver el `run()`).
    distinctMembers: presencia({
      rationale:
        "Un único miembro que guarda y construye su propio campo colaborador es forma normal (un accessor perezoso). " +
        "Recién con 2 o más miembros DISTINTOS repitiendo la MISMA guarda hay algo que centralizar.",
    }),
  },
  /**
   * REACTIVADO (frente de precisión de esta ola) — ver el docstring de
   * cabecera del módulo, sección "REACTIVACIÓN", para la medición completa.
   * Resumen: la condición (a) que `hypotheses/proxy.ts` dejó escrita para
   * reactivar el camino perezoso —"`groupsWithGuardSites2plus > 0` medido
   * sobre una población FRESCA, no `tests/fixtures/patterns`"— se cumple:
   * `corpus/jekyll` (103 archivos Ruby reales) tiene 1 grupo así
   * (`Jekyll::Plugin@children`, `lib/jekyll/plugin.rb:25,33`, dos guardas
   * `||=` independientes sobre el mismo campo de clase). El arreglo de este
   * archivo (exigir `isGuarded` en vez de cualquier `isConstruction`, ver
   * `matchGuardField`) es precisamente la exigencia que esa condición pedía.
   * `hypotheses/proxy.ts` queda con SU PROPIO apagado intacto — no es
   * archivo mío en esta ola — así que la recomendación de PATRÓN (Proxy)
   * sigue sin colgar de este ancla hasta que ese frente reactive la suya con
   * la misma evidencia.
   */
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    return computeLazyInitRepetidaFindings(file, ctx);
  },
};
