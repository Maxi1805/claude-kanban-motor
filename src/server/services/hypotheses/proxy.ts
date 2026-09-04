/**
 * *** APAGADO — frente Proxy, ola de precisión posterior a la Ola D ***
 *
 * `hypothesis.build`/`hypothesis.refresh` devuelven `null` INCONDICIONALMENTE
 * (ver el final de este archivo) — Proxy no emite ninguna recomendación hoy.
 * Todo lo demás (el escaneo, las dos formas, el refuerzo de grafo) queda
 * intacto abajo, vivo sólo para los tests que documentan la forma y para una
 * eventual reactivación — no es la "maquinaria huérfana" que el proyecto ya
 * nombró siete veces: acá está huérfana A PROPÓSITO, con la causa medida.
 *
 * POR QUÉ. La Ola D juzgó a mano 28 hipótesis de Proxy contra el código
 * fuente real (Rails + `src/`): **0 de 28 verdaderas** (Wilson 95% [0%, 12%]).
 * Causas del juicio: `idioma-framework` 19 (el idiom `before_action :set_x` +
 * lectura de `@x` desde varias acciones — ActiveRecord CRUD, no Proxy),
 * `ancla-equivocada` 7 (un campo inyectado UNA vez en el constructor y usado
 * desde 2+ métodos — composición normal, lo opuesto de "perezoso"),
 * `evidencia-otro-archivo` 2 (el ancla cita líneas que ni siquiera tocan el
 * campo que dice citar). Las notas fila-por-fila están en
 * `tests/golden/precision/{rails,ck-analyzer}.hypotheses.csv`, filtradas por
 * `pattern === "Proxy (inicialización perezosa)"`.
 *
 * LA MEDICIÓN QUE ESTA OLA AGREGÓ, ANTES DE DECIDIR. La instrucción del
 * encargo era concreta: "medí primero cuántos casos con guarda real existen
 * en las dos poblaciones; si son cero, apagar es la respuesta correcta". Se
 * corrió `scanFileForProxyFields` (el MISMO escaneo de abajo, sin cambios)
 * sobre CADA archivo de las dos poblaciones reales, vía `resolveLiveFileUnit`
 * (el mismo parseo bajo demanda que usa `ctx.fileAt` en producción) —
 * `scripts/measure-proxy-real-guards.mts`, reproducible:
 *
 *   Rails (431 `.rb` no-test):    254 grupos (clase,campo) — 0 con guarda
 *                                  real repetida (`guardSites.length >= 2`,
 *                                  vía `matchGuardFieldAst`: `if (!x) x = new
 *                                  Y()` o `x ||= new Y()`/`x ??= new Y()`).
 *   `src/` (175 `.ts`/`.tsx`):     173 grupos — 0 con guarda real repetida.
 *   TOTAL:                        427 grupos (clase,campo) en 606 archivos —
 *                                  **0 con guarda real**. El resto (407
 *                                  grupos) sólo tiene `forwardSites >= 1`
 *                                  (la forma GENERAL, sin guarda) o una
 *                                  escritura sin guarda sin reenvío (12).
 *
 * Es decir: la forma PEREZOSA completa (guardas repetidas, la que el nombre
 * del patrón promete) **no existe estructuralmente** en ninguna de las dos
 * poblaciones reales — no es que el detector no la vea, es que no está. El
 * camino 1 del encargo ("exigir la guarda de verdad y volver a medir") no
 * tiene sobre qué pararse: exigirla no deja ni una hipótesis en pie.
 *
 * Lo único que SÍ dispara hoy es la forma GENERAL (`reenvio-general`,
 * `forwardSites >= 1`) — y los 28 juicios de la Ola D son, sin excepción,
 * sobre ESA forma (`lazy-init-repetida`, antes citada como "antes/uno-lee-
 * varios"), no sobre la perezosa. El defecto de fondo, verificado leyendo
 * `app/sidekiq/admin/summary_organizations_job.rb` y una decena de
 * controllers más: `isSelfFieldAccess`/`forwardSites` (abajo) cuentan
 * CUALQUIER lectura de un campo propio desde un miembro que no lo escribe
 * como "reenvío" — nunca verifican que el MIEMBRO que reenvía se llame IGUAL
 * que el método invocado sobre el campo (la homonimia real de Proxy/
 * Decorator), así que `before_action :set_lead` seguido de `def show; render
 * json: { lead: @lead.to_admin_hash }; end` cuenta exactamente igual que
 * `ShapeProxy#area() { return this.real.area(); }` — composición ordinaria de
 * Rails y forma de Proxy quedan indistinguibles con el chequeo de hoy.
 *
 * Y el refuerzo más fuerte que existía para discriminar esos dos casos —la
 * terna de envoltura del grafo (`implements|satisfies` + `calls(receiver-
 * member)` + aridad, `wrapping-chain.ts`)— ya estaba MEDIDO INERTE (0
 * matches) en los 8 repos del corpus antes de esta ola (ver el docstring de
 * "EL REFUERZO DE GRAFO" más abajo, sin cambios). No hay una segunda señal
 * con la que reforzar la forma general tampoco.
 *
 * CONDICIÓN EXACTA DE REACTIVACIÓN (cualquiera de las dos, medida de nuevo
 * sobre una población fresca, no sobre `tests/fixtures/patterns`):
 *
 *   (a) Camino perezoso: `scripts/measure-proxy-real-guards.mts` (o su
 *       sucesor) encuentra `groupsWithGuardSites2plus > 0`. Ahí sí tiene
 *       sentido volver a activar el estado `ausente`/`aplicado-eludido`/
 *       `ya-aplicado` de la forma `guardas-repetidas` — pero igual hace falta
 *       juzgar a mano >=15 casos frescos de ESA forma y llegar a >=50%.
 *   (b) Camino general: `wrapping-chain.ts#findWrappingChains` deja de estar
 *       inerte — produce >=1 match confirmado con `fan-out > 1` sobre una
 *       población real (no sintética). Recién ahí el discriminador
 *       `confirmado-por-grafo-terna` aporta algo que hoy no aporta, y
 *       requeriría hacerlo OBLIGATORIO (no sólo discriminador) para la forma
 *       general antes de volver a medir con >=15 casos frescos.
 *
 * Mientras ninguna de las dos se cumpla, `build`/`refresh` siguen devolviendo
 * `null` — no aflojar esta condición para "dejar pasar" un caso puntual: es
 * exactamente el sobreajuste que el encargo prohíbe.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Lo que sigue (histórico, Ola 10/11, CONTRATO-F10.md) describe el diseño
 * ANTES del apagado — se conserva porque el escaneo sigue siendo correcto
 * como INSTRUMENTO DE MEDICIÓN (este mismo archivo lo usa arriba) y porque
 * es la base exacta de la que reactivar si (a) o (b) se cumplen alguna vez.
 * ────────────────────────────────────────────────────────────────────────
 *
 * `proxy` — Ola 10, CONTRATO-F10.md, tarea Proxy: reemplaza el excluder de
 * vocabulario por estructura y agrega la forma GENERAL (la de refactoring.guru
 * — Subject/RealSubject/Proxy) junto a la forma PEREZOSA ya migrada (F6, de
 * `pattern-wrapping.ts#buildProxy`/`collectProxyGuards`). La regla vieja SIGUE
 * CORRIENDO (no se toca ni se apaga acá).
 *
 * *** LAS TRES FORMAS (cuatro estados), verbatim de la tarea *** —
 *
 *   COMPLETA, forma GENERAL: `S` reenvía un miembro `m` a un colaborador `R`
 *   construido una única vez dentro de la clase, con el MISMO NOMBRE, y `S.m`
 *   (o algún miembro reenviante) hace algo MÁS que reenviar (fan-out > 1:
 *   log/caché/control de acceso) — la fixture canónica (`ShapeProxy`: agrega
 *   `console.log` antes de `paint`) contra el control negativo (`PureWrapper`:
 *   reenvío puro, la regla lo excluye a propósito). Confirmable con la TERNA
 *   DE ENVOLTURA del grafo (`implements|satisfies` + `calls(receiver-member)`
 *   + aridad vía `memberSignatures`, `wrapping-chain.ts`) cuando hay grafo
 *   real — ver "EL REFUERZO DE GRAFO" más abajo.
 *   COMPLETA, forma PEREZOSA (la migrada): un miembro dedicado hace la guarda
 *   + `instantiates` del campo, y TODOS los demás miembros que lo usan pasan
 *   por ÉL — cero reconstrucción repetida en otro lado.
 *   PARCIAL: el reenvío con el mismo nombre existe (un único sitio, evidencia
 *   débil) pero sin interfaz común confirmada — no hay forma de distinguir,
 *   con lo que hoy se puede consultar, si esto es "casi Proxy" o un accessor
 *   cualquiera; el techo de confianza queda bajo (ver requisito 3).
 *   AUSENTE: la MISMA guarda de inicialización perezosa sobre el MISMO campo
 *   duplicada en ≥2 sitios — hoy vía `ctx.repo.clones` (anclas
 *   `duplication`/`scattered-instantiation`, inter-file) O, desde esta ola,
 *   vía el detector propio `lazy-init-repetida` (intra-file, ver más abajo) —
 *   misma forma, medida sin depender de clones.
 *   `aplicado-eludido`: el accessor perezoso YA EXISTE (forma perezosa) y
 *   ≥1 sitio sigue repitiendo la guarda cruda en vez de llamarlo.
 *
 * *** REQUISITO 1: la forma COMPLETA nunca produce sugerencia ***
 * `ya-aplicado`/`aplicado-eludido` ⇒ `confidence: null` (`engine.ts`), en
 * ambas formas.
 *
 * *** REQUISITO 2: el excluder deja de mirar vocabulario y pasa a mirar
 * estructura ***. Esta hipótesis NUNCA usó `CLONE_METHOD_NAME`/
 * `ITERATOR_PROTOCOL_NAME`/`COLLECTION_FIELD_NAME`/`LISTENER_FIELD_NAME` (esas
 * son de otros patrones) — su propio "vocabulario" de antes de esta ola era
 * puramente ESTRUCTURAL sobre TEXTO normalizado (`extractGuardField`: guarda
 * de nulidad + marcador de construcción, sin listar nombres de campo/clase
 * por ningún lenguaje) y sobre AST (`scanFileForProxyFields`). Lo que SÍ
 * cambia esta ola: (a) la forma general se agrega, apoyada en la terna de
 * envoltura del grafo — `implements|satisfies`/`calls(role)`/
 * `memberSignatures` — en vez de cualquier heurística de nombres; (b) el
 * `required` de la forma perezosa deja de depender EXCLUSIVAMENTE de
 * `ctx.repo.clones`: el detector nuevo (`lazy-init-repetida`) mide la MISMA
 * forma con hechos de AST/grafo locales, sin necesitar el índice de clones.
 *
 * *** EL DETECTOR PROPIO: `lazy-init-repetida` (ancla propia = SÍ) ***
 * `detect/intra-file/lazy-init-repetida.ts`. Generaliza la nota del encargo
 * ("≥2 miembros con `references(receiver-member)` al MISMO campo, cada uno
 * bajo una guarda de nulidad") al envolvente real de AMBAS formas COMPLETA:
 * verificado contra la fixture canónica de Proxy, su forma POSITIVA
 * (`ShapeProxy`) NO tiene guarda — construye el colaborador una única vez, sin
 * condición, y lo reenvía desde ≥2 miembros. Un detector que exigiera la
 * guarda al pie de la letra jamás ancoraría esa fixture. El detector confirma
 * sólo el HECHO envolvente (campo construido en algún sitio + referenciado
 * por receptor desde ≥2 miembros distintos); la forma PARTICULAR (¿guardas
 * redundantes, o reenvío ya centralizado?) la decide ESTA hipótesis, con
 * `ctx.fileAt` — alcanzable en producción porque el detector es `intra-file`
 * (su `Finding` pasa por `attachHypotheses` DENTRO de `analyzeFile`, con árbol
 * vivo — a diferencia de `duplication`/`scattered-instantiation`, que son
 * `inter-file` y SIEMPRE ven `ctx.file === null`, ver `hypotheses/run.ts`).
 * Esto CIERRA, para esta ancla, la brecha que el resto del módulo declara
 * abajo como "hoy siempre no disponible en producción".
 *
 * *** EL REFUERZO DE GRAFO (forma general, cuando hay grafo real) ***
 * `wrapping-chain.ts#findWrappingChains` (Cimientos, Ola 10) ya implementa la
 * terna `S implements|satisfies I ∧ R implements|satisfies I ∧ ¬(S extends R)
 * ∧ calls(receiver-member) con misma (name,arity)`. Este archivo agrega SÓLO
 * el discriminador propio de Proxy que la terna no decide (`fan-out > 1` del
 * miembro reenviante — la evidencia de "hace algo además de reenviar") y la
 * CARDINALIDAD (cuántos wrappers DISTINTOS envuelven al mismo `R`: 1 ⇒ Proxy
 * o un único Decorator, indistinguibles con los hechos de hoy, DECLARADO — el
 * `why` del discriminador lo dice; >1 ⇒ más propio de Decorator encadenable,
 * declarado también, sin bajar el estado). Alcanzable con grafo real
 * (`duplication`/`scattered-instantiation`, `graph` NO es null en la segunda
 * pasada de `crossAnalyze`) — pero MEDIDO INERTE en los 8 repos del corpus
 * (`wrapping-chain.ts`, docstring: 0 matches, `classifyRole` no deja el rol
 * `receiver-member` puesto en ninguna arista final de guava). Se declara,
 * no se esconde: el `why` de este discriminador dice explícitamente cuándo no
 * hubo grafo o no hubo match, nunca confunde "no se encontró" con "no se pudo
 * buscar".
 *
 * *** REQUISITO 3: dónde el techo de confianza queda declarado, no adivinado ***
 * La forma general con exactamente 1 sitio de reenvío (`parcial`) no puede
 * distinguir "casi Proxy" de "un getter cualquiera que delega" con los hechos
 * de hoy — sin la ranura tipada (CONTRATO-F10.md §0.4) para confirmar que el
 * campo es realmente del mismo protocolo, la escalera de discriminadores para
 * ese caso concreto rara vez confirma más de uno, así que la confianza queda
 * baja por aritmética, no por un techo estático nuevo — declarado acá en vez
 * de forzar un valor.
 *
 * *** SE_CONFUNDE_CON, sin cambios ***: Singleton (misma forma de
 * memoización perezosa — la forma perezosa; intención distinta, forma
 * indistinguible) y un caché legítimo. `ceiling: "alta"` sigue
 * `provisional: true` (K2).
 */
import type { PatternConfidence } from "../../../shared/types.js";
import type { Capability } from "../detect/capabilities.js";
import type { AstNode, CloneCandidate, FileUnit, Finding, RoleLocation } from "../detect/types.js";
import type { DerivedNodeSets } from "../code-grammar.js";
import { symbolNodeId, type CodeGraph } from "../graph/types.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { LUGARES_QUE_REPITEN_MIN, scanRepeatedAccessControl } from "../detect/intra-file/repeated-access-control.js";
import { build as engineBuild, refreshDiscriminators, toPatternHypothesis } from "./engine.js";
import type { AppliedStateResult, Check, HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";
import { findWrappingChains } from "./wrapping-chain.js";

/* ────────────────────────────────────────────────────────────────────────
 * Señal de TEXTO (`CloneCandidate.normalized`) — SIN CAMBIOS de esta ola.
 * Sigue siendo lo único disponible para `duplication`/`scattered-instantiation`
 * (`ctx.fileAt` siempre `null` ahí — ver la cabecera del módulo). Genérica a
 * propósito: ningún receptor se lista por lenguaje.
 * ──────────────────────────────────────────────────────────────────────── */

const MEMBER_TOKEN = /@\w+|\b[A-Za-z_]\w*\.[A-Za-z_]\w*\b/g;
const CONSTRUCTION_MARKER = /\bnew\s+[A-Za-z_]|\.new\b|=\s*&?[A-Z]\w*\s*[({]/;
const NEGATION_MARKER = /!|(?:^|\s)not\s|==\s*nil|\|\|=|\?\?=/;
const COMPOUND_GUARD = /(@\w+|\b[A-Za-z_]\w*\.[A-Za-z_]\w*\b)\s*(?:\|\|=|\?\?=)/;

function fieldNameOf(token: string): string {
  return token.startsWith("@") ? token.slice(1) : token.split(".").pop()!;
}

export function extractGuardField(normalized: string): string | null {
  if (!CONSTRUCTION_MARKER.test(normalized)) return null;
  const compound = COMPOUND_GUARD.exec(normalized);
  if (compound) return fieldNameOf(compound[1]!);
  if (!NEGATION_MARKER.test(normalized)) return null;
  const counts = new Map<string, number>();
  for (const token of normalized.match(MEMBER_TOKEN) ?? []) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const repeated = [...counts.entries()].filter(([, n]) => n >= 2).map(([token]) => token);
  if (repeated.length !== 1) return null;
  return fieldNameOf(repeated[0]!);
}

/* ────────────────────────────────────────────────────────────────────────
 * Primitivas de forma sobre AST vivo (`ctx.fileAt`) — usadas por (a) el
 * excluder de "ya aplicado" de la forma perezosa (como antes) y (b), NUEVO
 * esta ola, la forma GENERAL completa. Duplicadas a propósito respecto de
 * `detect/intra-file/lazy-init-repetida.ts` (capas invertidas: `detect/*` no
 * puede importar de `hypotheses/*`) — mismo criterio que ese archivo declara.
 * ──────────────────────────────────────────────────────────────────────── */

/** Cualquier nodo "de comentario" (`comment`/`line_comment`/`block_comment`/
 *  `doc_comment`, según la gramática) — tipo genérico, no vocabulario de
 *  dominio, igual criterio que `CALL_NODE_TYPE`/`NEW_EXPR_TYPE` (match por
 *  FORMA del nombre de tipo, nunca por lenguaje). Se excluye de
 *  `namedChildren` porque en varias gramáticas (confirmado por sonda directa
 *  contra `tree-sitter-java`, reproducido con un método de un solo statement
 *  seguido de un comentario en la misma línea) un comentario ES un hijo
 *  NOMBRADO del bloque que lo contiene — sin este filtro,
 *  `namedChildren(body).length > 1` (el heurístico de "hace algo más que
 *  reenviar" en `forwardSites`) se dispara con un ÚNICO statement real más un
 *  comentario, dando `hasExtraBehavior: true` sobre un cuerpo que en verdad
 *  no hace más que esa única sentencia — encontrado verificando a mano un
 *  hallazgo real de `ImmutableSet.Builder` en guava (`this.impl = null; //
 *  unused`, cero reenvío real, clasificado como "control agregado" sólo por
 *  el comentario). */
const COMMENT_NODE_TYPE = /comment/i;

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !COMMENT_NODE_TYPE.test(c.type)) out.push(c);
  }
  return out;
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

/** Todos los descendientes (incluido `node`) que cumplen `pred`, acotados en profundidad. */
function findAllDescendants(node: AstNode, pred: (n: AstNode) => boolean, maxDepth: number, out: AstNode[]): void {
  if (pred(node)) out.push(node);
  if (maxDepth <= 0) return;
  for (const c of namedChildren(node)) findAllDescendants(c, pred, maxDepth - 1, out);
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

const OBJECT_FIELDS = ["object", "operand"];
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

/** Ruby: `@x` es un único token con sigilo, sin receptor explícito. */
const RUBY_IVAR_TYPE = "instance_variable";
const SELF_WORDS = new Set(["this", "self"]);

function isSelfFieldAccess(node: AstNode, selfNames: ReadonlySet<string>): boolean {
  if (node.type === RUBY_IVAR_TYPE) return true;
  const obj = objectOf(node);
  return obj !== null && selfNames.has(obj.text);
}

function fieldKeyOf(node: AstNode): string {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  return memberNameOf(node) ?? node.text;
}

const NEW_EXPR_TYPE = /^(new_expression|object_creation_expression)$/;

function calleeLeadText(node: AstNode): string {
  const m = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/.exec(node.text);
  return m ? m[1]! : "";
}

/** Cualquier nodo "de llamada": Ruby (`call`), Go (`call_expression`), y
 *  cualquier otra gramática cuyo tipo contenga "call" — mismo criterio
 *  genérico que `isCallLike` (abajo) ya usa, en vez de un tipo exacto por
 *  lenguaje (confirmado por sonda directa contra `tree-sitter-go.wasm`: el
 *  nodo de `NewRealShape()` es `call_expression`, nunca `call` a secas — un
 *  match exacto lo perdía en silencio, encontrado escribiendo el detector
 *  hermano de esta hipótesis). */
const CALL_NODE_TYPE = /call/i;

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

/** Único vehículo de Go para "campo propio" y "clase dueña": el `receiver`
 *  de un método libre — Go no tiene ni `this` ni `class`. */
function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  const typeNode = findDescendant(decl, (n) => n.type === "type_identifier", 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}

/** Un nodo "de llamada" (tiene pinta de invocar algo, no de ser sólo un
 *  acceso a miembro) — usado para rechazar `return this.x.y()` ANTES de
 *  desenvolver en `isDedicatedAccessorBody` (ver ahí). */
function isCallLike(node: AstNode): boolean {
  return /call/i.test(node.type) || hasField(node, "arguments") || hasField(node, "function");
}

function matchGuardFieldAst(node: AstNode, selfNames: ReadonlySet<string>): string | null {
  if (hasField(node, "condition")) {
    const condition = (node.childForFieldName("condition") as AstNode | null)!;
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
  if (isAssignmentLike(node) && /\|\||\?\?/.test((node.childForFieldName("operator") as AstNode | null)?.text ?? "")) {
    const left = unwrapSingleChild((node.childForFieldName("left") as AstNode | null)!);
    if (!isSelfFieldAccess(left, selfNames)) return null;
    const right = node.childForFieldName("right") as AstNode | null;
    if (!right || !isConstructionLike(unwrapSingleChild(right))) return null;
    return fieldKeyOf(left);
  }
  return null;
}

function isDedicatedAccessorBody(body: AstNode, field: string, selfNames: ReadonlySet<string>): boolean {
  const stmts = namedChildren(body);
  if (stmts.length === 0 || stmts.length > 2) return false;
  if (matchGuardFieldAst(stmts[0]!, selfNames) !== field) return false;
  if (stmts.length === 1) return true;
  const returnValue = namedChildren(stmts[1]!)[0] ?? stmts[1]!;
  if (isCallLike(returnValue)) return false;
  const tail = unwrapSingleChild(returnValue);
  return isSelfFieldAccess(tail, selfNames) && fieldKeyOf(tail) === field;
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export interface ProxyAccessorSite {
  methodName: string;
  startLine: number;
  endLine: number;
}

/** NUEVO esta ola: un sitio de la forma GENERAL — reenvío homónimo
 *  `this.campo.metodo()` desde un miembro que NO construye el campo. */
export interface ProxyForwardSite extends ProxyAccessorSite {
  /** `true` ⇒ el cuerpo del miembro hace algo MÁS que reenviar (más de un
   *  statement) — la evidencia de "control de acceso/caché/log" que separa
   *  Proxy de un wrapper transparente. */
  hasExtraBehavior: boolean;
  rawText: string;
}

export interface ScannedProxyField {
  classKey: string;
  className: string;
  field: string;
  guardSites: ProxyAccessorSite[];
  /** NUEVO: sitios de construcción SIN guarda (forma general — típicamente el constructor). */
  plainWriteSites: ProxyAccessorSite[];
  /** NUEVO: miembros que reenvían al campo sin construirlo (forma general). */
  forwardSites: ProxyForwardSite[];
  accessorMethod: ProxyAccessorSite | null;
}

/** Escanea UN archivo ya parseado buscando, por (clase, campo), TODOS los
 *  sitios relevantes para CUALQUIERA de las dos formas COMPLETA — necesario
 *  para el excluder de "ya aplicado" (forma perezosa) Y para reconocer la
 *  forma general. Exportada para el harness de medición y los tests. */
export function scanFileForProxyFields(fileUnit: Pick<FileUnit, "path" | "root">, sets: DerivedNodeSets): Map<string, ScannedProxyField> {
  const out = new Map<string, ScannedProxyField>();
  const ensure = (classKey: string, className: string, field: string): ScannedProxyField => {
    const key = `${classKey}::${field}`;
    let f = out.get(key);
    if (!f) {
      f = { classKey, className, field, guardSites: [], plainWriteSites: [], forwardSites: [], accessorMethod: null };
      out.set(key, f);
    }
    return f;
  };

  const analyzeMethod = (fnNode: AstNode, body: AstNode, methodName: string, cls: { name: string; key: string }, selfNames: ReadonlySet<string>): void => {
    const touchedFields = new Set<string>();
    const guardCandidates: AstNode[] = [];
    findDescendant(
      body,
      (n) => {
        if (hasField(n, "condition") || (isAssignmentLike(n) && /\|\||\?\?/.test((n.childForFieldName("operator") as AstNode | null)?.text ?? ""))) {
          guardCandidates.push(n);
        }
        return false;
      },
      10,
    );
    const guardedFields = new Set<string>();
    for (const candidate of guardCandidates) {
      const field = matchGuardFieldAst(candidate, selfNames);
      if (!field) continue;
      touchedFields.add(field);
      guardedFields.add(field);
      ensure(cls.key, cls.name, field).guardSites.push({
        methodName,
        startLine: candidate.startPosition.row + 1,
        endLine: candidate.endPosition.row + 1,
      });
    }

    // Escrituras SIN guarda (forma general: construcción incondicional, típicamente en el constructor).
    const assigns: AstNode[] = [];
    findAllDescendants(body, isAssignmentLike, 10, assigns);
    for (const assign of assigns) {
      const left = unwrapSingleChild((assign.childForFieldName("left") as AstNode | null) ?? assign);
      if (!isSelfFieldAccess(left, selfNames)) continue;
      const field = fieldKeyOf(left);
      if (guardedFields.has(field)) continue; // ya contada como guarda
      const right = assign.childForFieldName("right") as AstNode | null;
      if (!right || !isConstructionLike(unwrapSingleChild(right))) continue;
      touchedFields.add(field);
      ensure(cls.key, cls.name, field).plainWriteSites.push({
        methodName,
        startLine: fnNode.startPosition.row + 1,
        endLine: fnNode.endPosition.row + 1,
      });
    }

    // Reenvíos: `this.campo.metodo(...)` — un acceso a campo propio que es a
    // su vez el OBJETO de otro acceso/llamada (dos saltos), en un miembro que
    // NO escribe ese campo.
    const selfAccesses: AstNode[] = [];
    findAllDescendants(body, (n) => isSelfFieldAccess(n, selfNames), 10, selfAccesses);
    const forwardedFields = new Set<string>();
    for (const access of selfAccesses) {
      const field = fieldKeyOf(access);
      if (touchedFields.has(field) || forwardedFields.has(field)) continue;
      forwardedFields.add(field);
      ensure(cls.key, cls.name, field).forwardSites.push({
        methodName,
        startLine: fnNode.startPosition.row + 1,
        endLine: fnNode.endPosition.row + 1,
        hasExtraBehavior: namedChildren(body).length > 1,
        rawText: normalizeText(body.text),
      });
    }

    for (const field of touchedFields) {
      if (isDedicatedAccessorBody(body, field, selfNames)) {
        ensure(cls.key, cls.name, field).accessorMethod = {
          methodName,
          startLine: fnNode.startPosition.row + 1,
          endLine: fnNode.endPosition.row + 1,
        };
      }
    }
  };

  const visit = (node: AstNode, cls: { name: string; key: string } | null): void => {
    let nextCls = cls;
    if (sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? `(anónima)@${node.startPosition.row}`;
      nextCls = { name, key: `${name}@${node.startPosition.row}` };
    } else if (sets.functionNodes.has(node.type)) {
      const goReceiver = goReceiverOf(node);
      const selfNames = new Set(SELF_WORDS);
      let methodCls = nextCls;
      if (goReceiver) {
        selfNames.add(goReceiver.paramName);
        methodCls = { name: goReceiver.typeName, key: `receiver:${goReceiver.typeName}` };
      }
      if (methodCls) {
        const body = (node.childForFieldName("body") as AstNode | null) ?? (node.childForFieldName("consequence") as AstNode | null);
        const methodName = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
        if (body) analyzeMethod(node, body, methodName, methodCls, selfNames);
      }
    }
    for (const c of namedChildren(node)) visit(c, nextCls);
  };
  visit(fileUnit.root, null);
  return out;
}

/* ────────────────────────────────────────────────────────────────────────
 * El "problema" que ve el motor.
 * ──────────────────────────────────────────────────────────────────────── */

interface ProxySite {
  file: string;
  methodName: string;
  startLine: number;
  endLine: number;
  rawText: string;
}

interface ForwardSite extends ProxySite {
  hasExtraBehavior: boolean;
}

type ProxyShape = "guardas-repetidas" | "reenvio-general" | "sin-evidencia";

interface ProxyProblem {
  finding: Finding;
  shape: ProxyShape;
  className: string;
  field: string;
  // forma perezosa (guardas-repetidas):
  matchedSites: ProxySite[];
  hasDedicatedAccessor: boolean;
  accessor: { file: string; startLine: number; endLine: number; methodName: string } | null;
  bypassSites: ProxySite[];
  // forma general (reenvio-general):
  forwardSites: ForwardSite[];
  // refuerzo de grafo (cualquier forma):
  graph: { confirmed: boolean; cardinalityOne: boolean; viaSatisfies: boolean; attempted: boolean };
}

const EMPTY_GRAPH_RESULT = { confirmed: false, cardinalityOne: false, viaSatisfies: false, attempted: false };

function emptyProblem(finding: Finding): ProxyProblem {
  return {
    finding,
    shape: "sin-evidencia",
    className: "",
    field: "",
    matchedSites: [],
    hasDedicatedAccessor: false,
    accessor: null,
    bypassSites: [],
    forwardSites: [],
    graph: EMPTY_GRAPH_RESULT,
  };
}

function overlaps(a: { startLine: number; endLine: number }, b: { startLine: number; endLine: number }): boolean {
  return a.startLine <= b.endLine && a.endLine >= b.startLine;
}

/* ── Forma perezosa vía CLONES (`duplication`/`scattered-instantiation`) —
 *    SIN CAMBIOS de comportamiento respecto de antes de esta ola. ──────── */

function groupQualifyingClones(finding: Finding, clones: readonly CloneCandidate[]): Map<string, { className: string; field: string; sites: ProxySite[] }> {
  const groups = new Map<string, { className: string; field: string; sites: ProxySite[] }>();
  for (const clone of clones) {
    if (!clone.className) continue;
    if (!finding.locations.some((l) => l.file === clone.file && overlaps(clone, l))) continue;
    const field = extractGuardField(clone.normalized);
    if (!field) continue;
    const key = `${clone.file}::${clone.className}::${field}`;
    const group = groups.get(key) ?? { className: clone.className, field, sites: [] };
    group.sites.push({
      file: clone.file,
      methodName: clone.functionName ?? "(anónima)",
      startLine: clone.startLine,
      endLine: clone.endLine,
      rawText: clone.normalized,
    });
    groups.set(key, group);
  }
  return groups;
}

function findAccessorFor(finding: Finding, className: string, field: string, ctx: HypothesisContext): { accessor: ProxyProblem["accessor"]; bypassSites: ProxySite[] } {
  const filesTried = new Set<string>();
  for (const loc of finding.locations) {
    if (filesTried.has(loc.file)) continue;
    filesTried.add(loc.file);
    const file = ctx.fileAt(loc.file);
    if (!file) continue;
    const scanned = scanFileForProxyFields(file, ctx.setsFor(file.language));
    for (const sf of scanned.values()) {
      if (sf.className !== className || sf.field !== field || !sf.accessorMethod) continue;
      const accessorMethod = sf.accessorMethod;
      const bypassSites = sf.guardSites
        .filter((s) => s.methodName !== accessorMethod.methodName)
        .map((s) => ({ file: loc.file, methodName: s.methodName, startLine: s.startLine, endLine: s.endLine, rawText: "" }));
      return {
        accessor: { file: loc.file, startLine: accessorMethod.startLine, endLine: accessorMethod.endLine, methodName: accessorMethod.methodName },
        bypassSites,
      };
    }
  }
  return { accessor: null, bypassSites: [] };
}

function buildFromClones(finding: Finding, ctx: HypothesisContext): ProxyProblem {
  const groups = groupQualifyingClones(finding, ctx.repo.clones);

  let best: { className: string; field: string; sites: ProxySite[] } | null = null;
  for (const g of groups.values()) {
    if (!best || g.sites.length > best.sites.length) best = g;
  }
  if (!best) return emptyProblem(finding);

  const { accessor, bypassSites } = findAccessorFor(finding, best.className, best.field, ctx);
  return {
    finding,
    shape: "guardas-repetidas",
    className: best.className,
    field: best.field,
    matchedSites: best.sites,
    hasDedicatedAccessor: accessor !== null,
    accessor,
    bypassSites,
    forwardSites: [],
    graph: EMPTY_GRAPH_RESULT,
  };
}

/* ── NUEVO esta ola: cualquier forma vía `ctx.fileAt` — reachable en
 *    producción para el ancla propia `lazy-init-repetida` (intra-file, árbol
 *    vivo garantizado — ver la cabecera del módulo). ─────────────────────── */

function toSite(file: string, s: ProxyAccessorSite, rawText = ""): ProxySite {
  return { file, methodName: s.methodName, startLine: s.startLine, endLine: s.endLine, rawText };
}

/** El grupo `ScannedProxyField` cuyas ubicaciones solapan las del `finding` —
 *  el detector emite una ubicación por miembro tocado, así que CUALQUIER
 *  solape con guardSites/plainWriteSites/forwardSites identifica el grupo. */
function findScannedGroup(scanned: Map<string, ScannedProxyField>, finding: Finding, file: string): ScannedProxyField | null {
  const locs = finding.locations.filter((l) => l.file === file);
  for (const group of scanned.values()) {
    const allSites = [...group.guardSites, ...group.plainWriteSites, ...group.forwardSites];
    if (allSites.some((s) => locs.some((l) => overlaps(s, l)))) return group;
  }
  return null;
}

function buildFromOwnFile(finding: Finding, ctx: HypothesisContext): ProxyProblem {
  const primaryFile = finding.locations[0]!.file;
  const file = ctx.fileAt(primaryFile);
  if (!file) return emptyProblem(finding); // no debería pasar para este ancla (intra-file); default seguro si pasa.

  const scanned = scanFileForProxyFields(file, ctx.setsFor(file.language));
  const group = findScannedGroup(scanned, finding, primaryFile);
  if (!group) return emptyProblem(finding);

  if (group.guardSites.length >= 2) {
    const bypassSites = group.accessorMethod
      ? group.guardSites.filter((s) => s.methodName !== group.accessorMethod!.methodName).map((s) => toSite(primaryFile, s))
      : [];
    return {
      finding,
      shape: "guardas-repetidas",
      className: group.className,
      field: group.field,
      matchedSites: group.guardSites.map((s) => toSite(primaryFile, s)),
      hasDedicatedAccessor: group.accessorMethod !== null,
      accessor: group.accessorMethod ? { file: primaryFile, ...group.accessorMethod } : null,
      bypassSites,
      forwardSites: [],
      graph: EMPTY_GRAPH_RESULT,
    };
  }

  if (group.forwardSites.length >= 1) {
    return {
      finding,
      shape: "reenvio-general",
      className: group.className,
      field: group.field,
      matchedSites: [],
      hasDedicatedAccessor: false,
      accessor: null,
      bypassSites: [],
      forwardSites: group.forwardSites.map((s) => ({ ...toSite(primaryFile, s, s.rawText), hasExtraBehavior: s.hasExtraBehavior })),
      graph: EMPTY_GRAPH_RESULT,
    };
  }

  return emptyProblem(finding);
}

/* ── Refuerzo de grafo (forma general) — declarado inerte hoy sobre el
 *    corpus (ver la cabecera), correcto y probado contra grafos sintéticos. */

/** Fan-out `calls` confidente de `symbolId` — "hace algo además de reenviar". */
function fanOutOf(graph: CodeGraph, symbolId: string): number {
  let n = 0;
  for (const e of confidentEdges(graph)) if (e.from === symbolId && e.kind === "calls") n++;
  return n;
}

function graphReinforcement(className: string, file: string, graph: CodeGraph | null): ProxyProblem["graph"] {
  if (!graph) return EMPTY_GRAPH_RESULT;
  const wrapperId = symbolNodeId(file, [className]);
  const chains = findWrappingChains(graph);
  const matches = chains.filter((m) => m.wrapperId === wrapperId);
  if (matches.length === 0) return { ...EMPTY_GRAPH_RESULT, attempted: true };

  const withExtra = matches.filter((m) => fanOutOf(graph, m.wrapperMemberId) > 1);
  if (withExtra.length === 0) return { confirmed: false, cardinalityOne: false, viaSatisfies: matches.some((m) => m.viaSatisfies), attempted: true };

  const wrappedId = withExtra[0]!.wrappedId;
  const wrappersOfSameWrapped = new Set(chains.filter((m) => m.wrappedId === wrappedId).map((m) => m.wrapperId));
  return {
    confirmed: true,
    cardinalityOne: wrappersOfSameWrapped.size <= 1,
    viaSatisfies: withExtra.some((m) => m.viaSatisfies),
    attempted: true,
  };
}

function buildProxyProblem(finding: Finding, ctx: HypothesisContext, graph: CodeGraph | null): ProxyProblem {
  const base = finding.kind === "lazy-init-repetida" ? buildFromOwnFile(finding, ctx) : buildFromClones(finding, ctx);
  if (base.shape === "sin-evidencia") return base;
  return { ...base, graph: graphReinforcement(base.className, finding.locations[0]!.file, graph) };
}

/* ────────────────────────────────────────────────────────────────────────
 * El `HypothesisSpec`.
 * ──────────────────────────────────────────────────────────────────────── */

const SOURCE =
  "refactoring.guru/design-patterns/proxy — \"Aplicabilidad\": proxy virtual, " +
  "\"cuando tienes un objeto pesado cuya inicialización perezosa ahorraría recursos\", y control de acceso/caché/log " +
  "sobre un colaborador reenviado con el mismo protocolo.";
const TO_CONFIRM = [
  "Confirmar que el objeto construido es realmente costoso de crear, o que el reenvío agrega control de acceso/caché/log real (si no, esto es sólo estilo, no un smell que amerite Proxy).",
  "Forma general con un único sitio de reenvío (`parcial`): ¿el campo es en verdad un colaborador del mismo protocolo, o un accessor cualquiera que delega una sola cosa? Sin una interfaz común confirmada, no se puede saber con los hechos de hoy.",
];
const COST =
  "Una clase Proxy (o un accessor perezoso privado) que centraliza la construcción y el control agregado — barato de introducir, y elimina la duplicación real entre estos métodos.";

const required: Check<ProxyProblem, CodeGraph | null>[] = [
  {
    id: "al-menos-dos-ubicaciones",
    describe: "El hallazgo ancla aporta al menos 2 ubicaciones (preserva el umbral del catálogo: 1 sola ocurrencia es memoización normal)",
    run: (p) => ({
      holds: p.finding.locations.length >= 2,
      evidence: `${p.finding.locations.length} ubicación(es) en el hallazgo ancla.`,
    }),
  },
  {
    id: "forma-estructural-suficiente",
    describe: "Hay evidencia estructural de una de las dos formas COMPLETA: guardas repetidas sobre el mismo campo (perezosa), o un colaborador construido una vez y reenviado con control agregado (general)",
    run: (p) => {
      if (p.shape === "guardas-repetidas") {
        if (p.matchedSites.length >= 2) {
          return { holds: true, evidence: `${p.matchedSites.length} sitios de \`${p.className}\` repiten "si \`${p.field}\` no existe, construirlo".` };
        }
        return { holds: false, evidence: `Sólo ${p.matchedSites.length} ubicación(es) tienen la forma de guarda de inicialización perezosa sobre el mismo campo de la misma clase; hacen falta 2.` };
      }
      if (p.shape === "reenvio-general") {
        if (p.forwardSites.length === 1) {
          return { holds: true, evidence: `Un único reenvío homónimo de \`${p.className}\` a \`${p.field}\` — evidencia débil, sin interfaz común confirmada (ver \`toConfirm\`).` };
        }
        if (p.forwardSites.length >= 2) {
          const withExtra = p.forwardSites.filter((s) => s.hasExtraBehavior);
          if (withExtra.length > 0) {
            return {
              holds: true,
              evidence: `${p.forwardSites.length} miembros de \`${p.className}\` reenvían a \`${p.field}\`; ${withExtra.length} de ellos (p.ej. \`${withExtra[0]!.methodName}\`) hacen algo más que reenviar (control de acceso/caché/log).`,
            };
          }
          return {
            holds: false,
            evidence: `${p.forwardSites.length} miembros de \`${p.className}\` reenvían a \`${p.field}\`, pero TODOS son reenvío puro (ningún control agregado) — wrapper trivial, no Proxy; la regla lo excluye a propósito.`,
          };
        }
      }
      return { holds: false, evidence: `Sin evidencia estructural de un campo colaborador construido y referenciado por >=2 miembros distintos de la misma clase.` };
    },
  },
];

const discriminators: Check<ProxyProblem, CodeGraph | null>[] = [
  {
    id: "tres-o-mas-sitios",
    describe: "3 o más sitios calificados (guarda repetida) o miembros reenviantes (forma general), no sólo el mínimo",
    run: (p) => {
      const count = p.shape === "guardas-repetidas" ? p.matchedSites.length : p.forwardSites.length;
      return { holds: count >= 3, evidence: `${count} sitio(s)/miembro(s) calificado(s).` };
    },
  },
  {
    id: "texto-identico-entre-sitios",
    describe: "El texto normalizado de los sitios calificados es idéntico entre todos (guarda copiada literal, no sólo la misma forma)",
    run: (p) => {
      const texts = p.shape === "guardas-repetidas" ? p.matchedSites.map((s) => s.rawText) : p.forwardSites.map((s) => s.rawText);
      const set = new Set(texts);
      if (texts.length < 2) return { holds: false, evidence: "Menos de 2 sitios para comparar texto — no aplica." };
      return {
        holds: set.size === 1,
        evidence: set.size === 1 ? "El texto normalizado es idéntico en todos los sitios." : `El texto difiere entre sitios (${set.size} variantes) — misma forma, no necesariamente copia literal.`,
      };
    },
  },
  {
    id: "confirmado-por-ast",
    describe: "Hay un árbol vivo que confirma la forma sobre AST (no sólo sobre texto de clon) — siempre disponible para el ancla `lazy-init-repetida`; hoy no disponible para `duplication`/`scattered-instantiation` (ver la cabecera del módulo)",
    run: (p) => {
      const astConfirmed = p.finding.kind === "lazy-init-repetida" || p.accessor !== null || p.bypassSites.length > 0;
      return {
        holds: astConfirmed,
        evidence: astConfirmed ? "Confirmado contra un árbol vivo." : "Sin árbol vivo disponible en esta corrida para confirmar sobre AST (limitación de cableado declarada para este ancla, no ausencia de la forma).",
      };
    },
  },
  {
    id: "confirmado-por-grafo-terna",
    describe: "La terna de envoltura del grafo (`implements|satisfies` + `calls(receiver-member)` + aridad) confirma la MISMA relación, con fan-out > 1 del miembro reenviante — refuerzo estructural más fuerte que el AST, cuando hay grafo real. Declarado: cardinalidad 1 (un único wrapper de este colaborador) no distingue Proxy de un único Decorator con los hechos de hoy",
    run: (p) => {
      if (!p.graph.attempted) return { holds: false, evidence: "Sin grafo real disponible en esta corrida para confirmar por la terna de envoltura (no se pudo buscar, distinto de 'no se encontró')." };
      if (!p.graph.confirmed) return { holds: false, evidence: "Se buscó la terna de envoltura en el grafo real y no confirmó fan-out > 1 en ningún miembro reenviante (o no hubo cadena)." };
      const cardinalityNote = p.graph.cardinalityOne
        ? " Cardinalidad 1 (un único wrapper de este colaborador): no distingue Proxy de un único Decorator con los hechos de hoy — declarado, no adivinado."
        : " Cardinalidad > 1 (más de un wrapper del mismo colaborador): más propio de una cadena de Decorator, declarado sin bajar el estado.";
      const satisfiesNote = p.graph.viaSatisfies ? " (riesgo declarado: alguna implementación se resolvió por `satisfies`, no `implements` — ver CONTRATO-F10.md §3 nota 2, A9)." : "";
      return { holds: true, evidence: `Confirmado por la terna de envoltura del grafo real (fan-out > 1).${cardinalityNote}${satisfiesNote}` };
    },
  },
];

/**
 * Ola 11 — el vecindario (registro de pendientes §B1). `duplication`/
 * `scattered-instantiation` son `inter-file`: `build()` YA recibe
 * `ctx.neighborhood` real ahí (`attachHypotheses` dentro de `crossAnalyze`,
 * `code-analyzer.ts:1930`, con `neighborhoodIndex` construido — consumo
 * DIRECTO, sin necesitar `refresh()`, igual que P4/P5). `lazy-init-repetida`
 * es `intra-file`: `build()` ve `EMPTY_NEIGHBORHOOD` ahí (misma llamada que
 * ve `graph === null`) y necesita `refresh()` para que este mismo check
 * confirme algo de verdad — ver `hypothesis.refresh` más abajo.
 */
function vecindarioConfirmaPatronRepetido(ctx: HypothesisContext): Check<ProxyProblem, CodeGraph | null> {
  return {
    id: "vecindario-confirma-patron-repetido",
    describe:
      "el vecindario (`ctx.neighborhood.countOfKind`) muestra que el mismo tipo de hallazgo ancla aparece en OTRO lugar del repo — no un caso aislado, más motivo real de centralizar con Proxy",
    run: (p) => {
      const count = ctx.neighborhood.countOfKind(p.finding.kind);
      return {
        holds: count > 0,
        evidence:
          count > 0
            ? `${count} hallazgo(s) más de "${p.finding.kind}" en el repo (vecindario real): el mismo patrón se repite.`
            : `ningún otro hallazgo de "${p.finding.kind}" según el vecindario (vacío en \`build()\` para \`lazy-init-repetida\` — ver el docstring de esta función; real para \`duplication\`/\`scattered-instantiation\` desde ya, y para cualquier ancla en \`refresh()\`).`,
      };
    },
  };
}

function appliedState(p: ProxyProblem): AppliedStateResult {
  if (p.shape === "reenvio-general") {
    if (p.forwardSites.length >= 2) {
      const withExtra = p.forwardSites.filter((s) => s.hasExtraBehavior);
      return {
        state: "ya-aplicado",
        checks: [
          {
            label: "el colaborador se construye una vez y se reenvía con control agregado desde varios miembros",
            passed: true,
            why: `\`${p.className}\` construye \`${p.field}\` una vez y ${p.forwardSites.length} miembros lo reenvían; \`${withExtra[0]!.methodName}\` (y posiblemente otros) agregan control de acceso/caché/log además de reenviar — la forma general de Proxy ya está aplicada.`,
            role: "applied",
          },
        ],
      };
    }
    // forwardSites.length === 1 (el `required` ya lo garantiza).
    return {
      state: "parcial",
      checks: [
        {
          label: "hay un único reenvío homónimo, sin interfaz común confirmada",
          passed: false,
          why: `\`${p.className}\` reenvía \`${p.field}\` desde un único miembro (\`${p.forwardSites[0]!.methodName}\`) — evidencia débil de envoltura ad hoc, no la estructura completa de Proxy. Formalizarla (extraer una interfaz común y, si corresponde, una clase Proxy dedicada) tiene sentido acá.`,
          role: "applied",
        },
      ],
    };
  }

  // shape === "guardas-repetidas" — SIN CAMBIOS respecto de antes de esta ola.
  if (!p.hasDedicatedAccessor) {
    return {
      state: "ausente",
      checks: [
        {
          label: "existe ya un accessor perezoso dedicado para este campo en la clase",
          passed: false,
          why: `Ningún método de \`${p.className}\` tiene como cuerpo ÚNICAMENTE la guarda de \`${p.field}\` seguida de devolverlo — no hay un punto único de acceso, cada sitio repite la construcción por su cuenta (o no hay árbol vivo disponible en esta corrida para verlo, ver la cabecera del módulo).`,
          role: "applied",
        },
      ],
    };
  }
  if (p.bypassSites.length > 0) {
    return {
      state: "aplicado-eludido",
      checks: [
        {
          label: "existe ya un accessor perezoso dedicado para este campo en la clase",
          passed: true,
          why: `\`${p.accessor!.methodName}\` en \`${p.className}\` construye \`${p.field}\` perezosamente y no hace nada más.`,
          role: "applied",
        },
        {
          label: "todos los demás sitios llaman al accessor en vez de repetir la guarda",
          passed: false,
          why: `${p.bypassSites.length} sitio(s) (p.ej. \`${p.bypassSites[0]!.methodName}\`) siguen repitiendo la guarda cruda en vez de llamar a \`${p.accessor!.methodName}\`.`,
          role: "applied",
        },
      ],
    };
  }
  return {
    state: "ya-aplicado",
    checks: [
      {
        label: "existe ya un accessor perezoso dedicado para este campo en la clase",
        passed: true,
        why: `\`${p.accessor!.methodName}\` centraliza la construcción perezosa de \`${p.field}\`.`,
        role: "applied",
      },
      {
        label: "todos los demás sitios llaman al accessor en vez de repetir la guarda",
        passed: true,
        why: "Ningún otro sitio de la clase repite la guarda cruda fuera del accessor.",
        role: "applied",
      },
    ],
  };
}

const PROXY_PATTERN = "Proxy (inicialización perezosa)";

function buildSpec(ctx: HypothesisContext): HypothesisSpec<ProxyProblem, CodeGraph | null> {
  return {
    pattern: PROXY_PATTERN,
    ceiling: "alta" as PatternConfidence,
    // SIN "unidad-tipo-clase" (RETIRADO esta ola, encontrado por prueba
    // directa): el propio docstring de esta hipótesis, ya antes de esta ola,
    // reclamaba soporte de Go vía el RECEPTOR de método (`this.x`/`self.x`/`@x`
    // Ruby/receptor de Go) — pero Go NUNCA declara "unidad-tipo-clase"
    // (`deriveCapabilities`: `sets.classNodes.size > 0`, y `classNodes` de Go
    // está SIEMPRE vacío, confirmado sobre la fixture canónica real, no sólo
    // la sonda). El requisito nunca se notaba porque las dos anclas viejas son
    // `inter-file` (capacidades UNIÓN de todos los lenguajes del repo, que casi
    // siempre incluye "unidad-tipo-clase" de OTRO lenguaje del mismo repo) —
    // el ancla nueva (`lazy-init-repetida`, `intra-file`, capacidades de UN
    // SOLO lenguaje) lo hizo visible: sin este cambio, la fixture canónica de
    // Go quedaba "no aplicable" en vez de `ya-aplicado`.
    needs: [] as Capability[],
    required,
    discriminators: [...discriminators, vecindarioConfirmaPatronRepetido(ctx)],
    appliedState: (p) => appliedState(p),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

function placesFor(p: ProxyProblem): PatternHypothesis["places"] {
  if (p.shape === "reenvio-general") {
    return p.forwardSites.map((s, i) => ({
      file: s.file,
      startLine: s.startLine,
      endLine: s.endLine,
      symbol: s.methodName,
      role: s.hasExtraBehavior
        ? `reenvío con control agregado ${i + 1} de ${p.forwardSites.length} (campo \`${p.field}\`)`
        : `reenvío ${i + 1} de ${p.forwardSites.length} (campo \`${p.field}\`)`,
    }));
  }
  if (p.hasDedicatedAccessor) {
    const places: RoleLocation[] = [];
    if (p.accessor) {
      places.push({
        file: p.accessor.file,
        startLine: p.accessor.startLine,
        endLine: p.accessor.endLine,
        symbol: p.accessor.methodName,
        role: "accessor perezoso ya existente",
      });
    }
    p.bypassSites.forEach((s, i) => {
      places.push({
        file: s.file,
        startLine: s.startLine,
        endLine: s.endLine,
        symbol: s.methodName,
        role: `sitio que puentea el accessor ${i + 1} de ${p.bypassSites.length}`,
      });
    });
    return places;
  }
  return p.matchedSites.map((s, i) => ({
    file: s.file,
    startLine: s.startLine,
    endLine: s.endLine,
    symbol: s.methodName,
    role: `guardia de inicialización perezosa duplicada ${i + 1} de ${p.matchedSites.length} (campo \`${p.field}\`)`,
  }));
}

/**
 * Ola 11 — todo lo que `refresh()` necesita de `pp` para reconstruirlo SIN
 * árbol vivo: el `ProxyProblem` completo MENOS `graph` (que se recalcula con
 * el grafo real, ver `refresh` abajo) y `finding` (el `problem` que llega a
 * `refresh` YA es el `Finding` correcto). Sólo se adjunta cuando `pp.shape
 * !== "sin-evidencia"` (si no, `build()` no produjo hipótesis: nada que
 * cachear). Ninguno de estos campos depende de `ctx.fileAt`/árbol en sí —
 * son el RESULTADO ya extraído por `buildFromOwnFile`/`buildFromClones`
 * mientras el árbol (o `ctx.repo.clones`) SÍ estaba disponible.
 */
interface ProxyRefreshState {
  readonly shape: ProxyShape;
  readonly className: string;
  readonly field: string;
  readonly matchedSites: readonly ProxySite[];
  readonly hasDedicatedAccessor: boolean;
  readonly accessor: ProxyProblem["accessor"];
  readonly bypassSites: readonly ProxySite[];
  readonly forwardSites: readonly ForwardSite[];
}

/**
 * Todo el cálculo estructural de ANTES del apagado (ver el docstring de
 * cabecera del módulo) — MISMO comportamiento que el `hypothesis.build` de
 * antes de esta ola, letra por letra. Ya no lo llama el pipeline (`build()`,
 * al fondo de este archivo, devuelve `null` sin invocar esta función) — vive
 * exportada para que `proxy.test.ts` siga probando la clasificación completa
 * (las cuatro formas/estados, el refuerzo de grafo, `refresh()`) sin borrar
 * ese trabajo, y para que una reactivación futura (condición exacta arriba)
 * tenga la implementación entera ya escrita y ya probada esperando.
 */
export function evaluateProxyHypothesis(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const spec = buildSpec(ctx);
  const pp = buildProxyProblem(problem, ctx, graph);
  const outcome = engineBuild(spec, ctx.capabilities, pp, graph);
  if (!outcome) return null;
  const hyp = toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: placesFor(pp),
    cost: COST,
  });
  if (pp.shape === "sin-evidencia") return hyp;
  const refreshState: ProxyRefreshState = {
    shape: pp.shape,
    className: pp.className,
    field: pp.field,
    matchedSites: pp.matchedSites,
    hasDedicatedAccessor: pp.hasDedicatedAccessor,
    accessor: pp.accessor,
    bypassSites: pp.bypassSites,
    forwardSites: pp.forwardSites,
  };
  return { ...hyp, refreshState };
}

/**
 * Ola 11 — cierra la ruta `lazy-init-repetida` (intra-file): `graph` es
 * `null` en `build()` para este ancla, así que `confirmado-por-grafo-terna`
 * (ya escrito, correcto, probado) y `vecindario-confirma-patron-repetido`
 * (nuevo esta ola) quedaban INERTES para ella — ver el docstring del
 * módulo, "EL REFUERZO DE GRAFO". `duplication`/`scattered-instantiation`
 * ya reciben grafo/vecindario reales EN `build()` (inter-file — ver el
 * docstring de `vecindarioConfirmaPatronRepetido`), así que en la práctica
 * `refreshHypotheses` no las vuelve a tocar (sólo itera `perFileFindings`,
 * `hypotheses/run.ts`); este `refresh()` sirve igual para las tres, por si
 * el cableado cambiara. Nunca toca `state`/`checks` — reconstruye el MISMO
 * `pp` con los campos cacheados en `build()` y sólo recalcula `graph`
 * (`graphReinforcement`, no necesita árbol) antes de re-correr TODOS los
 * discriminadores (todos son funciones puras de `pp`, ninguno lee
 * `ctx.fileAt` directamente — seguro re-ejecutarlos todos, a diferencia de
 * `chain-of-responsibility.ts`, que sí necesita congelar dos).
 *
 * Igual que `evaluateProxyHypothesis`: ya no la llama el pipeline (`refresh()`
 * devuelve `null` sin invocarla) — exportada sólo para que los tests de
 * `refresh()` sigan ejerciendo la lógica completa.
 */
export function refreshProxyHypothesis(existing: PatternHypothesisDraft, problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  if (existing.state !== "ausente" && existing.state !== "parcial") return null; // no compiten por confianza — mismo criterio que engine.ts#refreshDiscriminators.
  const stored = existing.refreshState as ProxyRefreshState | undefined;
  if (!stored) return null;
  const realGraph = graph ?? ctx.repo.graph;
  const pp: ProxyProblem = {
    finding: problem,
    shape: stored.shape,
    className: stored.className,
    field: stored.field,
    matchedSites: [...stored.matchedSites],
    hasDedicatedAccessor: stored.hasDedicatedAccessor,
    accessor: stored.accessor,
    bypassSites: [...stored.bypassSites],
    forwardSites: [...stored.forwardSites],
    graph: graphReinforcement(stored.className, problem.locations[0]!.file, realGraph),
  };
  const spec = buildSpec(ctx);
  return refreshDiscriminators(spec, existing, pp, realGraph);
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AE — FRENTE AE13. EL CAMINO NUEVO: EL ANCLA-FUERZA `repeated-access-control`.
 *
 * TODO lo que sigue es CÓDIGO NUEVO detrás de
 * `if (problem.kind === "repeated-access-control")`. NO toca ni un `required`,
 * ni un discriminador, ni una rama de `appliedState`, ni un umbral, ni el
 * apagado de las TRES anclas viejas — `duplication`,
 * `scattered-instantiation` y `lazy-init-repetida` siguen devolviendo `null`
 * exactamente como antes, con su medición y su condición de reactivación
 * intactas (cabecera del módulo). Es estrictamente ADITIVO: el patrón pasa de
 * 0 hipótesis a las de esta ancla, y NINGUNA hipótesis anterior cambia de
 * estado porque no había ninguna.
 *
 * POR QUÉ EL APAGADO VIEJO SE QUEDA COMO ESTÁ. La medición que lo justificó
 * (28 hipótesis juzgadas a mano, 0 verdaderas) es sobre la forma
 * `reenvio-general` (`forwardSites >= 1`), y su condición de reactivación (b)
 * —`wrapping-chain.ts#findWrappingChains` deja de estar inerte— sigue SIN
 * cumplirse. Reactivar esas tres anclas sería aflojar una condición escrita,
 * que es lo que ese docstring prohíbe explícitamente. El ancla nueva no pasa
 * por ninguna de las dos condiciones porque no es ninguno de los dos caminos:
 * no mira reenvíos ni cadenas de envoltura, mira un CONTROL repetido.
 * ═══════════════════════════════════════════════════════════════════════ */

interface ControlSite {
  symbol: string;
  startLine: number;
  endLine: number;
  /** El uso del objeto está DENTRO del condicional (vs. guarda de salida). */
  dentro: boolean;
  /**
   * OLA AH, FRENTE AH2 — EL OBJETO RECIBE UNA LLAMADA EN ESTE SITIO: el
   * cliente le DELEGA una operación en vez de sólo LEERLO. Es el hecho de
   * árbol que contesta la tercera línea de `ACCESS_CONTROL_TO_CONFIRM`, que
   * hasta esta ola le quedaba escrita a un humano.
   */
  objetoRecibeLlamada: boolean;
  /**
   * OLA AH, FRENTE AH2 — EL CONDICIONAL DE ESTE SITIO TIENE RAMA ALTERNATIVA
   * NO VACÍA. Un condicional con `then` y `else` no interpone un control
   * delante del objeto: ELIGE entre dos comportamientos.
   */
  controlBifurca: boolean;
  /**
   * OLA AK, FRENTE AK5 — SE PUDO RELEER EL CONDICIONAL DE ESTE SITIO sobre el
   * árbol vivo (mismo `guardLine` y mismo texto de condición que el grupo).
   * `false` ⇒ "no pude mirar", que NUNCA es "rechazo".
   */
  controlLeido: boolean;
  /**
   * OLA AK, FRENTE AK5 — EL PREDICADO DE ESTE SITIO SE CALCULA ENTERAMENTE CON
   * NOMBRES QUE EL PROPIO MIEMBRO LIGA (sus parámetros y sus variables
   * locales): no nombra al objeto, no lee estado de la unidad y no invoca
   * nada. Ver `elControlInterrogaALaUnidad`.
   */
  controlSoloLigados: boolean;
  /**
   * OLA AL, FRENTE AL3 — ESTE SITIO ES UN CLIENTE DE VERDAD DEL CONTROL.
   * Deja de serlo por dos formas, las dos verificables por gramática:
   *  (a) el control es una EXPRESIÓN condicional y el objeto no está en
   *      NINGUNA de sus ramas — el "el uso está DENTRO del condicional" que el
   *      detector leyó es contención de LÍNEAS dentro de la expresión que
   *      contiene al uso (`LOGGER.log(x ? A : B, …)`), no una rama gobernada;
   *  (b) el predicado se calcula ENTERAMENTE con nombres que ESE miembro liga
   *      (`controlSoloLigados`), la forma que el `required` de la Ola AK ya
   *      nombra, aplicada por SITIO en vez de al grupo entero.
   * `true` cuando NO se pudo mirar: "no pude mirar" nunca descuenta.
   */
  esClienteDeVerdad: boolean;
  /** Por qué dejó de serlo, para la evidencia. `null` si lo es. */
  porQueNoEsCliente: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AH — FRENTE AH2. LOS DOS HECHOS DE ÁRBOL QUE SEPARAN, Y QUE SÓLO SE
 * USAN COMO DISCRIMINADORES.
 *
 * QUÉ PROBLEMA REAL ATACAN. La celda `Proxy · repeated-access-control` mide
 * 7,8 % en las 13 bibliotecas contra un techo de nivel 1 de 89,0 % — la mayor
 * holgura del catálogo — y 29,6 % en `corpus-app/` con EL MISMO CÓDIGO. AH2
 * abrió los dos lados y midió NUEVE hechos de árbol sobre las 82
 * recomendaciones de biblioteca (las 82 juzgadas) y sobre las de aplicación.
 * La diferencia, nombrada: *en aplicaciones el control repetido pregunta por
 * la DISPONIBILIDAD DE UN COLABORADOR al que los N clientes DELEGAN; en
 * bibliotecas la misma forma sintáctica la produce un CONDICIONAL DEL
 * ALGORITMO sobre la representación propia de la clase (caso base de una
 * recursión, tamaño, validación del argumento, memoización), y ahí no hay
 * interfaz que interponer.*
 *
 * LOS DOS HECHOS, CON SU NÚMERO MEDIDO (aplicaciones, denominador V+F):
 *   - el objeto RECIBE UNA LLAMADA:    42,3 % [25,5, 61,1] contra 9,1 % [2,5, 27,8]
 *   - el control NO tiene alternativa: 31,0 % [19,1, 46,0] contra 0,0 % [0, 39,0]
 * En bibliotecas los dos van en la MISMA dirección (12,0 % contra 5,1 %) pero
 * NINGUNO separa con evidencia, y la razón está medida y publicada: el
 * numerador de biblioteca es 5, y los espejos de `guava` (22 pares de código
 * IDÉNTICO en `guava/` y `android/guava/`) dan 18,2 % de discrepancia de
 * juicio. Se publican los dos números y NO se toca nada.
 *
 * POR QUÉ SÓLO DISCRIMINADORES, Y ES LA REGLA 2 DE LA OLA. Un discriminador
 * entra en `ladderStep(confirmedCount)` (`engine.ts`), MONÓTONA en el conteo:
 * agregar discriminadores sólo puede SUBIR la confianza, y NUNCA suprime una
 * hipótesis (lo único que suprime es un `required` que falla). Convertir
 * cualquiera de los dos en `required` subiría la precisión RECORTANDO, que es
 * exactamente lo que esta ola prohíbe.
 *
 * PRIMITIVAS DE FORMA: copia deliberada de
 * `detect/intra-file/repeated-access-control.ts` (ese módulo ya declara la
 * duplicación como práctica y explica por qué). Las de más arriba de ESTE
 * archivo no alcanzan: su `objectOf` sólo mira `object`/`operand`, y sin
 * `receiver`/`expression` el hecho queda MUDO en Ruby, Go y C#.
 *
 * ───────────────────────────────────────────────────────────────────────
 * OLA AK, FRENTE AK5 — Y ACÁ SÍ HAY UN `required` NUEVO, CON PERMISO
 * EXPLÍCITO Y CON UN CRITERIO DE ACEPTACIÓN VERIFICABLE ANTES DE ATERRIZAR
 * ───────────────────────────────────────────────────────────────────────
 *
 * El párrafo de arriba ("POR QUÉ SÓLO DISCRIMINADORES") sigue siendo cierto
 * para la Ola AH. La Ola AK cambió la regla, y la cambió con una condición:
 *
 *   **UN CHEQUEO QUE SILENCIA SE ATERRIZA SI Y SÓLO SI SILENCIA CERO
 *   PROPUESTAS JUZGADAS `verdadero`.** No importa cuánto suba la precisión.
 *
 * `el-control-interroga-a-la-unidad` (abajo, el cuarto `required`) es el
 * único chequeo de este archivo que puede suprimir, y cumple la condición
 * MEDIDO sobre el banco entero de juicios que existe de esta celda —**170
 * veredictos de nivel 2: 26 `verdadero` (5 LIB + 21 APP), 109 `falso`
 * (59 + 50) y 35 `problema-si-patron-no`**, congelado en
 * `scratchpad-ak5/banco-hechos2.json`:
 *
 *   verdaderas silenciadas ....... 0 de 26   (0 de 5 LIB · 0 de 21 APP)
 *   falsas conocidas silenciadas .. 23 de 109 (14 LIB · 9 APP)
 *   `problema-si-patron-no` ........ 6 de 35
 *   población viva ............ LIB 82 -> 64 · APP 89 -> 77
 *   precisión de la celda ...... LIB 7,8 % -> 10,0 % · APP 29,6 % -> 33,9 %
 *
 * **Ninguna de las 26 verdaderas tiene UN SOLO sitio cuyo control se calcule
 * enteramente con nombres que su miembro liga.** Y el reparto por repo está
 * declarado porque una regla validada en un repo no está validada: las 23
 * falsas salen de CUATRO repos de las DOS poblaciones y de TRES gramáticas —
 * guava 9 (java), hugo 5 (go), ShareX 5 (csharp), gitea 4 (go).
 *
 * SE MIDIÓ Y SE DESCARTÓ, con su número, la variante AGRESIVA ("basta UN
 * sitio que interrogue sólo lo que liga"): silencia 41 falsas y también 0
 * verdaderas, **pero de las 18 falsas de más, 12 son de biblioteca y 10 de
 * esas 12 salen de UN SOLO REPO —8 de UN SOLO ARCHIVO—** (`guava
 * TreeMultiset` ×8, contando el espejo `android/`, más `LocalCache` ×2). Un
 * resultado concentrado así no está validado, así que la forma que aterriza
 * es la conservadora: **falla sólo si TODOS los sitios cumplen la forma.**
 * ═══════════════════════════════════════════════════════════════════════ */

const AC_RECEIVER_FIELDS = ["object", "operand", "receiver", "expression"] as const;
const AC_RECEIVER_HOST_TYPE = /(member|selector|attribute|field|call|invocation|subscript|index|element_access)/i;
const AC_CALL_TYPE = /call|invocation/i;
const AC_LOOP_TYPE = /(^|_)(while|until|for|foreach|each|loop|do)(_|$)/i;
const AC_BRANCH_FIELDS = ["consequence", "body", "alternative", "then"] as const;
const AC_MAX_DEPTH = 80;

function acObjectOf(node: AstNode): AstNode | null {
  if (!AC_RECEIVER_HOST_TYPE.test(node.type)) return null;
  for (const f of AC_RECEIVER_FIELDS) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

/** Mismo nodo POR POSICIÓN: los envoltorios de `child(i)` se crean frescos en
 *  cada llamada, así que `===` entre dos lecturas del mismo nodo es SIEMPRE
 *  falso — lo midió AE13 y le costó una sonda entera. */
function acSamePos(a: AstNode, b: AstNode): boolean {
  return (
    a.startPosition.row === b.startPosition.row &&
    a.startPosition.column === b.startPosition.column &&
    a.endPosition.row === b.endPosition.row &&
    a.endPosition.column === b.endPosition.column
  );
}

function acMemberNameOf(node: AstNode): string | null {
  const obj = acObjectOf(node);
  if (!obj) return null;
  for (let i = node.childCount - 1; i >= 0; i--) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !acSamePos(c, obj)) return c.text;
  }
  return null;
}

/** La MISMA clave con que el detector nombra al objeto (`ownStateKeyOf`): el
 *  sigilo Ruby tal cual, el identificador desnudo tal cual, y el último
 *  segmento de un acceso con receptor. Sin esto la comparación contra
 *  `grupo.objeto` no cierra. */
function acKeyOf(node: AstNode): string {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  return acMemberNameOf(node) ?? node.text;
}

/** Un CONTROL: condicional de verdad — tiene condición y tiene rama, y no es
 *  un bucle. Misma decisión por FORMA DEL NODO que el detector, y por la misma
 *  razón medida (los modificadores de Ruby no entran en `sets.branchNodes`). */
function acCondicionDe(node: AstNode): AstNode | null {
  if (AC_LOOP_TYPE.test(node.type)) return null;
  const cond = node.childForFieldName("condition") as AstNode | null;
  if (!cond) return null;
  for (const f of AC_BRANCH_FIELDS) if (node.childForFieldName(f)) return cond;
  return null;
}

/**
 * EL RECEPTOR DE UNA LLAMADA, en las gramáticas del corpus, y las DOS formas
 * hacen falta — está MEDIDO, no supuesto:
 *
 *   (a) el CALLEE es un acceso y el receptor cuelga de él: JS/TS
 *       `call_expression.function`, C# `invocation_expression.function`, Go
 *       `call_expression.function` → `selector_expression.operand`.
 *   (b) la gramática nombra el receptor DIRECTAMENTE en el nodo de llamada:
 *       Java `method_invocation.object` (su callee es `name`, un identificador
 *       pelado) y Ruby `call.receiver` (su callee es `method`, ídem).
 *
 * La primera versión de este código sólo tenía (a) y el hecho quedaba MUDO en
 * Java y en Ruby — o sea en `guava`, `jenkins`, `chatwoot`, `redmine`,
 * `jekyll` y `rubocop`. Se encontró escribiendo el test por lenguaje, y la
 * medición de este frente se re-corrió entera con la corrección.
 */
function acReceptorDeLlamada(n: AstNode): AstNode | null {
  const callee = (n.childForFieldName("function") ?? n.childForFieldName("method")) as AstNode | null;
  if (callee) {
    const recv = acObjectOf(callee);
    if (recv) return recv;
  }
  return (n.childForFieldName("object") ?? n.childForFieldName("receiver")) as AstNode | null;
}

interface AcControlNodo {
  startLine: number;
  texto: string;
  bifurca: boolean;
  /** El nodo del condicional — hace falta para releer su CONDICIÓN y su
   *  INICIALIZADOR (Ola AK, `el-control-interroga-a-la-unidad`). El árbol está
   *  vivo durante todo `buildAccessControlProblem`. */
  nodo: AstNode;
}
interface AcFuncion {
  startLine: number;
  endLine: number;
  nodo: AstNode;
}
/** OLA AL (AL3) — una unidad class-like con los nombres que DECLARA como
 *  campo. Se usa para una sola pregunta: si una asignación a un identificador
 *  DESNUDO liga un nombre NUEVO o escribe un campo que ya existe. */
/** OLA AL (AL3) — UN CONDICIONAL ESCRITO COMO EXPRESIÓN, por FORMA del nombre
 *  de tipo. Es el mismo criterio genérico con el que este módulo y el detector
 *  ya reconocen bucles (`AC_LOOP_TYPE`) y salidas (`EXIT_NODE_TYPE`), nunca por
 *  lenguaje. Medido vivo en el corpus: `ternary_expression` (Java, C#, JS/TS)
 *  y `conditional_expression` (C#, Python). */
const AC_EXPR_COND_TYPE = /(ternary|conditional_expression)/;

/** OLA AL (AL3) — ¿el objeto aparece dentro de alguna RAMA de este condicional?
 *  La pregunta que el detector NO hace: él decide "el uso está dentro del
 *  condicional" comparando LÍNEAS contra el rango del nodo entero, y una
 *  expresión condicional usada como ARGUMENTO de una llamada al objeto
 *  (`LOGGER.log(x ? A : B, …)`) satisface esa contención sin que el objeto esté
 *  en ninguna rama. */
function acObjetoEnAlgunaRama(ctl: AstNode, objeto: string): boolean {
  let visto = false;
  const rec = (n: AstNode, depth: number): void => {
    if (visto || depth > AC_MAX_DEPTH) return;
    const recv = acObjectOf(n);
    if (recv && acKeyOf(recv) === objeto) {
      visto = true;
      return;
    }
    if (n.type === RUBY_IVAR_TYPE && n.text === objeto) {
      visto = true;
      return;
    }
    for (const c of namedChildren(n)) rec(c, depth + 1);
  };
  for (const f of AC_BRANCH_FIELDS) {
    if (f === "body" && AC_EXPR_COND_TYPE.test(ctl.type)) continue;
    const rama = ctl.childForFieldName(f) as AstNode | null;
    if (rama) rec(rama, 0);
  }
  return visto;
}

interface AcClase {
  startLine: number;
  endLine: number;
  campos: ReadonlySet<string>;
}
interface AcLlamada {
  startLine: number;
  objeto: string;
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AK, FRENTE AK5 — "¿EL CONTROL LE PREGUNTA ALGO A LA UNIDAD?"
 *
 * Un proxy se interpone entre el cliente y el objeto: la puerta se escribe UNA
 * vez y aplica el control por todos. Para poder hacerlo tiene que poder
 * EVALUAR el control, y lo único que la puerta tiene a mano es **el objeto y
 * el estado de la unidad que lo posee** — no los parámetros ni los locales de
 * cada cliente.
 *
 * De ahí la pregunta, en vocabulario de gramática: *¿el predicado del control
 * se calcula ENTERAMENTE con nombres que el propio miembro LIGA?* Si la
 * respuesta es sí en TODOS los clientes, eso no es un control DE ACCESO al
 * objeto: es una precondición del cálculo de cada miembro, y ninguna puerta
 * del objeto puede absorberla.
 *
 * `AC_NOMBRES_LIGADOS` es la MISMA pregunta que `boundNamesOf` del detector
 * (`detect/intra-file/repeated-access-control.ts`), duplicada por la razón que
 * ese módulo y éste ya declaran (capas invertidas; no soy dueño del otro y
 * tocarlo cambiaría el `stableFindingId` de los 171 hallazgos y vencería los
 * 170 juicios de nivel 2 que hay sobre ellos).
 * ═══════════════════════════════════════════════════════════════════════ */

/** Declaradores que LIGAN un nombre dentro del miembro, por FORMA del nombre
 *  de tipo — mismo criterio genérico que el resto del módulo. */
const AC_DECLARADOR_TYPE = /^(variable_declarator|declaration_pattern)$/;
const AC_DECL_CORTA_TYPE = /^short_var_declaration$/;
const AC_ASIGNACION_TYPE = /^assignment/;
const AC_IDENT_TYPE = /identifier/i;

/** Los nombres que el MIEMBRO liga: sus parámetros y sus variables locales.
 *  No desciende a funciones anidadas (un parámetro de una clausura no es un
 *  nombre del miembro). */
function acNombresLigados(fnNode: AstNode, fnStop: ReadonlySet<string>, campos: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  const params = fnNode.childForFieldName("parameters") as AstNode | null;
  const rec = (n: AstNode, depth: number): void => {
    if (depth > 10) return;
    const nm = n.childForFieldName("name") as AstNode | null;
    if (nm) out.add(nm.text);
    else if (AC_IDENT_TYPE.test(n.type)) out.add(n.text);
    for (const c of namedChildren(n)) rec(c, depth + 1);
  };
  if (params) rec(params, 0);
  const body = (fnNode.childForFieldName("body") as AstNode | null) ?? fnNode;
  const walk = (n: AstNode, depth: number): void => {
    if (depth > AC_MAX_DEPTH) return;
    if (AC_DECLARADOR_TYPE.test(n.type)) {
      const nm = (n.childForFieldName("name") as AstNode | null) ?? namedChildren(n)[0] ?? null;
      if (nm && AC_IDENT_TYPE.test(nm.type)) out.add(nm.text);
    } else if (AC_DECL_CORTA_TYPE.test(n.type)) {
      // `a, err := f()` — el lado izquierdo es una lista de identificadores.
      const lhs = (n.childForFieldName("left") as AstNode | null) ?? namedChildren(n)[0] ?? null;
      if (lhs) {
        const ids = (x: AstNode, d: number): void => {
          if (d > 6) return;
          if (AC_IDENT_TYPE.test(x.type)) out.add(x.text);
          for (const c of namedChildren(x)) ids(c, d + 1);
        };
        ids(lhs, 0);
      }
    } else if (AC_ASIGNACION_TYPE.test(n.type)) {
      // Sólo el identificador DESNUDO liga: `x = 1` sí, `this.x = 1` no.
      //
      // OLA AL (AL3) — Y NO LIGA SI LA UNIDAD YA DECLARA ESE NOMBRE COMO
      // CAMPO. En las gramáticas que escriben el campo propio DESNUDO —las
      // mismas por las que el detector tiene su vía del campo desnudo, sin la
      // cual daba 0 hallazgos en guava y en newtonsoft-json— `left = x` a
      // nivel de sentencia NO declara un nombre nuevo: ESCRIBE EL CAMPO.
      // Leerlo como una ligadura hace que `guava TreeMultiset.AvlNode`
      // (`left = initLeft.add(...)`) y `ShareX ImageHistoryWindow`
      // (`_scrollViewer = …`) parezcan calcular su control con puros locales
      // cuando el control es exactamente sobre el estado de la unidad.
      // Donde la gramática no declara campos por nodo propio, `campos` llega
      // vacío y el comportamiento es idéntico al de la Ola AK.
      const lhs = n.childForFieldName("left") as AstNode | null;
      if (lhs && AC_IDENT_TYPE.test(lhs.type) && !campos.has(lhs.text)) out.add(lhs.text);
    }
    for (const c of namedChildren(n)) {
      if (fnStop.has(c.type)) continue;
      walk(c, depth + 1);
    }
  };
  walk(body, 0);
  return out;
}

/** Todos los nombres que un subárbol NOMBRA: identificadores, el sigilo Ruby y
 *  el `this`/`self` que las gramáticas modelan como tipo de nodo propio. */
function acNombresDe(node: AstNode, out: string[]): void {
  const rec = (n: AstNode, depth: number): void => {
    if (depth > AC_MAX_DEPTH) return;
    if (n.type === RUBY_IVAR_TYPE || n.type === "this" || n.type === "self") out.push(n.text || n.type);
    else if (AC_IDENT_TYPE.test(n.type)) out.push(n.text);
    for (const c of namedChildren(n)) rec(c, depth + 1);
  };
  rec(node, 0);
}

/** `true` ⇒ el predicado de ESTE condicional (su CONDICIÓN y, si lo tiene, su
 *  INICIALIZADOR) se calcula enteramente con nombres que el miembro liga. */
function acControlSoloLigados(ctl: AstNode, ligados: ReadonlySet<string>): boolean {
  const nombres: string[] = [];
  const cond = ctl.childForFieldName("condition") as AstNode | null;
  if (!cond) return false;
  acNombresDe(cond, nombres);
  const ini = (ctl.childForFieldName("initializer") ?? ctl.childForFieldName("init")) as AstNode | null;
  if (ini) acNombresDe(ini, nombres);
  if (nombres.length === 0) return false; // sin un solo nombre no se afirma nada.
  return nombres.every((n) => ligados.has(n));
}

/**
 * UN SOLO RECORRIDO del archivo que junta lo que los discriminadores y el
 * `required` de la Ola AK necesitan: los CONDICIONALES (texto normalizado, si
 * tienen rama alternativa no vacía, y el nodo para releerlos), las FUNCIONES
 * con su rango (para saber qué nombres liga cada miembro) y las LLAMADAS con
 * receptor (con la clave del objeto que las recibe). `AC_MAX_DEPTH` es
 * presupuesto de trabajo, igual que en el detector: corta, nunca decide.
 */
/** OLA AL (AL3) — LA UNIDAD Y LOS NOMBRES QUE DECLARA COMO CAMPO. Duplicación
 *  declarada de `declaredFieldsOf` del detector, por la misma razón que este
 *  módulo ya declara para las otras primitivas de forma (capas invertidas:
 *  `hypotheses/*` no puede importar el interior de `detect/*`). Sin descender
 *  a unidades anidadas ni a cuerpos de miembro. */
const AC_FIELD_DECL_TYPE = /(^|_)(field|property)_declaration$/;
const AC_DECLARADOR_SIMPLE_TYPE = /variable_declarator/;

function acCamposDeclarados(clsNode: AstNode, fnStop: ReadonlySet<string>, clsStop: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  const rec = (n: AstNode, depth: number): void => {
    if (depth > 40) return;
    if (AC_FIELD_DECL_TYPE.test(n.type)) {
      const named = n.childForFieldName("name") as AstNode | null;
      if (named) out.add(named.text);
      const rec2 = (x: AstNode, d2: number): void => {
        if (d2 > 12) return;
        if (AC_DECLARADOR_SIMPLE_TYPE.test(x.type)) {
          const nm = (x.childForFieldName("name") as AstNode | null) ?? namedChildren(x)[0] ?? null;
          if (nm) out.add(nm.text);
        }
        for (const c of namedChildren(x)) rec2(c, d2 + 1);
      };
      rec2(n, 0);
      return;
    }
    for (const c of namedChildren(n)) {
      if (fnStop.has(c.type)) continue;
      if (clsStop.has(c.type)) continue;
      rec(c, depth + 1);
    }
  };
  rec(clsNode, 0);
  return out;
}

function acRecorrer(root: AstNode, fnTypes: ReadonlySet<string>, clsTypes: ReadonlySet<string>): { controles: AcControlNodo[]; llamadas: AcLlamada[]; funciones: AcFuncion[]; clases: AcClase[] } {
  const controles: AcControlNodo[] = [];
  const llamadas: AcLlamada[] = [];
  const funciones: AcFuncion[] = [];
  const clases: AcClase[] = [];
  const visit = (n: AstNode, depth: number): void => {
    if (depth > AC_MAX_DEPTH) return;
    if (clsTypes.has(n.type)) {
      clases.push({ startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, campos: acCamposDeclarados(n, fnTypes, clsTypes) });
    }
    if (fnTypes.has(n.type)) funciones.push({ startLine: n.startPosition.row + 1, endLine: n.endPosition.row + 1, nodo: n });
    const cond = acCondicionDe(n);
    if (cond) {
      const alt = n.childForFieldName("alternative") as AstNode | null;
      controles.push({
        startLine: n.startPosition.row + 1,
        texto: normalizeText(cond.text),
        bifurca: alt !== null && namedChildren(alt).length > 0,
        nodo: n,
      });
    }
    if (AC_CALL_TYPE.test(n.type)) {
      const recv = acReceptorDeLlamada(n);
      if (recv) llamadas.push({ startLine: recv.startPosition.row + 1, objeto: acKeyOf(recv) });
    }
    for (const c of namedChildren(n)) visit(c, depth + 1);
  };
  visit(root, 0);
  return { controles, llamadas, funciones, clases };
}

interface AccessControlProblem {
  finding: Finding;
  /** El re-escaneo sobre el árbol VIVO confirmó el grupo. `false` ⇒ ningún
   *  `required` aprueba: "no pude mirar" nunca es "apruebo". */
  confirmado: boolean;
  /** Hubo árbol vivo para siquiera intentar el re-escaneo. */
  huboArbol: boolean;
  unitName: string;
  objeto: string;
  control: string;
  /** La CONDICIÓN delega en un miembro propio: media puerta ya construida. */
  delegaLaDecision: boolean;
  lugares: ControlSite[];
  /** Existe ya un accessor perezoso dedicado para ESTE objeto en el archivo
   *  (lectura INDEPENDIENTE, con la maquinaria vieja `scanFileForProxyFields`). */
  accessorDedicado: string | null;
}

const ACCESS_CONTROL_KIND = "repeated-access-control";

function emptyAccessControlProblem(finding: Finding, huboArbol: boolean): AccessControlProblem {
  return {
    finding,
    confirmado: false,
    huboArbol,
    unitName: "",
    objeto: "",
    control: "",
    delegaLaDecision: false,
    lugares: [],
    accessorDedicado: null,
  };
}

/**
 * Reconstruye el problema RE-ESCANEANDO el archivo con el árbol vivo, en vez
 * de confiar en el texto del `Finding`. Es alcanzable en producción porque el
 * ancla es `intra-file`: su `Finding` pasa por `attachHypotheses` DENTRO de
 * `analyzeFile`, con el árbol todavía sin liberar (`hypotheses/run.ts`).
 */
function buildAccessControlProblem(finding: Finding, ctx: HypothesisContext): AccessControlProblem {
  const primaryFile = finding.locations[0]!.file;
  const file = ctx.file ?? ctx.fileAt(primaryFile);
  if (!file) return emptyAccessControlProblem(finding, false);

  const { grupos } = scanRepeatedAccessControl(file, LUGARES_QUE_REPITEN_MIN);
  const locs = finding.locations.filter((l) => l.file === primaryFile);
  const grupo = grupos.find((g) => g.lugares.some((lu) => locs.some((l) => lu.startLine <= l.endLine && lu.endLine >= l.startLine)));
  if (!grupo) return emptyAccessControlProblem(finding, true);

  // Lectura INDEPENDIENTE de "la puerta ya existe", con la maquinaria vieja de
  // este módulo: ¿algún miembro del archivo es ya un accessor dedicado del
  // MISMO objeto? Es otra pregunta que la que hace el detector (aquél mira un
  // miembro corto con el MISMO control; ésta, un accessor perezoso de ese campo).
  let accessorDedicado: string | null = null;
  try {
    for (const sf of scanFileForProxyFields(file, ctx.setsFor(file.language)).values()) {
      if (sf.field === grupo.objeto && sf.accessorMethod) accessorDedicado = sf.accessorMethod.methodName;
    }
  } catch {
    accessorDedicado = null; // una gramática que no sabemos leer no inventa una puerta.
  }

  // OLA AH (AH2) — los dos hechos de árbol de los discriminadores nuevos, sobre
  // el MISMO árbol vivo que ya se está usando. Si la gramática no deja leerlos,
  // los dos quedan en `false` y el discriminador dice "no se pudo mirar" en vez
  // de afirmar nada: un discriminador que no se confirma NUNCA suprime.
  let recorrido: { controles: AcControlNodo[]; llamadas: AcLlamada[]; funciones: AcFuncion[]; clases: AcClase[] } = { controles: [], llamadas: [], funciones: [], clases: [] };
  try {
    recorrido = acRecorrer(file.root, file.sets.functionNodes, file.sets.classNodes);
  } catch {
    recorrido = { controles: [], llamadas: [], funciones: [], clases: [] };
  }

  /* OLA AK (AK5) — los nombres que LIGA cada miembro, calculados UNA vez por
   * miembro y sólo para los miembros del grupo. El miembro es la función más
   * interna que contiene el rango que el detector le dio al sitio. */
  const ligadosPorMiembro = new Map<number, ReadonlySet<string>>();
  const nombresLigadosDelSitio = (startLine: number, endLine: number): ReadonlySet<string> | null => {
    const cacheado = ligadosPorMiembro.get(startLine);
    if (cacheado) return cacheado;
    let mejor: AcFuncion | null = null;
    for (const f of recorrido.funciones) {
      if (f.startLine > startLine || f.endLine < endLine) continue;
      if (!mejor || f.startLine > mejor.startLine) mejor = f;
    }
    if (!mejor) return null;
    // OLA AL (AL3) — los campos de la unidad MÁS ESTRECHA que contiene al
    // miembro. Es el único dato que necesita la corrección de la asignación
    // desnuda; en una gramática sin nodo de clase la lista queda vacía.
    let unidad: AcClase | null = null;
    for (const c of recorrido.clases) {
      if (c.startLine > mejor.startLine || c.endLine < mejor.endLine) continue;
      if (!unidad || c.startLine > unidad.startLine) unidad = c;
    }
    const campos: ReadonlySet<string> = unidad ? unidad.campos : new Set<string>();
    let ligados: ReadonlySet<string>;
    try {
      ligados = acNombresLigados(mejor.nodo, file.sets.functionNodes, campos);
    } catch {
      return null;
    }
    ligadosPorMiembro.set(startLine, ligados);
    return ligados;
  };

  return {
    finding,
    confirmado: true,
    huboArbol: true,
    unitName: grupo.unitName,
    objeto: grupo.objeto,
    control: grupo.control,
    delegaLaDecision: grupo.delegaLaDecision,
    lugares: grupo.lugares.map((l) => {
      // El condicional de ESTE sitio: el que está en la línea de la guarda y
      // lleva EL MISMO texto de condición que el grupo.
      const ctl = recorrido.controles.find((c) => c.startLine === l.guardLine && c.texto === grupo.control) ?? null;
      const ligados = ctl ? nombresLigadosDelSitio(l.startLine, l.endLine) : null;
      const soloLigados = ctl !== null && ligados !== null && acControlSoloLigados(ctl.nodo, ligados);
      /* OLA AL (AL3) — ¿es este sitio un CLIENTE DE VERDAD del control?
       * Las dos formas que lo descalifican se evalúan SÓLO con evidencia
       * positiva: sin condicional releído no se descuenta nada. */
      const esExpresionSinObjeto = ctl !== null && l.dentro && AC_EXPR_COND_TYPE.test(ctl.nodo.type) && !acObjetoEnAlgunaRama(ctl.nodo, grupo.objeto);
      const porQueNo = esExpresionSinObjeto
        ? "el control es una expresión condicional y `" + grupo.objeto + "` no está en ninguna de sus ramas: lo que cae dentro del condicional es el uso que la CONTIENE, no una rama gobernada"
        : soloLigados
          ? "el predicado se calcula enteramente con nombres que este miembro liga (parámetros y variables locales)"
          : null;
      return {
        symbol: l.memberName,
        startLine: l.startLine,
        endLine: l.endLine,
        dentro: l.dentro,
        // "el objeto recibe una llamada EN ESTE SITIO": una llamada cuyo receptor
        // resuelve a la MISMA clave que el detector le dio al objeto, dentro del
        // rango del miembro que repite el control.
        objetoRecibeLlamada: recorrido.llamadas.some((c) => c.objeto === grupo.objeto && c.startLine >= l.startLine && c.startLine <= l.endLine),
        controlBifurca: ctl !== null && ctl.bifurca,
        // OLA AK (AK5): "no pude releer el condicional" queda declarado aparte
        // de la respuesta, para que el `required` no confunda las dos cosas.
        controlLeido: ctl !== null && ligados !== null,
        controlSoloLigados: soloLigados,
        esClienteDeVerdad: porQueNo === null,
        porQueNoEsCliente: porQueNo,
      };
    }),
    accessorDedicado,
  };
}

const ACCESS_CONTROL_SOURCE =
  "refactoring.guru/design-patterns/proxy — \"Aplicabilidad\": proxy de protección, virtual, de caché y de registro; " +
  "el proxy interpone el control DELANTE del objeto real, con la MISMA interfaz, para que ningún cliente tenga que " +
  "acordarse de escribirlo.";

const ACCESS_CONTROL_TO_CONFIRM = [
  "El alcance de esta medición es LA UNIDAD, no el repo: los clientes que viven en OTROS archivos no se miraron. " +
    "Comparar el árbol de varios archivos a la vez no lo permite ninguna granularidad de detector de este analizador " +
    "(un `inter-file` recibe `RepoUnit`, que ya liberó los árboles), y sin árbol no hay condicional ni orden. " +
    "Si el objeto también se usa desde otros archivos, la puerta paga MÁS de lo que dice este número, no menos.",
  "Confirmar que el control es de verdad un control (acceso, carga diferida, caché, conteo) y no una decisión de " +
    "negocio distinta que casualmente se escribe igual: el detector compara el TEXTO de la condición, que prueba que " +
    "es la misma lógica, no que sea un control.",
  "Si el objeto NO tiene un protocolo propio (es un dato, no un colaborador), la mitigación correcta es sólo el " +
    "punto de acceso único (Extract Method), sin clase Proxy: el patrón necesita que haya una interfaz que repetir.",
];

const ACCESS_CONTROL_COST =
  "Un único punto de acceso que haga el control y entregue el objeto — un método privado, o una clase Proxy con la " +
  "misma interfaz si el objeto tiene protocolo propio. Barato de introducir y borra la repetición completa.";

const accessControlRequired: Check<AccessControlProblem, CodeGraph | null>[] = [
  {
    id: "control-repetido-en-cada-cliente",
    describe:
      "Re-escaneado sobre el árbol VIVO: al menos " +
      `${LUGARES_QUE_REPITEN_MIN} miembros distintos de la misma unidad repiten la MISMA condición gobernando el acceso al MISMO objeto`,
    run: (p) => {
      if (!p.huboArbol) {
        return { holds: false, evidence: "No hubo árbol vivo en esta corrida para re-verificar la forma sobre AST — no pude mirar, así que no apruebo." };
      }
      if (!p.confirmado) {
        return { holds: false, evidence: "El re-escaneo del archivo con el árbol vivo no reencontró el grupo del hallazgo ancla." };
      }
      return {
        holds: p.lugares.length >= LUGARES_QUE_REPITEN_MIN,
        evidence: `${p.lugares.length} miembros de \`${p.unitName}\` (\`${p.lugares.map((l) => l.symbol).join("`, `")}\`) repiten \`${p.control}\` antes de tocar \`${p.objeto}\`.`,
      };
    },
  },
  {
    id: "el-control-gobierna-el-acceso",
    describe:
      "En CADA uno de esos miembros el control gobierna de verdad el acceso: el uso del objeto está dentro del condicional, o el condicional es una salida temprana anterior al uso",
    run: (p) => {
      if (!p.confirmado) return { holds: false, evidence: "Sin el re-escaneo no se puede afirmar que el control gobierne nada." };
      const dentro = p.lugares.filter((l) => l.dentro).length;
      const guardas = p.lugares.length - dentro;
      return {
        holds: p.lugares.length > 0,
        evidence: `${dentro} sitio(s) usan el objeto DENTRO del condicional y ${guardas} lo usan después de una guarda de salida temprana — en los ${p.lugares.length} el control está INTERPUESTO, no sólo presente.`,
      };
    },
  },
  {
    id: "el-objeto-no-tiene-puerta-propia",
    describe:
      "El objeto no tiene ya un accessor dedicado en el archivo (lectura independiente, con el escaneo de la forma perezosa de este mismo módulo): lo que falta es la PUERTA, no su uso",
    run: (p) => {
      if (!p.confirmado) return { holds: false, evidence: "Sin el re-escaneo no se puede afirmar que no haya puerta." };
      if (p.accessorDedicado !== null) {
        return { holds: false, evidence: `\`${p.accessorDedicado}\` ya es un accessor dedicado de \`${p.objeto}\`: la puerta existe y lo que falta es usarla — ésa es OTRA refactorización.` };
      }
      return { holds: true, evidence: `Ningún miembro del archivo es ya un punto único de acceso a \`${p.objeto}\`.` };
    },
  },
  /* ── OLA AK, FRENTE AK5 — el `required` nuevo, y el único de esta ola ──── */
  {
    id: "el-control-interroga-a-la-unidad",
    describe:
      "En al menos uno de los clientes el predicado del control NOMBRA algo que la unidad tiene: el objeto, otro campo, un miembro propio o una llamada. " +
      "Un predicado calculado ENTERAMENTE con los parámetros y las variables locales del propio miembro es una PRECONDICIÓN de ese cálculo, no un control de acceso al objeto: " +
      "la puerta que el patrón propone sólo tiene a mano el objeto y el estado de la unidad, nunca lo que cada cliente recibió o calculó",
    run: (p) => {
      if (!p.confirmado) return { holds: false, evidence: "Sin el re-escaneo no se puede afirmar qué interroga el control." };
      /**
       * LA FORMA DEL CHEQUEO, Y POR QUÉ NO HAY UNA RAMA "no pude mirar".
       * `controlSoloLigados` es `true` SÓLO con evidencia positiva: se releyó
       * el condicional sobre el árbol vivo Y todos sus nombres están en los
       * que el miembro liga. El rechazo exige esa evidencia en TODOS los
       * sitios; un sitio sin releer simplemente no la acredita, y por lo tanto
       * no participa del rechazo. No hay ningún `holds: true` que apruebe por
       * no haber podido evaluar — la compuerta `no-permissive-required.test.ts`
       * lo verifica.
       */
      const acreditados = p.lugares.filter((l) => l.controlSoloLigados);
      const interrogan = p.lugares.filter((l) => l.controlLeido && !l.controlSoloLigados);
      const sinReleer = p.lugares.length - acreditados.length - interrogan.length;
      if (acreditados.length < p.lugares.length) {
        const cola = sinReleer > 0 ? ` (y ${sinReleer} condicional(es) que el árbol no expone con \`condition\`/\`parameters\` legibles, que tampoco acreditan la forma que este chequeo rechaza).` : "";
        return {
          holds: true,
          evidence:
            interrogan.length > 0
              ? `${interrogan.length} de ${p.lugares.length} cliente(s) (\`${interrogan.map((l) => l.symbol).join("`, `")}\`) escriben \`${p.control}\` con al menos un nombre que el propio miembro NO liga: el control le pregunta algo a la unidad.${cola}`
              : `Ningún cliente acredita que \`${p.control}\` se calcule enteramente con los nombres que su miembro liga${cola}`,
        };
      }
      return {
        holds: false,
        evidence:
          `Los ${p.lugares.length} sitios calculan \`${p.control}\` ENTERAMENTE con nombres que su propio miembro liga (parámetros y variables locales): ` +
          `el control no nombra a \`${p.objeto}\`, no lee ningún otro campo de \`${p.unitName}\` y no invoca nada. Es una precondición del cálculo de cada miembro —validación del argumento, ` +
          `el idioma de errores, una comprobación sobre un local—, y ninguna puerta de \`${p.objeto}\` puede aplicarla por ellos: la puerta no recibe lo que ellos recibieron.`,
      };
    },
  },
  /* ── OLA AL, FRENTE AL3 — el `required` nuevo, y el único de esta ola ──
   *
   * LA FUERZA, y de dónde sale la condición. La ESCALA del ancla dice: hacen
   * falta `LUGARES_QUE_REPITEN_MIN` clientes que repitan el MISMO control
   * antes de tocar el MISMO objeto, porque *"con DOS miembros la mitigación
   * más barata es extraer una función privada compartida; abrir una puerta con
   * la interfaz del objeto no paga"*. **Ese umbral sólo vale si los N sitios
   * son CLIENTES DE VERDAD.** Dos formas de sitio, las dos verificables por
   * gramática, no lo son — y las dos las mide `esClienteDeVerdad`:
   *
   *   (a) EL CONTROL NO ESTÁ INTERPUESTO. El detector decide "el uso está
   *       DENTRO del condicional" por contención de LÍNEAS contra el rango del
   *       nodo. Una expresión condicional usada como ARGUMENTO de una llamada
   *       AL PROPIO OBJETO satisface esa contención sin que el objeto esté en
   *       ninguna rama: `LOGGER.log(Main.isUnitTest ? Level.FINE : Level.INFO,
   *       "…")` (jenkins `Jenkins.java:3750`). Ahí no hay nada interpuesto: el
   *       condicional elige un VALOR dentro del uso que lo contiene.
   *   (b) EL PREDICADO ES DEL MIEMBRO, NO DE LA UNIDAD. Es exactamente la
   *       forma que el `required` de la Ola AK ya nombra, aplicada por SITIO
   *       en vez de al grupo entero.
   *
   * NO HAY NINGÚN NÚMERO NUEVO: descontados esos sitios, el grupo tiene que
   * seguir cumpliendo el MISMO umbral que el ancla ya exige.
   *
   * MEDIDO, contra el banco de 170 juicios de nivel 2 de esta celda y sobre
   * las 190 filas de la población de los 21 repos: silencia **11 filas — 9
   * `falso`, 1 `problema-si-patrón-no` y 1 que no tenía veredicto y que el
   * frente AL3 abrió y juzgó `falso`— y CERO de las 26 juzgadas `verdadero`**
   * (0 de 5 en biblioteca, 0 de 21 en aplicación). Reparto: gitea 3, ShareX 3,
   * hugo 2, jenkins 1, newtonsoft-json 1, excalidraw 1 — **6 repos, las DOS
   * poblaciones, cuatro gramáticas (go, csharp, java, tsx) y como máximo 2 de
   * un mismo archivo.**
   *
   * SE MIDIÓ Y SE DESCARTÓ, con su número, la variante que descuenta el sitio
   * de control local SIN la corrección de la asignación desnuda (o sea, la
   * variante agresiva de la Ola AK tal cual): silencia 18 falsas y también 0
   * verdaderas, pero **10 de las 18 son de `guava` y 8 de UN SOLO ARCHIVO**, y
   * la causa está identificada: sin la corrección, `left = initLeft.add(…)`
   * de `TreeMultiset.AvlNode` se lee como una LIGADURA cuando es una escritura
   * del campo. Es el mismo bloque que AK5 descartó por concentración, y ahora
   * se sabe POR QUÉ estaba concentrado. */
  {
    id: "los-clientes-que-repiten-son-clientes-de-verdad",
    describe:
      `Descontando los sitios donde el control no está INTERPUESTO (una expresión condicional sin el objeto en ninguna de sus ramas) y aquellos donde el predicado ` +
      `se calcula ENTERAMENTE con lo que ese miembro liga, quedan al menos ${LUGARES_QUE_REPITEN_MIN} clientes — el MISMO umbral de escala que el ancla ya exige, sin ningún número nuevo`,
    run: (p) => {
      if (!p.confirmado) return { holds: false, evidence: "Sin el re-escaneo no se puede afirmar cuántos sitios son clientes de verdad." };
      const reales = p.lugares.filter((l) => l.esClienteDeVerdad);
      const descontados = p.lugares.filter((l) => !l.esClienteDeVerdad);
      if (reales.length >= LUGARES_QUE_REPITEN_MIN) {
        return {
          holds: true,
          evidence:
            descontados.length === 0
              ? `Los ${p.lugares.length} sitios son clientes del mismo control interpuesto.`
              : `${reales.length} de ${p.lugares.length} sitios (\`${reales.map((l) => l.symbol).join("\`, \`")}\`) son clientes de verdad, ` +
                `y ${descontados.length} no (\`${descontados.map((l) => l.symbol).join("\`, \`")}\`): sigue habiendo ${reales.length} ≥ ${LUGARES_QUE_REPITEN_MIN}.`,
        };
      }
      return {
        holds: false,
        evidence:
          `Sólo ${reales.length} de los ${p.lugares.length} sitios son clientes de verdad del control \`${p.control}\` sobre \`${p.objeto}\`, y hacen falta ${LUGARES_QUE_REPITEN_MIN}. ` +
          descontados.map((l) => `\`${l.symbol}\`: ${l.porQueNoEsCliente}`).join("; ") +
          `. Con menos de ${LUGARES_QUE_REPITEN_MIN} clientes reales la puerta no paga: la mitigación barata es extraer una función privada, que es lo que el propio umbral del ancla dice.`,
      };
    },
  },
];

const accessControlDiscriminators: Check<AccessControlProblem, CodeGraph | null>[] = [
  {
    id: "cuatro-o-mas-clientes",
    describe: "4 o más miembros repiten el control, no sólo el mínimo que hace que la puerta pague",
    run: (p) => ({ holds: p.lugares.length >= LUGARES_QUE_REPITEN_MIN + 1, evidence: `${p.lugares.length} miembros repiten el control.` }),
  },
  {
    id: "el-control-es-una-guarda-de-salida",
    describe:
      "Al menos un sitio interpone el control como GUARDA DE SALIDA (`return`/`throw`) antes de tocar el objeto — la forma en que olvidarse del control cambia el comportamiento en silencio",
    run: (p) => {
      const guardas = p.lugares.filter((l) => !l.dentro).length;
      return {
        holds: guardas > 0,
        evidence: guardas > 0 ? `${guardas} sitio(s) usan el control como guarda de salida temprana.` : "Todos los sitios usan el objeto dentro del condicional; ninguno corta el flujo.",
      };
    },
  },
  /* ── OLA AH, FRENTE AH2 — los dos discriminadores nuevos ─────────────── */
  {
    id: "el-objeto-tiene-un-protocolo-que-repetir",
    describe:
      "El objeto bajo el control RECIBE UNA LLAMADA en al menos uno de los clientes: los clientes le DELEGAN una operación en vez de sólo leerlo, así que hay una interfaz que un proxy pueda repetir",
    run: (p) => {
      if (!p.confirmado) {
        return { holds: false, evidence: "Sin el re-escaneo con árbol vivo no se puede mirar si el objeto recibe llamadas — no se pudo buscar, así que no se confirma." };
      }
      const conLlamada = p.lugares.filter((l) => l.objetoRecibeLlamada);
      return {
        holds: conLlamada.length > 0,
        evidence:
          conLlamada.length > 0
            ? `${conLlamada.length} de ${p.lugares.length} cliente(s) INVOCAN algo sobre \`${p.objeto}\` bajo el control (\`${conLlamada.map((l) => l.symbol).join("`, `")}\`): el objeto tiene protocolo propio, que es lo que el proxy repite.`
            : `Ningún cliente invoca nada sobre \`${p.objeto}\`: sólo lo LEEN. Sin interfaz que repetir, la mitigación que paga es el punto de acceso único, no una clase Proxy — la tercera línea de "qué confirmar" de esta misma recomendación.`,
      };
    },
  },
  {
    id: "el-control-interpone-en-vez-de-bifurcar",
    describe:
      "Ningún sitio escribe el control con rama ALTERNATIVA no vacía: un condicional con `then` y `else` no interpone un control delante del objeto, elige entre dos comportamientos (y eso no lo borra una puerta)",
    run: (p) => {
      if (!p.confirmado) {
        return { holds: false, evidence: "Sin el re-escaneo con árbol vivo no se puede mirar la forma del condicional — no se pudo buscar, así que no se confirma." };
      }
      const bifurcan = p.lugares.filter((l) => l.controlBifurca);
      return {
        holds: bifurcan.length === 0,
        evidence:
          bifurcan.length === 0
            ? `Los ${p.lugares.length} sitios escriben \`${p.control}\` sin rama alternativa: el control INTERPONE, no elige.`
            : `${bifurcan.length} sitio(s) (\`${bifurcan.map((l) => l.symbol).join("`, `")}\`) escriben \`${p.control}\` con rama alternativa no vacía: ahí el condicional está ELIGIENDO entre dos comportamientos, no interponiendo un control.`,
      };
    },
  },
];

function accessControlVecindario(ctx: HypothesisContext): Check<AccessControlProblem, CodeGraph | null> {
  return {
    id: "vecindario-confirma-control-repetido",
    describe: "El vecindario muestra que el mismo tipo de hallazgo aparece en OTRO lugar del repo — no es un caso aislado",
    run: (p) => {
      const count = ctx.neighborhood.countOfKind(p.finding.kind);
      return {
        holds: count > 0,
        evidence:
          count > 0
            ? `${count} hallazgo(s) más de "${p.finding.kind}" en el repo.`
            : `ningún otro hallazgo de "${p.finding.kind}" según el vecindario (vacío en \`build()\` para un ancla intra-file — ver el docstring de \`vecindarioConfirmaPatronRepetido\`).`,
      };
    },
  };
}

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO, y lo que NO acredita.
 *
 * `ya-aplicado` y `aplicado-eludido` son INALCANZABLES desde acá, y lo digo
 * con todas las letras con el mismo criterio con el que AC3 y AD4 lo dijeron
 * de las suyas: el detector se CALLA cuando la puerta existe (sus condiciones
 * (4) y (5)), así que un grupo que llega hasta acá no puede tener puerta por
 * construcción. **Que no produzca `ya-aplicado` no es mérito suyo.** Lo que sí
 * es mérito medible, y de otra naturaleza, es ese silencio del detector, que
 * tiene tests que lo exigen.
 *
 * `parcial` contra `ausente` NO es un peldaño vacuo: separa el caso en que la
 * DECISIÓN ya está detrás de una puerta (la condición invoca un miembro de la
 * propia unidad: `if (!this.isDebugMode())`) del caso en que ni la decisión ni
 * la interposición existen (`if (value == null)`). En el primero media puerta
 * está construida y falta la otra mitad; en el segundo no hay nada.
 */
function accessControlAppliedState(p: AccessControlProblem): AppliedStateResult {
  if (p.delegaLaDecision) {
    return {
      state: "parcial",
      checks: [
        {
          label: "la DECISIÓN del control ya vive detrás de un miembro propio, pero la INTERPOSICIÓN no",
          passed: false,
          why: `La condición \`${p.control}\` delega en un miembro de \`${p.unitName}\`: media puerta ya está construida (el predicado está centralizado). Lo que sigue repetido ${p.lugares.length} veces es la interposición — preguntar y recién entonces tocar \`${p.objeto}\`.`,
          role: "applied",
        },
      ],
    };
  }
  return {
    state: "ausente",
    checks: [
      {
        label: "existe un punto único que haga el control y entregue el objeto",
        passed: false,
        why: `Ningún miembro de \`${p.unitName}\` concentra "control + acceso a \`${p.objeto}\`": los ${p.lugares.length} clientes escriben \`${p.control}\` por su cuenta y ninguno pasa por otro.`,
        role: "applied",
      },
    ],
  };
}

function buildAccessControlSpec(ctx: HypothesisContext): HypothesisSpec<AccessControlProblem, CodeGraph | null> {
  return {
    pattern: PROXY_PATTERN,
    ceiling: "alta" as PatternConfidence,
    // Igual que el camino viejo y por la MISMA razón medida: Go nunca declara
    // "unidad-tipo-clase" y sin embargo tiene la forma (struct + método con
    // receptor) que este ancla necesita.
    needs: [] as Capability[],
    required: accessControlRequired,
    discriminators: [...accessControlDiscriminators, accessControlVecindario(ctx)],
    appliedState: (p) => accessControlAppliedState(p),
    toConfirm: ACCESS_CONTROL_TO_CONFIRM,
    source: ACCESS_CONTROL_SOURCE,
  };
}

function accessControlPlaces(p: AccessControlProblem): PatternHypothesis["places"] {
  return p.lugares.map((l, i) => ({
    file: p.finding.locations[0]!.file,
    startLine: l.startLine,
    endLine: l.endLine,
    symbol: l.symbol,
    role:
      `cliente ${i + 1} de ${p.lugares.length} que repite el control \`${p.control}\` antes de usar \`${p.objeto}\`` +
      (l.dentro ? " (uso dentro del condicional)" : " (guarda de salida temprana antes del uso)"),
  }));
}

/** El camino de entrada del ancla nueva, exportado para los tests. */
export function evaluateAccessControlHypothesis(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const spec = buildAccessControlSpec(ctx);
  const p = buildAccessControlProblem(problem, ctx);
  const outcome = engineBuild(spec, ctx.capabilities, p, graph);
  if (!outcome) return null;
  return toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: accessControlPlaces(p),
    cost: ACCESS_CONTROL_COST,
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "proxy",
  pattern: PROXY_PATTERN,
  layer: "patron",
  // SUMA el ancla nueva; conserva las TRES viejas, que siguen apagadas.
  anchors: ["duplication", "scattered-instantiation", "lazy-init-repetida", ACCESS_CONTROL_KIND],
  /**
   * APAGADO PARA LAS TRES ANCLAS VIEJAS — ver el docstring de cabecera del
   * módulo ("APAGADO — frente Proxy...") para la medición completa y la
   * condición exacta de reactivación, que NO se aflojó. Para el ancla nueva
   * `repeated-access-control` (Ola AE, frente AE13) sí se construye: es un
   * camino que no pasa por ninguna de las dos condiciones de reactivación
   * porque no es ninguno de los dos caminos que aquella medición juzgó.
   */
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    if (problem.kind !== ACCESS_CONTROL_KIND) return null;
    return evaluateAccessControlHypothesis(problem, graph, ctx);
  },
  /**
   * APAGADO para las tres anclas viejas, igual que `build()`. Para el ancla
   * nueva re-corre SÓLO los discriminadores (nunca `state`/`checks`), que es
   * lo que `refresh` puede aportar: en `build()` un ancla `intra-file` ve el
   * vecindario vacío, y en `refresh()` lo ve real.
   */
  refresh(existing: PatternHypothesisDraft, problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    if (problem.kind !== ACCESS_CONTROL_KIND) return null;
    if (existing.state !== "ausente" && existing.state !== "parcial") return null;
    const p = buildAccessControlProblem(problem, ctx);
    if (!p.confirmado) return null;
    return refreshDiscriminators(buildAccessControlSpec(ctx), existing, p, graph);
  },
};
