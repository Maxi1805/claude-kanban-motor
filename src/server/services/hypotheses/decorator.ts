/**
 * *** ARREGLADO — frente Decorator, ola de precisión posterior a la Ola D ***
 *
 * La Ola D juzgó a mano 50 hipótesis de Decorator contra código real (Rails +
 * `src/`): **5 de 50 verdaderas** (10%, Wilson 95% [4%, 21%]). Los 45 falsos
 * se repartían en dos causas medidas por separado (notas fila-por-fila en
 * `tests/golden/precision/{rails,ck-analyzer}.hypotheses.csv`, filtradas por
 * `pattern === "Decorator"`):
 *
 *   A. `idioma-framework` (19, Rails): un controlador reenvía homónimamente
 *      `update`/`destroy`/`show` a un colaborador (`@reminder`, `@user`, …)
 *      asignado por un callback SIN parámetros propios (`before_action
 *      :set_x`) — la MISMA forma AST que `ColorDecorator` reenviando
 *      `area()` a `@shape`, pero SIN la inyección de dependencias que
 *      Decorator necesita.
 *   B. `ancla-equivocada` (26, sobre todo `src/`): funciones "mapper puro"
 *      (`asGraphIndex`, `toGraph`, `censusOf`, los `build*Finding` de
 *      `detect/intra-function/*`, …) que retornan un objeto literal copiando
 *      PROPIEDADES de su parámetro (`{ id: source.id }`) — la regex vieja no
 *      exigía que el match fuera una LLAMADA, así que una lectura de
 *      propiedad contaba igual que `shape.area()`. Un caso residual
 *      (`graph/edges/warmup.ts#warmUpLanguage`) no era de reenvío sino de
 *      `isAssignmentLike` confundiendo la variable de un `for...of` anidado
 *      (mismos nombres de campo `left`/`right` que una asignación real) con
 *      un acumulador compartido.
 *
 * EL ARREGLO, dos mecanismos independientes, ninguno ajustado a los 45 casos
 * puntuales (verificado: ambos son afirmaciones estructurales generales,
 * ninguno menciona Rails/TypeScript/nombres de clase):
 *
 *   A → `classInjectsField`/`goInjectsField` (ver su docstring, sección 3):
 *       un reenvío homónimo sólo cuenta como composición si el campo
 *       reenviado fue asignado alguna vez desde un PARÁMETRO PROPIO de quien
 *       lo asigna (inyección de dependencias por AST, nunca por el nombre
 *       del método que asigna) — corre con `ctx.file`, vivo también en el
 *       `build()` de producción, así que SÍ decide `state` (a diferencia del
 *       discriminador de vecindario, que sólo puede afinar confianza — ver
 *       su propio docstring, "LÍMITE DECLARADO").
 *       Adicionalmente, `otherWrappersInRepoDiscriminator` (más abajo) tenía
 *       la polaridad de Engler et al. invertida (sumaba confianza por
 *       "familia repetida" en vez de exigir rareza) — corregido como higiene
 *       de confianza, no como el arreglo de `state`.
 *   B → `CALL_NODE_TYPE` (ver el docstring de `ownFieldSameNameCall`): sólo
 *       nodos que estructuralmente SON una llamada entran en la comparación
 *       de reenvío homónimo — nunca el texto crudo del cuerpo. Y
 *       `isAssignmentLike` ahora descarta nodos de lazo (`isLoopNode`) antes
 *       de aceptar que un `left`/`right` es una asignación.
 *
 * MEDICIÓN DE CIERRE (muestra FRESCA, filas que NO estaban en las planillas
 * que la Ola D ya juzgó — ver el cuerpo del mensaje del agente que cerró este
 * frente para el detalle de cada veredicto): cargada en
 * `tests/golden/precision/{rails,ck-analyzer}.hypotheses.csv` junto a los 50
 * juicios de la Ola D, con `note` explicando cada veredicto nuevo.
 */
/**
 * Decorator — Ola 10, CONTRATO-F10.md §0.4/§1, "las tres formas". Reemplaza
 * el excluder de Ola 6/9 (F6, migración de `pattern-wrapping.ts#buildDecorator`)
 * que sólo distinguía "compone / no compone" contando reenvíos por texto SIN
 * exigir que el nombre coincidiera — el mismo criterio "vocabulario" que el
 * contrato pide reemplazar por estructura.
 *
 * *** LAS TRES FORMAS (verbatim de la tarea, verificadas contra las 6
 * variantes de lenguaje de la fixture canónica de Decorator) ***
 *
 *   COMPLETA — LA TERNA DE ENVOLTURA (CONTRATO-F10 §0.4): `X` reenvía un
 *   miembro `m` a un colaborador `Y` con el MISMO NOMBRE `m` (`this.shape
 *   .area()` dentro de `area()`, `@shape.area` dentro de `def area`,
 *   `d.shape.Area()` dentro de `Area()`, `shape.area()` dentro de la clave
 *   `area:` de un objeto literal) — el requisito "name(m_X) == name(m_Y)"
 *   de la terna, verificado por AST, no por vocabulario de nombres de campo.
 *   `≥2` reenvíos HOMÓNIMOS distintos ⇒ `ya-aplicado` (la unidad YA compone
 *   con otra instancia del mismo protocolo — reportarla sería sugerir
 *   Decorator sobre un Decorator ya hecho, el falso positivo que el usuario
 *   rechazó dos veces). Cuando además hay un `CodeGraph` real disponible
 *   (`graphOverride`, abajo), se confirma con la terna COMPLETA del contrato
 *   (`implements|satisfies` + `calls(role receiver-member)` + aridad vía
 *   `memberSignatures`) — estrictamente más fuerte, así que sólo SUBE el
 *   nivel, nunca lo baja.
 *   PARCIAL — exactamente `1` reenvío homónimo: evidencia débil (podría ser
 *   un accessor simple), envoltura ad hoc que se beneficiaría de
 *   formalizarse con Decorator. Es la ÚNICA forma que justifica la
 *   sugerencia.
 *   AUSENTE — el acumulador con banderas, sin nada que envuelva a nada
 *   (`REQUIRED_ACCUMULATOR`/`REQUIRED_INDEPENDENT`, sin cambios: Kerievsky,
 *   *Refactoring to Patterns*, cap. 8). Promovido a detector propio esta
 *   ola — ver `detect/intra-function/flag-accumulator.ts` — y agregado como
 *   CUARTO ancla (ver `hypothesis.anchors`): las tres anclas viejas anclan
 *   en un PARÁMETRO o una condición, no en el acumulador mismo, así que en
 *   8 de 10 repos medidos (Ola 9) no coinciden espacialmente con esta forma.
 *
 * *** REQUISITO 1 DEL CONTRATO: la forma COMPLETA nunca produce sugerencia ***
 * `state === "ya-aplicado"` ⇒ `confidence: null` (ver `engine.ts`) — no
 * compite en el ranking de oportunidades.
 *
 * *** REQUISITO 2: el excluder deja de mirar vocabulario y pasa a mirar
 * estructura ***. La versión anterior (`countDelegationCalls`) contaba
 * CUALQUIER par de métodos DISTINTOS reenviados a un mismo campo, sin
 * exigir que el nombre del método reenviado coincidiera con el nombre de
 * quien reenvía — así que una clase que usa un `Logger` para dos cosas
 * distintas (`report()` llama a `logger.info()`, `summarize()` llama a
 * `logger.warn()`) contaba como "ya compone", un falso positivo real. Esta
 * versión exige, por AST (`childForFieldName("name")`/`childForFieldName
 * ("body")`, nunca por lista de nombres), que el MIEMBRO que reenvía y el
 * miembro reenviado del colaborador tengan EL MISMO NOMBRE — la firma
 * exacta de "X.m llama a Y.m" que la terna de CONTRATO-F10 exige, sin
 * necesitar tipos declarados ni aristas del grafo (que, para los anclas de
 * esta hipótesis — intra-function — NUNCA están disponibles en `build()`
 * en producción: ver la nota de arquitectura más abajo).
 *
 * *** NOTA DE ARQUITECTURA, verificada leyendo `code-analyzer.ts` (no
 * inventada): *** los tres anclas de esta hipótesis (y el nuevo,
 * `flag-accumulator`) son SIEMPRE `intra-function`, así que su único paso
 * por `attachHypotheses` ocurre DENTRO de `analyzeFile`
 * (`code-analyzer.ts:1611`), con `repo.graph` pasado explícitamente como
 * `null` — el grafo del repo no existe todavía a esa altura, y la pasada
 * posterior (`refreshHypotheses`, que SÍ ve el grafo real) tiene prohibido
 * por contrato (`hypotheses/types.ts#HypothesisBuilder.refresh`) tocar
 * `state`. Por eso la forma COMPLETA/PARCIAL de ESTA hipótesis se decide
 * 100% sobre `ctx.file` (el árbol vivo, que SÍ está disponible en esa
 * llamada) — nunca sobre el grafo — y el uso de `findWrappingChains`
 * (`graphOverride`, abajo) es un REFUERZO opcional para cuando `build()` se
 * invoca con un grafo real (tests, harness de medición, o una futura
 * ola que re-cablee `code-analyzer.ts`), declarado así, no escondido.
 *
 * *** LÍMITES DECLARADOS, no adivinados (requisito 3 del contrato) ***
 *   - Sin verificación de ARIDAD cruzada `arity(m_X) == arity(m_Y)`: el
 *     colaborador `Y` casi nunca está declarado en el mismo archivo (es un
 *     tipo externo), así que no hay from dónde leer su aridad declarada sin
 *     el grafo. Se confía en "mismo nombre, ≥2 reenvíos" como proxy
 *     estructural — más débil que la terna completa, declarado.
 *   - PARCIAL "≥2 clases envolviendo al MISMO Y, cada una con firma propia
 *     y sin base común" — NO implementado: exigiría comparar TODAS las
 *     clases del archivo entre sí. Sólo se evalúa la clase/función dueña
 *     del hallazgo ancla.
 *   - Encadenamiento (`instantiates` entre dos decoradores hacia la misma
 *     interfaz) — sólo se puede confirmar con el grafo (`graphOverride`),
 *     así que en producción (grafo ausente) nunca se reporta; no es un
 *     "no hay cadena", es "no se pudo mirar".
 *   - `aplicado-eludido` — sigue sin implementarse (como en la versión
 *     anterior): exigiría una consulta al grafo por clientes que puentean
 *     el wrapper, fuera del alcance de esta tarea (Decorator, no todos los
 *     patrones de envoltura).
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import {
  capabilityUnitsOf,
  MIN_CAPABILITIES,
  MIN_EMBELLISHED_MEMBERS,
  OPTIONAL_BEHAVIOR_FLAGS_KIND,
  type CapabilityUnit,
} from "../detect/intra-file/optional-behavior-flags.js";
import type { AstNode, Finding, RoleLocation } from "../detect/types.js";
import { symbolNodeId, type CodeGraph } from "../graph/types.js";
import { build, refreshDiscriminators, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";
import { findWrappingChains, type WrappingChainMatch } from "./wrapping-chain.js";

const SOURCE_DECORATOR =
  "refactoring.guru/design-patterns/decorator — \"Aplicabilidad\": " +
  '"cuando necesites asignar responsabilidades extra a objetos en tiempo de ejecución sin romper ' +
  'el código que los usa"; Kerievsky, Refactoring to Patterns, cap. 8: "Move Embellishment to Decorator". ' +
  "CONTRATO-F10.md §0.4 (la terna de envoltura) para la forma COMPLETA/PARCIAL.";

/* ────────────────────────────────────────────────────────────────────────
 * Primitivas de forma — subconjunto adaptado de `pattern-wrapping.ts` para
 * operar sobre `AstNode` (detect/types.ts) en vez de `WrapNode` propio: son
 * la MISMA relación estructural, duplicadas a propósito (mismo criterio que
 * `capabilities.ts` ya documenta para `TERNARY_NAME`) para no crear una
 * dependencia de este archivo hacia el interior no-exportado de
 * `pattern-wrapping.ts`.
 * ──────────────────────────────────────────────────────────────────────── */

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
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

/** Todos los descendientes (incluido `node`) que cumplen `pred`, acotados en
 *  profundidad — misma forma que `proxy.ts`/`lazy-init-repetida.ts` ya usan
 *  (duplicada acá a propósito, mismo criterio que el resto de este módulo). */
function findAllDescendants(node: AstNode, pred: (n: AstNode) => boolean, maxDepth: number, out: AstNode[]): void {
  if (pred(node)) out.push(node);
  if (maxDepth <= 0) return;
  for (const c of namedChildren(node)) findAllDescendants(c, pred, maxDepth - 1, out);
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

const RUBY_IVAR_TYPE = "instance_variable";
const SELF_WORDS = ["this", "self"];
/**
 * `while`/`for`/`until`/`do-while` — EXCLUIDOS del conteo de guardas de
 * `pickEmbellishmentCandidate` (ver abajo), mismo hallazgo y misma
 * corrección que `detect/intra-function/flag-accumulator.ts` (verificado
 * por sonda directa contra las 6 gramáticas de este módulo: un
 * `while_statement`/`for_statement` resuelve `condition`+`body` —
 * EXACTAMENTE la misma forma que el `if_modifier` de Ruby, sin
 * `consequence`/`alternative` — así que el `?? body` de la línea de abajo,
 * necesario para reconocer el modifier-if de Ruby, confundía un lazo con
 * una capa de embellecimiento genuina antes de este filtro). Encontrado
 * verificando a mano un hallazgo real de `flag-accumulator` sobre
 * `Files.java#simplifyPath` (Ola 10, requisito 5): el `while
 * (result.startsWith("/../"))` contaba como tercera "capa independiente"
 * de `result`, cuando en realidad es un lazo de normalización, no una
 * decisión opcional sí/no.
 */
const LOOP_NODE_TYPE = /^(while|for|until|do)(_statement|_in_statement)?$/;

function isLoopNode(node: AstNode): boolean {
  return LOOP_NODE_TYPE.test(node.type);
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

/**
 * *** ANCLA-EQUIVOCADA — "tiene campos `left`/`right`" NO alcanza para "es
 * una asignación" (ola de precisión posterior a la Ola D, frente Decorator).
 * Encontrado en DOS capas, la segunda más profunda que la primera ***.
 *
 * Capa 1 (`for...of`/`for...in`): un `for_in_statement` de TS/JS (cubre
 * ambos) expone `left` (la variable de bucle) y `right` (el iterable) —
 * verificado por sonda. Caso real: `graph/edges/warmup.ts#warmUpLanguage`,
 * 3 bloques `if` independientes cada uno con su PROPIO `for (const slot of
 * extractor.slots) …` — `slot` (variable de bucle de scope propio a cada
 * `for`) se leía como un ÚNICO acumulador reasignado 3 veces.
 *
 * Capa 2, LA RAÍZ (más profunda: excluir sólo lazos no alcanza) — verificado
 * por sonda contra `tree-sitter-typescript.wasm`: CUALQUIER operador binario
 * de comparación o lógico (`a > b`, `a === b`, `a && b`) es un
 * `binary_expression` con los MISMOS campos `left`/`right` que una
 * asignación real (`assignment_expression`) — la gramática nombra los
 * operandos de un operador binario genérico "left"/"right" sin distinguir
 * "es una asignación" de "es una comparación". Caso real, verificado
 * leyendo `graph/edges/imports.ts#factsFor`: un dispatch por `language` con
 * `if`/`return` en cada rama, SIN acumulador real en ningún lado —
 * `const target = ecmaTarget(stmt); return target && target.text.length > 0
 * ? […] : [];` no tiene ninguna asignación (la declaración usa los campos
 * `name`/`value`, no `left`/`right`), pero `findDescendant` sí encuentra
 * `target && target.text.length > 0` (`binary_expression`, campos
 * `left`/`right`) y lo confundía con "target" reasignado 3 veces, una vez
 * por rama del dispatch.
 *
 * EL ARREGLO RAÍZ: verificar el TIPO del nodo, no sólo su forma de campos.
 * Confirmado por sonda contra las 4 gramáticas relevantes (TS/JS, Python,
 * Go, Ruby): TODO nodo de asignación genuina tiene "assign" en su nombre de
 * tipo (`assignment_expression`/`augmented_assignment_expression` en TS/JS,
 * `assignment`/`augmented_assignment` en Python, `assignment_statement` en
 * Go, `assignment`/`operator_assignment` en Ruby) y NINGÚN `binary_expression`
 * ni nodo de lazo lo tiene — mismo criterio genérico por substring de tipo
 * que `CALL_NODE_TYPE` ya usa para "es una llamada" (`/call/i`), en vez de
 * enumerar nombres exactos por gramática. Con esto, la exclusión explícita
 * de lazos (`isLoopNode`) queda REDUNDANTE (ningún tipo de lazo contiene
 * "assign") pero se deja como defensa adicional, documentada, no oculta.
 */
const ASSIGNMENT_NODE_TYPE = /assign/i;

function isAssignmentLike(node: AstNode): boolean {
  return ASSIGNMENT_NODE_TYPE.test(node.type) && hasField(node, "left") && hasField(node, "right") && !isLoopNode(node);
}

function unwrapSingleChild(node: AstNode): AstNode {
  const kids = namedChildren(node);
  return kids.length === 1 ? unwrapSingleChild(kids[0]!) : node;
}

/** Para Go: campo `receiver` ⇒ (nombre del parámetro receptor, nombre del
 *  tipo receptor) — misma vía que `pattern-wrapping.ts#goReceiverOf`. */
function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  const typeNode = findDescendant(decl, (n) => n.type === "type_identifier", 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}

function enclosingBindingName(fnNode: AstNode, parent: AstNode | null): string | null {
  if (!parent) return null;
  return (parent.childForFieldName("name") as AstNode | null)?.text ?? null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trailingIdentifier(text: string): string {
  const m = text.match(/[A-Za-z_$][\w$]*/g);
  return m && m.length > 0 ? m[m.length - 1]! : text;
}

function leadingIdentifier(text: string): string {
  const m = text.match(/[A-Za-z_$][\w$]*/g);
  return m && m.length > 0 ? m[0]! : text;
}

/**
 * OLA W (W4) — el nombre BASE de un tipo escrito, sin sus argumentos genéricos
 * y sin su calificador de paquete/módulo: `List<E>` ⇒ `List`, `afero.Fs` ⇒
 * `Fs`, `*hglob.FilenameFilter` ⇒ `FilenameFilter`, `: Shape` ⇒ `Shape`.
 * `trailingIdentifier` solo no sirve para un tipo genérico (`List<E>` daría
 * `E`, el parámetro de tipo), así que primero se corta en el primer
 * delimitador de argumentos.
 */
function baseTypeName(text: string): string {
  return trailingIdentifier(text.replace(/[<[({].*$/s, "").trim());
}

function paramNameOf(node: AstNode): string | null {
  if (node.type === "identifier") return node.text;
  const named =
    (node.childForFieldName("name") as AstNode | null) ??
    (node.childForFieldName("pattern") as AstNode | null) ??
    (node.childForFieldName("left") as AstNode | null);
  if (named) return named.text;
  for (const c of namedChildren(node)) if (c.type === "identifier") return c.text;
  return null;
}

/** Nombres de parámetro de una función, MÁS el receptor Go (que vive en un
 *  campo separado, `receiver`, no en `parameters`). */
function functionParamNames(fnNode: AstNode): Set<string> {
  const names = new Set<string>();
  const goReceiver = goReceiverOf(fnNode);
  if (goReceiver) names.add(goReceiver.paramName);
  const paramList = fnNode.childForFieldName("parameters") as AstNode | null;
  if (paramList) {
    for (const child of namedChildren(paramList)) {
      const name = paramNameOf(child);
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * *** ANCLAS ESTRUCTURALES (esta tarea, registro de pendientes §Problema 2) ***
 * `large-class`/`refused-bequest` son `intra-file` (no `intra-function`, como
 * las cuatro anclas de olor de arriba) — su `finding.locations[0]` es el
 * span de la CLASE entera, no de una función. Verificado leyendo
 * `code-analyzer.ts`: el mismo bloque que corre `intra-function` con
 * `ctx.file` vivo TAMBIÉN corre `intra-file` con `ctx.file` vivo
 * (`scopes: ["intra-function", "intra-file"]`, misma llamada), así que estas
 * dos anclas SÍ llegan con árbol vivo en producción — a diferencia de las
 * anclas `inter-file` (`concrete-over-abstraction`/`coupling-without-
 * abstraction`, sugeridas también, descartadas: corren en `crossAnalyze` con
 * `ctx.file` SIEMPRE `null`, y esta hipótesis no tiene ninguna vía basada en
 * grafo que las reemplace en producción — `graphOverride` es inerte ahí, ver
 * su propio docstring). Sin estas dos anclas, la clasificación por
 * ESTRUCTURA (la terna de envoltura, arriba) sólo podía entrar disfrazada de
 * un acumulador de banderas coexistiendo en la misma unidad — nunca sola.
 * Con ellas, una clase limpia (como `ColorDecorator`, sin ningún olor)
 * todavía no dispara nada — nadie la marca como candidata todavía porque
 * ningún detector encuentra un problema en ella (arquitectura de `run.ts`,
 * no tocada acá) — pero una clase marcada por CUALQUIER motivo de clase
 * (grande, o con herencia anulada) que TAMBIÉN resulta que ya compone/casi
 * compone con un colaborador ahora SÍ puede reportarse como
 * `ya-aplicado`/`parcial`, sin depender de que además tenga un acumulador.
 */
const STRUCTURAL_ANCHOR_KINDS: ReadonlySet<string> = new Set(["large-class", "refused-bequest"]);

function isStructuralAnchor(p: { anchorKind: string }): boolean {
  return STRUCTURAL_ANCHOR_KINDS.has(p.anchorKind);
}

/**
 * *** ANCLA DE DELEGACIÓN (Ola 11a, P2 — registro de pendientes "Problema 2",
 * los 6 rojos de Decorator en `hypothesis-state-gate.test.ts`) ***
 * `detect/intra-file/homonymous-delegation.ts` confirma la FORMA cruda (¿algún
 * miembro reenvía homónimamente a un colaborador propio?) sobre la fixture
 * canónica — una clase LIMPIA como `ColorDecorator` no dispara NINGUNO de los
 * 6 anclas de arriba (ni las de olor, ni `large-class`/`refused-bequest`: ver
 * el docstring de esas dos, "todavía no dispara nada"). A diferencia de las
 * anclas ESTRUCTURALES (`large-class`/`refused-bequest`, ubicadas por CLASE
 * completa vía `locateClassOnly`), esta ancla se ubica por FUNCIÓN (la misma
 * vía que las 4 anclas de olor, `locateFunctionAndClass`) — necesario para
 * que la forma FUNCIONAL (Vue, sin clase ni receptor Go) tenga una unidad
 * dueña que ubicar: `locateClassOnly` siempre da `null` ahí (no hay nodo de
 * clase que envuelva un wrapper funcional).
 */
const DELEGATION_ANCHOR_KIND = "homonymous-delegation";

function isDelegationAnchor(p: { anchorKind: string }): boolean {
  return p.anchorKind === DELEGATION_ANCHOR_KIND;
}

/**
 * *** EL ANCLA DE FUERZA (Ola AD, frente AD3) — Y EL CAMINO POR EL QUE ESTA
 * HIPÓTESIS PUEDE, POR PRIMERA VEZ, DECIR `ausente` ***
 *
 * EL DEFECTO QUE ARREGLA, medido por AC4 y confirmado por el integrador de la
 * Ola AC leyendo este archivo: para `homonymous-delegation`, el estado
 * `ausente` es **inalcanzable por construcción** — `REQUIRED_DELEGATION_PRESENT`
 * exige `level !== "none"` para que la hipótesis EXISTA, y `appliedState`
 * recalcula el MISMO `level` con la MISMA función pura sobre los MISMOS
 * argumentos, así que su rama `"none" → ausente` es código muerto. Los datos
 * lo confirman: **0 `ausente` de 111 hipótesis del ancla, en las dos
 * poblaciones**. Un ancla que sólo puede decir dónde el Decorator YA ESTÁ es
 * lo contrario del objetivo del proyecto, y son 636 hallazgos crudos (13
 * repos) los que están detrás.
 *
 * *** ESTE CAMINO NO QUITA NADA. *** `REQUIRED_DELEGATION_PRESENT` y las
 * anclas viejas quedan EXACTAMENTE como estaban: lo que se agrega es un
 * SÉPTIMO camino de entrada, con su propio `required`, cuyo `appliedState`
 * llama a la MISMA `classDelegationLevel`/`goDelegationLevel` pero SIN una
 * compuerta previa que excluya el `"none"` — así que acá `"none" → ausente`
 * es alcanzable y es el caso esperado.
 *
 * La condición (5) de la receta de la Ola AC ("RESOLUCIÓN VERIFICADA") vive
 * exactamente ahí: el ancla nombra la FUERZA (`optional-behavior-flags`, ver
 * su docstring), y la escalera de estado —no el detector— dice si la
 * envoltura ya está puesta (`ya-aplicado`), a medio poner (`parcial`) o
 * ausente. Medido antes de implementar sobre las dos poblaciones: de las 24
 * unidades que el detector encuentra, 18 no reenvían homónimamente a ningún
 * colaborador propio ⇒ `ausente`.
 *
 * Se ubica por CLASE (`locateClassOnly`, como las anclas estructurales),
 * porque el hallazgo anota la unidad-tipo entera; en Go —sin nodo de clase—
 * cae a `locateFunctionAndClass`, que resuelve la unidad por el receptor.
 */
const CAPABILITY_ANCHOR_KIND = OPTIONAL_BEHAVIOR_FLAGS_KIND;

function isCapabilityAnchor(p: { anchorKind: string }): boolean {
  return p.anchorKind === CAPABILITY_ANCHOR_KIND;
}

/* ────────────────────────────────────────────────────────────────────────
 * 1. Ubicar la función ancla en el árbol vivo, y su clase envolvente (si hay)
 * ──────────────────────────────────────────────────────────────────────── */

interface FnCtx2 {
  name: string | null;
  node: AstNode;
  selfNames: Set<string>;
}

interface ClsCtx2 {
  name: string;
  node: AstNode;
}

/**
 * La función-ANCLA no siempre coincide en span EXACTO con `finding.locations[0]`:
 * `boolean-flag-param`/`long-parameter-list`/`flag-accumulator` sí (su
 * ubicación ES el nodo función completo), pero `boolean-complexity` ubica la
 * EXPRESIÓN booleana compleja, un span mucho más angosto anidado adentro
 * (`startLine`/`endLine` vienen de `real`, el nodo de la cadena lógica, no de
 * `fn.node`). Por eso esto busca la función más INTERNA cuyo span CONTIENE
 * el rango del hallazgo (`start <= startLine && end >= endLine`), no una
 * igualdad — cubre las cuatro anclas con una sola regla.
 */
function locateFunctionAndClass(
  root: AstNode,
  sets: DerivedNodeSets,
  startLine: number,
  endLine: number,
): { fn: FnCtx2; cls: ClsCtx2 | null } | null {
  let best: { fn: FnCtx2; cls: ClsCtx2 | null } | null = null;

  const visit = (node: AstNode, parent: AstNode | null, cls: ClsCtx2 | null): void => {
    // PODA POR CONTENCIÓN (Ola Y, Y5 — costo). Los spans de tree-sitter ANIDAN:
    // ningún descendiente de un nodo puede empezar antes ni terminar después que
    // él. Así que un nodo cuyo span NO contiene el rango del hallazgo no puede
    // tener adentro la función que sí lo contiene, y su subárbol entero es
    // irrelevante para las dos únicas cosas que este recorrido produce (`best`
    // y la clase que lo envuelve — que sólo se lee cuando `best` se escribe).
    // RESULTADO IDÉNTICO por construcción; lo que cambia es que antes se
    // recorría el archivo ENTERO una vez POR HALLAZGO CANDIDATO, y las anclas
    // de esta hipótesis (`homonymous-delegation` 548, `boolean-flag-param` 555)
    // ponen decenas de hallazgos en el mismo archivo. Medido con `node
    // --cpu-prof`: 9,5 s de 568,5 s en guava y 5,6 s de 106,5 s en hugo.
    if (node.startPosition.row + 1 > startLine || node.endPosition.row + 1 < endLine) return;
    let nextCls = cls;
    if (sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
      nextCls = { name, node };
    } else if (sets.functionNodes.has(node.type)) {
      const s = node.startPosition.row + 1;
      const e = node.endPosition.row + 1;
      if (s <= startLine && e >= endLine) {
        const goReceiver = goReceiverOf(node);
        const selfNames = new Set<string>(SELF_WORDS);
        if (goReceiver) selfNames.add(goReceiver.paramName);
        const name = (node.childForFieldName("name") as AstNode | null)?.text ?? enclosingBindingName(node, parent);
        // No se retorna enseguida: una función anidada MÁS ANGOSTA que
        // también contenga el rango (closure dentro de método) reemplaza a
        // ésta al visitarla más abajo — nos quedamos con la más interna.
        best = { fn: { name, node, selfNames }, cls: nextCls };
      }
    }
    for (const child of namedChildren(node)) visit(child, node, nextCls);
  };

  visit(root, null, null);
  return best;
}

/**
 * Variante de (1) SÓLO para anclas ESTRUCTURALES (`large-class`/`refused-
 * bequest`, ver la constante de arriba): el rango del hallazgo es el span de
 * la CLASE entera, así que acá se busca el nodo de clase MÁS INTERNO cuyo
 * span coincide/contiene ese rango — nunca una función. `sets.classNodes`
 * ya lo decide `capabilities.ts#unidad-tipo-clase`, así que en Go (sin nodos
 * de clase) esto siempre da `null`, igual que `located.cls` en el resto del
 * archivo.
 */
function locateClassOnly(root: AstNode, sets: DerivedNodeSets, startLine: number, endLine: number): ClsCtx2 | null {
  let best: ClsCtx2 | null = null;

  const visit = (node: AstNode): void => {
    // Misma poda por contención que `locateFunctionAndClass`, misma razón y
    // misma garantía de resultado idéntico — ver el comentario de allá.
    const s = node.startPosition.row + 1;
    const e = node.endPosition.row + 1;
    if (s > startLine || e < endLine) return;
    if (sets.classNodes.has(node.type)) {
      const name = (node.childForFieldName("name") as AstNode | null)?.text ?? "(anónima)";
      best = { name, node }; // una clase anidada más interna, si la hay, reemplaza a ésta al seguir bajando.
    }
    for (const child of namedChildren(node)) visit(child);
  };

  visit(root);
  return best;
}

/* ────────────────────────────────────────────────────────────────────────
 * 2. El acumulador — forma AUSENTE (Kerievsky). Sin cambios de fondo esta
 *    ola: sigue siendo la misma relación, ahora TAMBIÉN detectada como
 *    problema propio en `detect/intra-function/flag-accumulator.ts`
 *    (duplicada ahí a propósito — `detect/*` no puede importar de
 *    `hypotheses/*`, capas invertidas).
 * ──────────────────────────────────────────────────────────────────────── */

interface EmbellishmentLayer {
  startLine: number;
  endLine: number;
  /** Último identificador del texto de la condición — mismo criterio que el
   *  original: distingue "misma variable" (Strategy/State) de "independiente". */
  conditionText: string;
  /** Primer identificador del texto de la condición — el receptor/objeto raíz,
   *  usado SOLO por el discriminador de "receptores distintos". */
  receiverRoot: string;
}

interface EmbellishmentCandidate {
  target: string;
  isOwnField: boolean;
  layers: EmbellishmentLayer[];
}

/** El target con MÁS capas en el cuerpo de `fn` — SIN filtrar por
 *  independencia todavía (eso es un `required` separado). `null` si ningún
 *  target junta ni una sola capa. */
function pickEmbellishmentCandidate(fn: FnCtx2): EmbellishmentCandidate | null {
  const body = (fn.node.childForFieldName("body") as AstNode | null) ?? (fn.node.childForFieldName("consequence") as AstNode | null);
  if (!body) return null;

  const byTarget = new Map<string, { isOwnField: boolean; layers: EmbellishmentLayer[] }>();
  const guards = namedChildren(body).filter((n) => hasField(n, "condition") && !isLoopNode(n));

  for (const guard of guards) {
    const consequence = (guard.childForFieldName("consequence") as AstNode | null) ?? (guard.childForFieldName("body") as AstNode | null);
    if (!consequence) continue;
    const assign = findDescendant(consequence, isAssignmentLike, 4);
    if (!assign) continue;
    const leftRaw = (assign.childForFieldName("left") as AstNode | null) ?? assign;
    const left = unwrapSingleChild(leftRaw);
    const isOwnField = isSelfFieldAccess(left, fn.selfNames);
    const targetKey = isOwnField ? fieldKeyOf(left) : left.type === "identifier" ? left.text : null;
    if (!targetKey) continue;

    const conditionNode = guard.childForFieldName("condition") as AstNode;
    const entry = byTarget.get(targetKey) ?? { isOwnField, layers: [] };
    entry.layers.push({
      startLine: guard.startPosition.row + 1,
      endLine: guard.endPosition.row + 1,
      conditionText: trailingIdentifier(conditionNode.text),
      receiverRoot: leadingIdentifier(conditionNode.text),
    });
    byTarget.set(targetKey, entry);
  }

  let best: EmbellishmentCandidate | null = null;
  for (const [target, entry] of byTarget) {
    if (!best || entry.layers.length > best.layers.length) best = { target, ...entry };
  }
  return best;
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. El excluder ESTRUCTURAL de la forma COMPLETA/PARCIAL — CONTRATO-F10 §0.4.
 *    Reemplaza el conteo de Ola 6/9 (cualquier par de métodos reenviados,
 *    sin exigir nombre igual) por reenvío HOMÓNIMO: el miembro que reenvía
 *    (`m_X`) y el miembro invocado del colaborador (`m_Y`) DEBEN compartir
 *    nombre — la mitad de la terna que sí se puede verificar sin el grafo
 *    (`name(m_X) == name(m_Y)`; la aridad y `implements|satisfies` quedan
 *    para `graphOverride`, cuando hay grafo real).
 * ──────────────────────────────────────────────────────────────────────── */

interface DelegationSignal {
  field: string;
  /** Cuántos miembros DISTINTOS reenvían homónimamente a `field`. */
  distinct: number;
  /**
   * OLA U (N4) — cuántos miembros de la UNIDAD dueña hay en total (métodos de
   * la clase, métodos con ese receptor en Go, claves del objeto retornado en
   * la forma funcional). Es el denominador de la cláusula "reenvía la MAYORÍA
   * de sus miembros" — ver `levelFromSignal`.
   */
  members: number;
  /**
   * OLA U (N4) — cuántos de esos reenvíos hacen ALGO MÁS que reenviar. Es la
   * cláusula que separa Decorator de Middle-man — ver `levelFromSignal`.
   */
  embellished: number;
  sample: string[];
  /** Los miembros que además agregan comportamiento — para la evidencia. */
  embellishedSample: string[];
  /**
   * OLA U (N4) — `true` cuando la unidad expone el protocolo COMPLETO del
   * colaborador sin escribirlo: campo EMBEBIDO en Go (`goEmbeddedFieldNames`)
   * o reenvío ATRAPA-TODO en Python/Ruby (`catchAllForwardedField`). Con esto,
   * "la mayoría de sus miembros" y "≥2 nombres compartidos" no se pueden
   * contar sobre lo escrito: el protocolo entero ya viaja.
   *
   * OLA W (W4) — tercera forma: la CONFORMIDAD DECLARADA
   * (`declaredSharedProtocol`), la única que resuelve el caso del protocolo
   * EXTERNO al repo. Ver su docstring.
   */
  wholeProtocol?: boolean;
  /** OLA W (W4) — por QUÉ el protocolo entero viaja, para que la evidencia no
   *  diga "la MAYORÍA" sobre un denominador que se redujo a propósito. */
  wholeProtocolWhy?: string;
}

/**
 * *** ANCLA-EQUIVOCADA — lectura de propiedad confundida con llamada (ola de
 * precisión posterior a la Ola D, frente Decorator) ***. La Ola D juzgó 26
 * falsos en `src/` con la MISMA nota: `asGraphIndex`/`toGraph`/`censusOf`/
 * `verdictForEdgeCell`/`toPatternHypothesis`/los `build*Finding` de
 * `detect/intra-function/*` — todos funciones "mapper puro" que retornan un
 * objeto literal copiando CAMPOS de su parámetro (`{ id: source.id, describe:
 * source.describe }`) — y la regex vieja (`\b(param)\.method\b`, sin exigir
 * paréntesis) matcheaba `source.id` exactamente igual que `shape.area()`,
 * porque en JS/TS un acceso a propiedad (`member_expression`) y una llamada
 * (`call_expression`) comparten la MISMA forma textual salvo por los
 * paréntesis finales. La razón por la que la versión anterior NO exigía
 * paréntesis era real (Ruby: `@shape.area` sin paréntesis SÍ es una llamada
 * — no existe un nodo de "acceso a propiedad" distinto en su gramática), pero
 * la solución no puede ser "paréntesis opcionales en todos lados": tiene que
 * ser "¿ES estructuralmente una llamada?", verificado por AST, no por texto.
 * Confirmado por sonda directa contra las 4 gramáticas relevantes: Ruby
 * (`@shape.area`, CON o SIN paréntesis) y Python (`self.shape.area()`)
 * producen un nodo `call`/`call` — la MISMA invocación de mensaje sin
 * paréntesis explícitos, semántica de la gramática, no un accidente de
 * formato —, mientras que TS/JS (`source.id`, sin paréntesis) produce
 * `member_expression`, un tipo de nodo DISTINTO de `call_expression`. Por
 * eso ahora se buscan primero los nodos que SON una llamada (`CALL_NODE_TYPE`,
 * la misma convención genérica `/call/i` que `proxy.ts`/`lazy-init-
 * repetida.ts` ya usan) y sólo se compara el TEXTO de esos nodos — nunca el
 * cuerpo entero — así que una lectura de propiedad sin llamada nunca entra
 * en la comparación, en NINGÚN lenguaje, sin necesitar una regla por
 * gramática.
 */
/**
 * *** OLA U (N4) — POR QUÉ ESTE REGEX GANA `invocation`, Y POR QUÉ ÉSA ERA LA
 * OTRA MITAD DE LA CEGUERA EN JAVA/C# ***
 * `PLAN-INTENCIONES.md` §6 diagnostica que el ancla de Decorator "sigue ciega
 * en Java y C# (medido: 0 y 0)". Una causa es el ancla misma (fuera de este
 * archivo, ver el informe). La otra estaba ACÁ: `/call/i` nombra el nodo de
 * invocación de JS/TS (`call_expression`), Python (`call`), Ruby (`call`) y Go
 * (`call_expression`) — y de NINGUNA de las dos gramáticas que son el 91 % del
 * volumen del corpus. Verificado por sonda directa contra
 * `tree-sitter-java.wasm`: `delegate().add(index, element)` produce un
 * `method_invocation`; en C# la forma equivalente es `invocation_expression`.
 * Ninguno contiene "call", así que `findAllDescendants(…, CALL_NODE_TYPE)`
 * devolvía SIEMPRE la lista vacía y todo el excluder homónimo de este archivo
 * era, literalmente, código muerto en Java y C#.
 *
 * "invocation" es vocabulario de GRAMÁTICA (cómo tree-sitter nombra el nodo),
 * del mismo estatus que "call" — no es léxico de dominio ni una regla por
 * lenguaje: sigue siendo UNA pregunta ("¿este nodo ES una invocación?")
 * resuelta por substring del TIPO, como la ola anterior la dejó planteada.
 */
const CALL_NODE_TYPE = /call|invocation/i;

/**
 * `true` (y devuelve el nombre del campo/receptor) si el cuerpo de un
 * miembro llamado `memberName` reenvía a `selfName.<campo>.<memberName>(`
 * (this/self/receptor Go) o `@campo.<memberName>` (Ruby, sin receptor
 * explícito) — EL MISMO NOMBRE en ambos lados. Sólo mira nodos que SON una
 * llamada (`CALL_NODE_TYPE`, ver arriba) — nunca una lectura de propiedad —
 * y compara contra el TEXTO PROPIO de cada nodo-llamada (acotado a su span,
 * nunca el cuerpo entero), así que el anclaje `^` es seguro: el nodo-llamada
 * siempre empieza exactamente en el receptor.
 *
 * *** SEGUNDO ANCLAJE — negative lookahead `(?![\w.])`, TRES iteraciones,
 * cada una medida contra código real o el censo congelado, ninguna adivinada
 * ***. El anclaje `^` solo no alcanza cuando el campo intermedio ES OTRA VEZ
 * un objeto con un método de nombre DISTINTO — `index.nodeById.get(id)` (un
 * adaptador Map→interfaz, `hypotheses/composite.ts#asGraphIndex` y 10
 * hermanos idénticos en el resto de `hypotheses/*.ts`) matcheaba
 * `^index\.(\w+)\.nodeById\b` como si "nodeById" fuera el método invocado,
 * cuando el método REALMENTE invocado es `.get`, dos niveles más adentro —
 * `\b` acepta el límite de palabra ANTES del siguiente `.get`, no exige que
 * la cadena TERMINE ahí.
 *
 * Intento 1 (`(?:\(|$)`: "paréntesis o fin de texto") regresionó
 * `tests/fixtures/patterns/iterator/ruby.rb` (censo congelado,
 * `census-golden.test.ts`): `@numbers.each { |n| yield n }` — un bloque Ruby
 * (`{ … }`, y lo mismo pasaría con `do … end`) — el nodo-llamada completo
 * incluye el bloque en su span, así que "each" no está seguido de `(` ni de
 * fin de texto, aunque SÍ es la llamada real. Enumerar terminadores válidos
 * es interminable — la pregunta correcta no es "¿qué viene después del
 * nombre?" sino "¿el nombre SIGUE encadenado a otro miembro?".
 *
 * Intento 2 (`(?!\.\w)`: "no seguido de `.identificador`") arregló el bloque
 * Ruby pero reabrió el caso original a medias: `node` (clave de un objeto
 * literal, `hypotheses/graph/neighborhood.ts#buildEgo`) matcheaba como
 * PREFIJO de `index.nodeById.get(…)` — después de "node" viene "B" (letra,
 * no punto), así que `(?!\.\w)` no lo rechazaba; hacía falta además que
 * `memberName` fuera el identificador COMPLETO, no un prefijo cualquiera.
 *
 * Arreglo final: `(?![\w.])` — "no seguido de otro carácter de palabra NI de
 * un punto" — rechaza en una sola condición tanto "es sólo el prefijo de un
 * identificador más largo" (`node` dentro de `nodeById`) como "sigue
 * encadenado a otro miembro" (`nodeById` seguido de `.get`), y acepta
 * cualquier terminador real de invocación (paréntesis, fin de texto, bloque
 * Ruby, argumento sin paréntesis) porque ninguno de ellos es un carácter de
 * palabra ni un punto.
 */
/**
 * *** OLA U (N4) — EL COLABORADOR TAMBIÉN PUEDE VENIR DE UN ACCESSOR ***
 * `PLAN-INTENCIONES.md` §6 lo define así: *"un colaborador `Y` (campo O
 * ACCESSOR)"*, y nombra el caso verificado: `guava/guava/src/com/google/
 * common/collect/ForwardingList.java:36-90` — `protected abstract List<E>
 * delegate();` y después `@Override public void add(int index, E element) {
 * delegate().add(index, element); }`. Es la familia `Forwarding*` entera (14+
 * clases sólo en `com.google.common.collect`) y es la implementación de
 * Decorator más citada de la industria. La regex anterior sólo conocía
 * `<propio>.<campo>.<mensaje>` y `@<campo>.<mensaje>` — un colaborador
 * expuesto por MÉTODO era invisible, y con él todo el idioma de Java/C#, que
 * es el 91 % del volumen del corpus.
 *
 * INTENCIÓN VERIFICADA: *"el colaborador es PROPIO"* — no de dónde sale
 * sintácticamente, sino que la unidad dueña lo provee. Un campo propio y un
 * accessor propio son la misma relación vista desde dos ángulos; lo que
 * NINGUNA de las dos formas acepta es un colaborador que venga de afuera de la
 * unidad (una variable libre, un import). Por eso el accessor tiene que estar
 * DECLARADO en la misma unidad — lo verifica `classInjectsField`, que gana
 * para esto su segunda rama.
 */
const ACCESSOR_SUFFIX = "\\(\\s*\\)";

function ownCollaboratorSameNameCall(bodyNode: AstNode, memberName: string, selfNames: ReadonlySet<string>): { field: string; call: AstNode } | null {
  const escapedMethod = escapeRegExp(memberName);
  const calls: AstNode[] = [];
  findAllDescendants(bodyNode, (n) => CALL_NODE_TYPE.test(n.type), 16, calls);
  const patterns: RegExp[] = [];
  if (selfNames.size > 0) {
    const names = [...selfNames].map(escapeRegExp).join("|");
    patterns.push(new RegExp(`^(?:${names})\\.(\\w+)\\.${escapedMethod}(?![\\w.])`));
    patterns.push(new RegExp(`^(?:${names})\\.(\\w+)${ACCESSOR_SUFFIX}\\.${escapedMethod}(?![\\w.])`));
  }
  patterns.push(new RegExp(`^@(\\w+)\\.${escapedMethod}(?![\\w.])`));
  // Accessor SIN receptor explícito (`delegate().add(...)`, el idioma de
  // Java/C#): el receptor es una llamada sin argumentos a un miembro de la
  // propia unidad. Que ese miembro EXISTA en la unidad lo verifica
  // `classInjectsField` (segunda rama) — acá sólo se reconoce la forma.
  patterns.push(new RegExp(`^(\\w+)${ACCESSOR_SUFFIX}\\.${escapedMethod}(?![\\w.])`));
  for (const re of patterns) {
    for (const call of calls) {
      const m = re.exec(call.text);
      if (m) return { field: m[1]!, call };
    }
  }
  return null;
}

/**
 * *** OLA U (N4) — LA CLÁUSULA QUE SEPARA DECORATOR DE MIDDLE-MAN ***
 * `true` si el cuerpo del miembro NO hace más que reenviar: una sola
 * sentencia, y esa sentencia ES la llamada de reenvío (directamente, o
 * envuelta en el `return`/`expression_statement` que cada gramática pone
 * alrededor). Cualquier otra cosa —una segunda sentencia, una envoltura del
 * resultado, un cálculo alrededor de la llamada— significa que ese miembro
 * hace ALGO MÁS que reenviar, que es exactamente lo que Decorator agrega y
 * Middle-man no.
 */
/**
 * Sentencia que NO es comportamiento: un comentario, o una sentencia cuyo
 * único contenido es un literal de texto (el docstring de Python/Ruby, que la
 * gramática representa como un `expression_statement` con un `string` adentro,
 * indistinguible en forma de una sentencia real).
 *
 * NO ES UN DETALLE: medido sobre `corpus/sqlalchemy` con la primera versión de
 * `memberOnlyRelays`, el docstring hacía que CASI TODO método de Python
 * contara como "hace algo más que reenviar" — `lib/sqlalchemy/engine/base.py:
 * 3139 dispose` (docstring de 30 líneas + `self.pool.dispose()`) salía
 * `parcial` igual que antes de la cláusula. Un contador de sentencias que
 * cuenta la documentación como comportamiento no mide comportamiento.
 */
const INERT_STATEMENT_TYPE = /comment/i;
const TEXT_LITERAL_TYPE = /string/i;

function isInertStatement(node: AstNode): boolean {
  if (INERT_STATEMENT_TYPE.test(node.type)) return true;
  if (TEXT_LITERAL_TYPE.test(node.type)) return true;
  const kids = namedChildren(node);
  return kids.length === 1 && TEXT_LITERAL_TYPE.test(kids[0]!.type);
}

function memberOnlyRelays(bodyNode: AstNode, call: AstNode): boolean {
  const sameSpan = (a: AstNode, b: AstNode): boolean =>
    a.startPosition.row === b.startPosition.row && a.startPosition.column === b.startPosition.column && a.endPosition.row === b.endPosition.row && a.endPosition.column === b.endPosition.column;
  if (sameSpan(bodyNode, call)) return true; // cuerpo de expresión (`=> shape.area()`, `def area; @shape.area; end`).
  const statements = namedChildren(bodyNode).filter((n) => !isInertStatement(n));
  if (statements.length !== 1) return false;
  const only = statements[0]!;
  if (sameSpan(only, call)) return true;
  const inner = namedChildren(only);
  return inner.length === 1 && sameSpan(inner[0]!, call);
}

/**
 * Acumulador de la señal de delegación de UNA unidad dueña — reemplaza al
 * `Map<string, Set<string>>` + `bestSignal` de antes, que sólo sabía contar
 * "cuántos miembros distintos reenvían". Las dos cuentas nuevas (`members`,
 * el denominador de la MAYORÍA; `embellished`, la cláusula que separa de
 * Middle-man) tienen que viajar por el mismo camino que el conteo viejo, y
 * las tres rutas (clase / receptor Go / funcional) lo alimentan igual.
 */
class ForwardTally {
  private members = 0;
  private readonly byField = new Map<string, { methods: Set<string>; embellished: Set<string> }>();

  countMember(): void {
    this.members++;
  }

  countForward(field: string, memberName: string, doesMore: boolean): void {
    const entry = this.byField.get(field) ?? { methods: new Set<string>(), embellished: new Set<string>() };
    entry.methods.add(memberName);
    if (doesMore) entry.embellished.add(memberName);
    this.byField.set(field, entry);
  }

  best(): DelegationSignal | null {
    let best: DelegationSignal | null = null;
    for (const [field, entry] of this.byField) {
      if (best && entry.methods.size <= best.distinct) continue;
      best = {
        field,
        distinct: entry.methods.size,
        members: Math.max(this.members, entry.methods.size),
        embellished: entry.embellished.size,
        sample: [...entry.methods],
        embellishedSample: [...entry.embellished],
      };
    }
    return best;
  }
}

/** Variante de UN solo nivel para la forma FUNCIONAL (sin clase): el
 *  colaborador ES el parámetro capturado directamente (`shape.area()`), no
 *  hay un campo intermedio (`this.inner.x()`). Mismo criterio de arriba:
 *  sólo nodos-llamada (`CALL_NODE_TYPE`) entran en la comparación — un
 *  `pair` de objeto literal cuyo VALOR es una lectura de propiedad
 *  (`id: source.id`) nunca produce un match, esté o no envuelto en un
 *  lambda (`findAllDescendants` recorre adentro de la función flecha) — y el
 *  segundo anclaje (`(?![\w.])`) exige que `methodName` sea el identificador
 *  COMPLETO y el ÚLTIMO segmento antes de invocar — ni un prefijo de un
 *  identificador más largo (`node` dentro de `nodeById`) ni un campo
 *  intermedio de una cadena más larga (`param.campo.otroMétodo()`, ver el
 *  docstring de `ownFieldSameNameCall`) — sin excluir paréntesis, fin de
 *  texto, ni ninguna otra sintaxis de invocación real. */
function paramSameNameCall(valueNode: AstNode, methodName: string, paramNames: ReadonlySet<string>): { field: string; call: AstNode } | null {
  if (paramNames.size === 0) return null;
  const names = [...paramNames].map(escapeRegExp).join("|");
  const escapedMethod = escapeRegExp(methodName);
  const re = new RegExp(`^(${names})\\.${escapedMethod}(?![\\w.])`);
  const calls: AstNode[] = [];
  findAllDescendants(valueNode, (n) => CALL_NODE_TYPE.test(n.type), 10, calls);
  for (const call of calls) {
    const m = re.exec(call.text);
    if (m) return { field: m[1]!, call };
  }
  return null;
}

/**
 * *** IDIOMA-FRAMEWORK — la firma de la INYECCIÓN, no sólo del reenvío (ola
 * de precisión posterior a la Ola D, frente Decorator) ***. La Ola D juzgó
 * 19 falsos idénticos sobre Rails: un controlador (`Admin::
 * RemindersController#update`, `PasswordResetsController#update`, …)
 * reenvía homónimamente `update`/`destroy`/`show` a un colaborador propio
 * (`@reminder`, `@user`, …) — la MISMA forma exacta que `ColorDecorator`
 * reenviando `area()` a `@shape`. Verificado leyendo las 19 clases reales del
 * Rails del usuario: NINGUNA declara constructor (`initialize`) — el campo
 * se asigna dentro de un callback SIN parámetros propios (`before_action
 * :set_reminder` → `def set_reminder; @reminder = Reminder.find(params[:id]);
 * end`), nunca desde un parámetro inyectado. Las 6 variantes de lenguaje de
 * la fixture canónica (`tests/fixtures/patterns-positive/decorator/*`)
 * SIEMPRE asignan el colaborador desde un PARÁMETRO de la función que lo
 * asigna: `initialize(shape) { @shape = shape }` (Ruby), `constructor(shape)
 * { this.shape = shape }` (TS/JS/Python), `func NewColorDecorator(shape
 * Shape) *ColorDecorator { return &ColorDecorator{shape: shape} }` (Go: el
 * "constructor" es una función libre que arma el struct con un literal de
 * composición) — la inyección de dependencias que Decorator necesita para
 * envolver CUALQUIER instancia del protocolo, no sólo la que un método
 * particular decidió buscar. `memberInjectsField`/`classInjectsField`/
 * `goInjectsField` verifican esa firma por AST — nunca por vocabulario
 * ("initialize"/"constructor"/"before_action" no aparecen acá: CUALQUIER
 * método, sea cual sea su nombre, cuenta si asigna el campo desde SU PROPIO
 * parámetro). Sin esto, un reenvío homónimo puro no distingue "composición
 * real inyectada" de "un lookup cacheado en una variable de instancia" — la
 * MISMA forma AST del lado que reenvía, semántica opuesta del lado que
 * asigna.
 */
function bareFieldKey(node: AstNode): string {
  const raw = fieldKeyOf(node);
  return raw.startsWith("@") ? raw.slice(1) : raw;
}

/** ¿Alguna asignación dentro de `member` escribe `field` (self/campo propio)
 *  desde uno de los PARÁMETROS PROPIOS de `member`? La firma exacta de
 *  inyección de dependencias — ver el docstring de arriba. No tiene que ser
 *  el mismo miembro que reenvía: un setter de inyección separado del
 *  constructor cuenta igual. */
function memberInjectsField(member: AstNode, field: string, selfNames: ReadonlySet<string>): boolean {
  const paramNames = functionParamNames(member);
  if (paramNames.size === 0) return false;
  const body = (member.childForFieldName("body") as AstNode | null) ?? member;
  const assigns: AstNode[] = [];
  findAllDescendants(body, isAssignmentLike, 10, assigns);
  for (const assign of assigns) {
    const leftRaw = (assign.childForFieldName("left") as AstNode | null) ?? assign;
    const left = unwrapSingleChild(leftRaw);
    if (!isSelfFieldAccess(left, selfNames)) continue;
    if (bareFieldKey(left) !== field) continue;
    const rightRaw = (assign.childForFieldName("right") as AstNode | null) ?? assign;
    const right = unwrapSingleChild(rightRaw);
    if (right.type === "identifier" && paramNames.has(right.text)) return true;
  }
  return false;
}

/**
 * *** OLA U (N4) — LA SEGUNDA RAMA QUE `PLAN-INTENCIONES.md` §6 pide textual ***
 * *"`classInjectsField` necesita una segunda rama que reconozca 'el
 * colaborador es el retorno de un miembro DECLARADO ABSTRACTO/interfaz en la
 * misma clase' (mismo (name, arity) contra `memberSignatures`, sin cuerpo
 * propio o marcado `abstract`)"*.
 *
 * `true` si `clsNode` declara un miembro llamado `field` SIN CUERPO — la
 * forma en que una gramática escribe "esto lo provee otro": un método
 * abstracto de una clase base, o la firma de una interfaz. `ForwardingList`
 * declara `protected abstract List<E> delegate();` y todos sus reenvíos pasan
 * por ahí.
 *
 * MISMA INTENCIÓN QUE LA PRIMERA RAMA, no una excepción: las dos preguntan
 * *"¿quién decide QUÉ instancia se envuelve — la unidad misma o alguien de
 * afuera?"*. Un campo asignado desde un parámetro propio deja esa decisión
 * afuera (inyección). Un accessor sin cuerpo la deja afuera TAMBIÉN, un
 * escalón más arriba: la subclase concreta la responde. Lo que las dos
 * rechazan por igual es el caso que la Ola D midió 19 veces (un campo que la
 * propia unidad va a buscar sola, sin que nadie se lo dé) — ése sigue sin
 * pasar por ninguna de las dos ramas.
 */
function declaresBodylessAccessor(clsNode: AstNode, sets: DerivedNodeSets, field: string): boolean {
  const body = clsNode.childForFieldName("body") as AstNode | null;
  if (!body) return false;
  for (const member of namedChildren(body)) {
    if (!sets.functionNodes.has(member.type)) continue;
    const name = (member.childForFieldName("name") as AstNode | null)?.text;
    if (name !== field) continue;
    if ((member.childForFieldName("body") as AstNode | null) === null) return true;
  }
  return false;
}

/** Ruta de CLASE: ¿ALGÚN miembro de `clsNode` inyecta `field` desde su
 *  propio parámetro, o `field` es un accessor declarado sin cuerpo (ver
 *  `declaresBodylessAccessor`)? */
function classInjectsField(clsNode: AstNode, sets: DerivedNodeSets, selfNames: ReadonlySet<string>, field: string): boolean {
  const body = clsNode.childForFieldName("body") as AstNode | null;
  if (!body) return false;
  if (declaresBodylessAccessor(clsNode, sets, field)) return true;
  for (const member of namedChildren(body)) {
    if (!sets.functionNodes.has(member.type)) continue;
    if (memberInjectsField(member, field, selfNames)) return true;
  }
  return false;
}

/**
 * Ruta Go: sin métodos con receptor que "inyecten" (Go no tiene
 * constructores) — el idioma es una función LIBRE que arma el struct con un
 * `composite_literal` (`&ColorDecorator{shape: shape}`, ver la fixture
 * canónica). Busca, en TODO el archivo, un `composite_literal` de `typeName`
 * cuyo `keyed_element` de clave `field` tenga un valor que sea un parámetro
 * PROPIO de la función que contiene ese literal — misma firma de inyección,
 * forma sintáctica distinta (par clave/valor de un literal, no una
 * asignación) — mismos nodos (`composite_literal`/`keyed_element`) que
 * `detect/intra-file/lazy-init-repetida.ts#collectCompositeLiteralWrites`
 * ya usa para el idioma equivalente de Proxy.
 */
function goInjectsField(root: AstNode, sets: DerivedNodeSets, typeName: string, field: string): boolean {
  let found = false;
  const visit = (node: AstNode, enclosingFn: AstNode | null): void => {
    if (found) return;
    const nextFn = sets.functionNodes.has(node.type) ? node : enclosingFn;
    if (node.type === "composite_literal") {
      const typeNode = node.childForFieldName("type") as AstNode | null;
      if (typeNode?.text === typeName && nextFn) {
        const paramNames = functionParamNames(nextFn);
        const keyedElements: AstNode[] = [];
        findAllDescendants(node, (n) => n.type === "keyed_element", 4, keyedElements);
        for (const ke of keyedElements) {
          const kids = namedChildren(ke);
          const keyNode = (ke.childForFieldName("key") as AstNode | null) ?? kids[0] ?? null;
          const valueNode = (ke.childForFieldName("value") as AstNode | null) ?? kids[1] ?? null;
          if (!keyNode || !valueNode || keyNode.text !== field) continue;
          const value = unwrapSingleChild(valueNode);
          if (value.type === "identifier" && paramNames.has(value.text)) {
            found = true;
            return;
          }
        }
      }
    }
    for (const c of namedChildren(node)) visit(c, nextFn);
  };
  visit(root, null);
  return found;
}

/** Ruta de CLASE: recorre cada miembro function-like de la clase (por AST,
 *  vía `sets.functionNodes`) y cuenta cuántos, DISTINTOS, reenvían
 *  HOMÓNIMAMENTE a un mismo campo propio QUE ADEMÁS está inyectado (ver
 *  `classInjectsField` arriba) — un reenvío homónimo a un campo que nunca se
 *  asignó desde un parámetro propio es el idioma de framework (Cause A), no
 *  composición real. */
/**
 * *** OLA U (N4) — EL REENVÍO ATRAPA-TODO, hermano exacto de
 * `goEmbeddedFieldNames` ***
 * Igual que Go EMBEBE el tipo del colaborador para reenviar el protocolo
 * entero, Python y Ruby lo hacen con el gancho de despacho dinámico de su
 * protocolo de objetos (`__getattr__`, `method_missing`): un miembro cuyo
 * cuerpo va a buscar CUALQUIER nombre al colaborador. Un envoltorio que lo
 * declara expone el protocolo COMPLETO del envuelto y sólo escribe los
 * miembros que quiere cambiar — así que ni "la mayoría de sus miembros
 * escritos" ni "≥2 nombres compartidos escritos" son medibles contando lo
 * escrito.
 *
 * CASO MEDIDO, y es el que obliga a esto: `corpus/click/src/click/_compat.py:
 * 455-470 _AtomicFile` — `__getattr__` reenvía TODO a `self._f`, y `close()`
 * reenvía Y ADEMÁS hace el rename atómico. Es el ÚNICO Decorator del corpus
 * que el juicio a mano de esta ola marcó VERDADERO, y sin esta rama la
 * cláusula 0 lo perdía: tiene UN solo miembro homónimo escrito.
 *
 * Los nombres son vocabulario del PROTOCOLO DE OBJETOS del lenguaje — el mismo
 * estatus que `this`/`self` (`SELF_WORDS`, arriba) o que `isinstance`/`typeof`
 * en `chain-of-responsibility.ts`: no es léxico de dominio ni de framework, es
 * cómo cada gramática escribe "cualquier mensaje".
 */
const CATCH_ALL_FORWARDER_NAMES = new Set(["__getattr__", "__getattribute__", "method_missing"]);

function catchAllForwardedField(clsNode: AstNode, sets: DerivedNodeSets, selfNames: ReadonlySet<string>): string | null {
  const body = clsNode.childForFieldName("body") as AstNode | null;
  if (!body) return null;
  for (const member of namedChildren(body)) {
    if (!sets.functionNodes.has(member.type)) continue;
    const name = (member.childForFieldName("name") as AstNode | null)?.text;
    if (!name || !CATCH_ALL_FORWARDER_NAMES.has(name)) continue;
    const memberBody = (member.childForFieldName("body") as AstNode | null) ?? member;
    const access = findDescendant(memberBody, (n) => isSelfFieldAccess(n, selfNames) && bareFieldKey(n) !== n.text, 8);
    if (access) return bareFieldKey(access);
  }
  return null;
}

/**
 * *** OLA W (W4) — LA CONFORMIDAD DECLARADA: LA TERCERA FORMA EN QUE EL
 * PROTOCOLO ENTERO VIAJA SIN ESCRIBIRSE, Y LA ÚNICA QUE RESUELVE EL PROTOCOLO
 * EXTERNO AL REPO ***
 *
 * EL CASO MEDIDO, con archivo y línea, re-verificado abriendo el archivo en
 * este árbol: `corpus/hugo/hugofs/filename_filter_fs.go`. El struct
 * `filenameFilterFs` (`:38`) tiene un campo NOMBRADO `fs afero.Fs` (no
 * embebido, así que `goEmbeddedFieldNames` no lo ve), declara **15** métodos
 * con receptor propio (`:45`-`:170`) y sólo **3** reenvían homónimamente
 * (`Open`, `OpenFile`, `Stat`): los otros doce devuelven `syscall.EPERM`,
 * `panic(...)` o un literal — o sea SOBRESCRIBEN el comportamiento, que es
 * exactamente lo que un decorador de filtrado hace. Con la cuenta de la Ola U,
 * 3 de 15 no es "la mayoría", hay embellecimiento ⇒ `parcial` ⇒ la hipótesis
 * dice *"se beneficiaría de formalizarse con Decorator"* sobre un Decorator YA
 * APLICADO. Es la causa aislada del **0 % de precisión sobre las
 * recomendaciones** de este patrón (Ola V).
 *
 * POR QUÉ NO SE PODÍA DECIDIR: el protocolo compartido es `afero.Fs`, de una
 * dependencia EXTERNA. No hay nodo del repo, así que `graphOverride` no
 * confirma nada y la única señal que quedaba era contar reenvíos escritos —
 * que mide lo contrario de lo que hay que medir: cuanto MÁS comportamiento
 * propio agrega el decorador, MENOS parece decorador.
 *
 * LA SEÑAL QUE SÍ ESTÁ, y es de GRAMÁTICA, no de grafo ni de vocabulario: **la
 * unidad DECLARA que conforma al mismo tipo que su colaborador**.
 *   - Lenguajes con cláusula de conformidad (Java, C#, TS, Python, Ruby, PHP):
 *     el tipo declarado del campo/accessor colaborador aparece en la cláusula
 *     `extends`/`implements`/base de la propia clase — `ForwardingList` declara
 *     `protected abstract List<E> delegate();` y a la vez `implements List<E>`.
 *   - Go, que no tiene cláusula: el idioma equivalente es la FIRMA de la
 *     función que construye el struct — `newFilenameFilterFs(fs afero.Fs, …)
 *     afero.Fs` (`:29`) devuelve el MISMO tipo que el campo y construye
 *     `&filenameFilterFs{…}`. Entra un `afero.Fs`, sale un `afero.Fs`: la
 *     sustituibilidad la escribe el compilador, no el conteo.
 *
 * MISMA INTENCIÓN QUE LAS OTRAS DOS FORMAS, no una excepción: campo embebido,
 * `__getattr__`/`method_missing` y conformidad declarada dicen las tres *"todo
 * el protocolo está presente aunque no esté escrito miembro por miembro"*, y
 * las tres hacen que el denominador de la cláusula de MAYORÍA deje de ser
 * observable contando lo escrito. La consecuencia es la correcta según el
 * objetivo del proyecto: **`ya-aplicado`, que NO es una recomendación** — no se
 * propone formalizar lo que ya está formalizado.
 *
 * *** LA CONDICIÓN QUE LO ACOTA, Y ES LA MITAD DEL ARREGLO: EL PROTOCOLO TIENE
 * QUE SER EXTERNO AL ARCHIVO ***
 * Sin esta condición, la primera versión de este chequeo rompió SIETE tests de
 * la Ola U —medido, no previsto— y con razón: `TS_STRUCTURAL_PARTIAL` /
 * `TS_STRUCTURAL_MIDDLE_MAN` (`decorator.test.ts`) declaran `interface Priced`
 * EN EL MISMO ARCHIVO, y ahí el conteo de la Ola U tiene toda la información
 * que necesita — el protocolo está a la vista, se puede contar cuántos de sus
 * miembros se reenvían y cuántos no. La calibración de la Ola U (mayoría +
 * embellecimiento, que separa Decorator de Middle-man) queda intacta.
 *
 * El problema que este chequeo resuelve es EXACTAMENTE el otro: *"cuando el
 * protocolo compartido es EXTERNO, el motor no lo confirma y empuja a
 * `parcial`"*. Un protocolo que el archivo no declara no tiene miembros
 * contables: ni el grafo (no hay nodo del repo) ni el AST (no hay declaración)
 * pueden decir cuántos son. Ahí, y sólo ahí, el conteo de miembros ESCRITOS
 * deja de ser un denominador y la conformidad declarada pasa a ser la única
 * evidencia disponible.
 *
 * LO QUE NO ACEPTA (controles negativos, y es lo que lo separa de "cualquier
 * clase que tenga un campo"): (a) un protocolo declarado en el mismo archivo
 * —sigue mandando el conteo—; (b) una clase que NO declara conformar al tipo
 * de su colaborador; (c) las cláusulas 0 y 2 de `levelFromSignal` siguen
 * primero — un solo nombre compartido sigue siendo coincidencia, y un reenvío
 * que no agrega nada sigue siendo Middle-man y sigue sin producir hipótesis.
 * Y NUNCA se infiere el protocolo por CONJUNTO DE MIEMBROS —la forma de
 * `deriveSatisfiesEdges` que fabricó 1.360 aristas falsas—: acá el protocolo
 * tiene que estar ESCRITO en la cláusula de herencia o en el tipo de retorno
 * del constructor.
 */
const HERITAGE_NODE_TYPE = /superclass|interface|heritage|base_list|base_clause|extends|implements|argument_list|type_list/i;

/** Tipos de nodo con los que una gramática DECLARA un tipo nombrado. El
 *  chequeo real es el `name`: `class_heritage`/`class_body` matchean el regex
 *  pero no declaran ningún nombre, así que nunca cuentan. */
const TYPE_DECLARATION_NODE_TYPE = /class|interface|struct|enum|trait|record|type_spec|type_alias|module/i;

/** ¿El archivo declara un tipo llamado `name`? Si lo declara, el protocolo NO
 *  es externo y este chequeo no aplica (ver el docstring de arriba). */
function typeDeclaredInFile(root: AstNode, name: string): boolean {
  let found = false;
  const visit = (node: AstNode): void => {
    if (found) return;
    if (TYPE_DECLARATION_NODE_TYPE.test(node.type) && (node.childForFieldName("name") as AstNode | null)?.text === name) {
      found = true;
      return;
    }
    for (const c of namedChildren(node)) visit(c);
  };
  visit(root);
  return found;
}

function declaresName(node: AstNode, name: string, depth: number): boolean {
  if ((node.childForFieldName("name") as AstNode | null)?.text === name) return true;
  if (depth <= 0) return false;
  for (const c of namedChildren(node)) if (declaresName(c, name, depth - 1)) return true;
  return false;
}

/** El tipo ESCRITO del miembro (campo o accessor) llamado `memberName` dentro
 *  de `clsNode`. Se queda con el nodo MÁS PROFUNDO que tenga campo `type` y
 *  que declare ese nombre, porque las gramáticas anidan a distinta altura: en
 *  Java el `type` cuelga del `field_declaration`, en C# del
 *  `variable_declaration` de adentro. */
function declaredTypeOfOwnMember(clsNode: AstNode, memberName: string): string | null {
  const body = clsNode.childForFieldName("body") as AstNode | null;
  if (!body) return null;
  let best: string | null = null;
  const visit = (n: AstNode, depth: number): void => {
    if (depth < 0) return;
    const typeNode = n.childForFieldName("type") as AstNode | null;
    if (typeNode && declaresName(n, memberName, 3)) best = baseTypeName(typeNode.text);
    for (const c of namedChildren(n)) visit(c, depth - 1);
  };
  for (const member of namedChildren(body)) visit(member, 4);
  return best;
}

/** Los nombres de tipo que la unidad declara conformar — sólo los nodos de la
 *  CLÁUSULA de herencia/implementación de cada gramática, nunca los
 *  modificadores ni las anotaciones. */
function declaredConformanceNames(clsNode: AstNode): ReadonlySet<string> {
  const out = new Set<string>();
  for (const c of namedChildren(clsNode)) {
    if (!HERITAGE_NODE_TYPE.test(c.type)) continue;
    const ids: AstNode[] = [];
    findAllDescendants(c, (n) => n.type === "type_identifier" || n.type === "identifier", 5, ids);
    for (const id of ids) out.add(id.text);
    out.add(baseTypeName(c.text));
  }
  return out;
}

/** Ruta de CLASE de la conformidad declarada (ver el docstring de arriba).
 *  `fileRoot` ausente ⇒ no se puede decidir si el protocolo es externo ⇒ no
 *  aplica (default conservador: manda el conteo de la Ola U). */
function classDeclaresSameProtocolAs(clsNode: AstNode, field: string, fileRoot: AstNode | null): string | null {
  if (!fileRoot) return null;
  const protocol = declaredTypeOfOwnMember(clsNode, field);
  if (!protocol) return null;
  if (!declaredConformanceNames(clsNode).has(protocol)) return null;
  if (typeDeclaredInFile(fileRoot, protocol)) return null;
  return `la clase declara conformar a \`${protocol}\`, el MISMO tipo escrito de su colaborador \`${field}\`, y \`${protocol}\` NO se declara en este archivo (protocolo externo, sin miembros contables) — el protocolo entero está presente por declaración, se reenvíe o se sobrescriba miembro por miembro`;
}

/** El tipo ESCRITO del campo `field` dentro de `type <typeName> struct { … }`. */
function goStructFieldType(root: AstNode, typeName: string, field: string): string | null {
  let found: string | null = null;
  const visit = (node: AstNode): void => {
    if (found) return;
    if (node.type === "type_spec" && (node.childForFieldName("name") as AstNode | null)?.text === typeName) {
      const struct = node.childForFieldName("type") as AstNode | null;
      const decls: AstNode[] = [];
      if (struct) findAllDescendants(struct, (n) => n.type === "field_declaration", 4, decls);
      for (const d of decls) {
        const names: AstNode[] = [];
        findAllDescendants(d, (n) => n.type === "field_identifier", 2, names);
        if (!names.some((n) => n.text === field)) continue;
        const t = d.childForFieldName("type") as AstNode | null;
        if (t) {
          found = baseTypeName(t.text);
          return;
        }
      }
    }
    for (const c of namedChildren(node)) visit(c);
  };
  visit(root);
  return found;
}

/** Ruta GO de la conformidad declarada: alguna función del archivo devuelve el
 *  tipo del colaborador Y construye el struct dueño (`newFilenameFilterFs(fs
 *  afero.Fs, …) afero.Fs` ⇒ `&filenameFilterFs{fs: fs}`). */
function goDeclaresSameProtocolAs(root: AstNode, sets: DerivedNodeSets, typeName: string, field: string): string | null {
  const protocol = goStructFieldType(root, typeName, field);
  if (!protocol) return null;
  if (typeDeclaredInFile(root, protocol)) return null;
  let found = false;
  const visit = (node: AstNode): void => {
    if (found) return;
    if (sets.functionNodes.has(node.type)) {
      const result = node.childForFieldName("result") as AstNode | null;
      if (result && baseTypeName(result.text) === protocol) {
        const lits: AstNode[] = [];
        findAllDescendants(node, (n) => n.type === "composite_literal", 12, lits);
        if (lits.some((l) => (l.childForFieldName("type") as AstNode | null)?.text === typeName)) {
          found = true;
          return;
        }
      }
    }
    for (const c of namedChildren(node)) visit(c);
  };
  visit(root);
  return found
    ? `una función del archivo construye \`${typeName}\` y lo devuelve declarado como \`${protocol}\`, el MISMO tipo escrito de su colaborador \`${field}\`, y \`${protocol}\` no se declara en este archivo (protocolo externo, sin miembros contables) — entra un \`${protocol}\` y sale un \`${protocol}\`: la sustituibilidad está declarada, no contada`
    : null;
}

/**
 * OLA W (W4) — la ventana EXACTA en la que la conformidad declarada puede
 * decidir algo, y por qué es tan angosta a propósito.
 *
 * Las tres cláusulas de `levelFromSignal` se preguntan en orden: (0) protocolo
 * compartido — ≥2 nombres, si no es coincidencia; (1) MAYORÍA — decide `full`;
 * (2) embellecimiento — separa `partial` de Middle-man. La conformidad
 * declarada sólo tiene algo que decir sobre la (1), porque es la única que
 * necesita un DENOMINADOR (cuántos miembros tiene el protocolo) y es la única
 * que el protocolo externo vuelve incontable.
 *
 * Por eso este predicado exige que las otras dos YA estén satisfechas
 * (`distinct >= 2`, `embellished >= 1`) y que la mayoría sea lo único que
 * falta. La consecuencia es que este chequeo **sólo puede convertir un
 * `parcial` en `ya-aplicado`**: no puede crear una hipótesis donde no había
 * ninguna, no puede rescatar un Middle-man (que sigue dando `none` ⇒ ninguna
 * hipótesis) y no puede aflojar la cláusula 0. Es decir: no sube volumen, y lo
 * único que quita son RECOMENDACIONES sobre patrones ya aplicados — que es
 * justo lo que el objetivo del proyecto pide no emitir.
 */
function soloLeFaltaLaMayoria(best: DelegationSignal): boolean {
  return best.wholeProtocol !== true && best.distinct >= 2 && best.embellished >= 1 && best.distinct * 2 <= best.members;
}

function classSameNameForwards(clsNode: AstNode, sets: DerivedNodeSets, selfNames: ReadonlySet<string>, fileRoot: AstNode | null): DelegationSignal | null {
  const body = clsNode.childForFieldName("body") as AstNode | null;
  if (!body) return null;
  const tally = new ForwardTally();
  for (const member of namedChildren(body)) {
    if (!sets.functionNodes.has(member.type)) continue;
    tally.countMember();
    const memberName = (member.childForFieldName("name") as AstNode | null)?.text;
    if (!memberName) continue;
    const bodyNode = (member.childForFieldName("body") as AstNode | null) ?? member;
    const hit = ownCollaboratorSameNameCall(bodyNode, memberName, selfNames);
    if (!hit) continue;
    if (!classInjectsField(clsNode, sets, selfNames, hit.field)) continue;
    tally.countForward(hit.field, memberName, !memberOnlyRelays(bodyNode, hit.call));
  }
  const best = tally.best();
  if (!best) return null;
  // Protocolo completo por reenvío atrapa-todo (ver arriba): el denominador
  // honesto —y el conteo de nombres compartidos— es el propio conjunto de
  // reenvíos escritos, porque los demás ya viajan sin escribirse.
  if (catchAllForwardedField(clsNode, sets, selfNames) === best.field) {
    return { ...best, members: best.distinct, wholeProtocol: true, wholeProtocolWhy: `un reenvío ATRAPA-TODO manda cualquier mensaje a \`${best.field}\`` };
  }
  if (soloLeFaltaLaMayoria(best)) {
    const declared = classDeclaresSameProtocolAs(clsNode, best.field, fileRoot);
    if (declared) return { ...best, members: best.distinct, wholeProtocol: true, wholeProtocolWhy: declared };
  }
  return best;
}

/**
 * Ruta Go (sin nodo de clase — `located.cls` es siempre `null` para Go, ver
 * `locateFunctionAndClass`): recorre TODO el archivo por funciones con
 * receptor del MISMO tipo (`d *ColorDecorator`), y cuenta reenvíos
 * homónimos por campo del struct QUE ADEMÁS está inyectado (`goInjectsField`),
 * igual que `classSameNameForwards` pero sin un nodo de clase que agrupe los
 * métodos.
 */
/**
 * *** OLA U (N4) — EL DENOMINADOR DE "LA MAYORÍA" NO ES OBSERVABLE CUANDO EL
 * PROTOCOLO SE HEREDA POR EMBEBIDO ***
 * Go no tiene herencia: el idioma equivalente es EMBEBER el tipo del
 * colaborador en el struct (`type hashingFile struct { afero.File; … }`), y
 * entonces TODO el protocolo se reenvía por construcción — sólo los miembros
 * que el envoltorio quiere cambiar aparecen escritos. Contar "cuántos miembros
 * escritos reenvían sobre cuántos miembros escritos hay" mide, en ese caso, lo
 * contrario de lo que la cláusula quiere: cuantos MÁS miembros propios agrega
 * el decorador, MENOS parece decorador.
 *
 * Medido sobre `corpus/hugo` (los seis sistemas de archivos decoradores de
 * `hugofs/`: `hashing_fs.go`, `hasbytes_fs.go`, `stacktracer_fs.go`,
 * `filename_filter_fs.go`, `createcounting_fs.go`, `decorators.go`): todos
 * embeben `afero.Fs`/`afero.File` y reenvían 1-2 miembros escritos sobre 5.
 *
 * INTENCIÓN VERIFICADA: *"¿el envoltorio expone el protocolo ENTERO del
 * envuelto?"*. Un campo EMBEBIDO —el que la gramática escribe sin nombre, sólo
 * con su tipo— responde que sí por construcción. Es un hecho de gramática, no
 * una heurística: `field_declaration` sin campo `name`.
 */
function goEmbeddedFieldNames(root: AstNode, typeName: string): ReadonlySet<string> {
  const names = new Set<string>();
  const visit = (node: AstNode): void => {
    if (node.type === "type_spec" && (node.childForFieldName("name") as AstNode | null)?.text === typeName) {
      const struct = node.childForFieldName("type") as AstNode | null;
      const decls: AstNode[] = [];
      if (struct) findAllDescendants(struct, (n) => n.type === "field_declaration", 4, decls);
      for (const d of decls) {
        if ((d.childForFieldName("name") as AstNode | null) !== null) continue; // campo con nombre: no es embebido.
        const typeNode = (d.childForFieldName("type") as AstNode | null) ?? d;
        names.add(trailingIdentifier(typeNode.text));
      }
    }
    for (const c of namedChildren(node)) visit(c);
  };
  visit(root);
  return names;
}

function goSameNameForwards(root: AstNode, sets: DerivedNodeSets, typeName: string): DelegationSignal | null {
  const tally = new ForwardTally();
  const visit = (node: AstNode): void => {
    if (sets.functionNodes.has(node.type)) {
      const recv = goReceiverOf(node);
      if (recv && recv.typeName === typeName) {
        tally.countMember();
        const methodName = (node.childForFieldName("name") as AstNode | null)?.text;
        if (methodName) {
          const bodyNode = (node.childForFieldName("body") as AstNode | null) ?? node;
          const hit = ownCollaboratorSameNameCall(bodyNode, methodName, new Set([recv.paramName]));
          if (hit && goInjectsField(root, sets, typeName, hit.field)) {
            tally.countForward(hit.field, methodName, !memberOnlyRelays(bodyNode, hit.call));
          }
        }
      }
    }
    for (const c of namedChildren(node)) visit(c);
  };
  visit(root);
  const best = tally.best();
  if (!best) return null;
  // Ver `goEmbeddedFieldNames`: si el colaborador está EMBEBIDO, el protocolo
  // entero se reenvía por construcción — el denominador honesto es el propio
  // conjunto de reenvíos escritos, no "los miembros que además se escribieron".
  if (goEmbeddedFieldNames(root, typeName).has(best.field)) {
    return { ...best, members: best.distinct, wholeProtocol: true, wholeProtocolWhy: `el colaborador \`${best.field}\` está EMBEBIDO en el struct` };
  }
  if (soloLeFaltaLaMayoria(best)) {
    const declared = goDeclaresSameProtocolAs(root, sets, typeName, best.field);
    if (declared) return { ...best, members: best.distinct, wholeProtocol: true, wholeProtocolWhy: declared };
  }
  return best;
}

/**
 * Ruta FUNCIONAL (sin clase, sin receptor Go): busca, dentro de `scopeNode`
 * (el cuerpo de una función-wrapper), pares clave/valor de un objeto literal
 * (`area: () => shape.area()`) cuya CLAVE coincide con el nombre del método
 * invocado sobre uno de los parámetros capturados — el equivalente
 * funcional de "el miembro X.m llama a Y.m", sin necesitar tipos ni clase.
 */
function functionalSameNameForwards(scopeNode: AstNode, paramNames: ReadonlySet<string>): DelegationSignal | null {
  const tally = new ForwardTally();
  const visit = (node: AstNode): void => {
    const keyNode = node.childForFieldName("key") as AstNode | null;
    const valueNode = node.childForFieldName("value") as AstNode | null;
    if (keyNode && valueNode) {
      // El "miembro" de una unidad funcional es cada par clave/valor del
      // objeto que expone — el denominador de la cláusula de MAYORÍA acá.
      tally.countMember();
      const keyName = /^[A-Za-z_$][\w$]*$/.test(keyNode.text) ? keyNode.text : trailingIdentifier(keyNode.text);
      const hit = paramSameNameCall(valueNode, keyName, paramNames);
      // El cuerpo real de una clave funcional es el de su lambda (`() =>
      // shape.area()`); si la clave no envuelve nada, el valor ES el cuerpo.
      if (hit) tally.countForward(hit.field, keyName, !memberOnlyRelays((valueNode.childForFieldName("body") as AstNode | null) ?? valueNode, hit.call));
    }
    for (const c of namedChildren(node)) visit(c);
  };
  visit(scopeNode);
  return tally.best();
}

/** Busca OTRA función del mismo archivo (excluyendo la función ancla) con la
 *  forma de wrapper de orden superior (`functionalSameNameForwards` sobre
 *  sus propios parámetros) — la ruta "sin clase, sin receptor Go" para el
 *  excluder de `ya-aplicado`. */
function fileWideSameNameForwards(root: AstNode, sets: DerivedNodeSets, exclude: AstNode): DelegationSignal | null {
  let best: DelegationSignal | null = null;
  const visit = (node: AstNode): void => {
    if (sets.functionNodes.has(node.type) && node !== exclude) {
      const paramNames = functionParamNames(node);
      if (paramNames.size > 0) {
        const bodyNode = (node.childForFieldName("body") as AstNode | null) ?? node;
        const found = functionalSameNameForwards(bodyNode, paramNames);
        if (found && (!best || found.distinct > best.distinct)) best = found;
      }
    }
    for (const c of namedChildren(node)) visit(c);
  };
  visit(root);
  return best;
}

type CompositionLevel = "none" | "partial" | "full";

/**
 * *** OLA U (N4) — LA INTENCIÓN DE DECORATOR, EN TRES CLÁUSULAS ***
 *
 * `PLAN-INTENCIONES.md` §6: *"¿Existe `X` que implementa/satisface el mismo
 * protocolo que un colaborador `Y` (campo o accessor), reenvía la MAYORÍA de
 * sus miembros homónimamente a `Y`, y AL MENOS UNO de ellos hace algo MÁS que
 * reenviar?"* — y, del mismo documento: *"Se confunde con Proxy (mismo
 * reenvío homónimo, pero SIN agregar comportamiento nuevo)"*.
 *
 * Hasta esta ola el nivel se decidía con UNA sola cuenta: `distinct >= 2`.
 * Eso deja pasar las dos formas vecinas enteras:
 *
 *   - **MIDDLE-MAN / Proxy** — reenvía y no agrega nada. Medido sobre el
 *     corpus antes de tocar nada (`scripts/u-n4-probe.mts`): los 32 `parcial`
 *     de `sqlalchemy` son TODOS "1 solo reenvío homónimo — podría ser un
 *     accessor simple" por evidencia propia del check
 *     (`pool/base.py:1186 cursor ⇒ dbapi_connection.cursor()`,
 *     `engine/base.py:3139 dispose ⇒ pool.dispose()`, …), y el juicio a mano
 *     de esta ola sobre esa población los marcó falsos. Recomendar Decorator
 *     ahí es recomendar el patrón equivocado: el remedio de un middle-man es
 *     sacarlo, no formalizarlo.
 *   - **DELEGACIÓN SUELTA** — dos o tres reenvíos en una clase de cuarenta
 *     miembros. No es una envoltura: es composición ordinaria.
 *
 * Las dos cláusulas nuevas son las que el plan nombra, y ninguna mira nombres:
 *
 *   0. PROTOCOLO COMPARTIDO (`distinct >= 2`) — ver la cláusula 0 en el cuerpo
 *      de la función: un solo nombre de miembro compartido es coincidencia.
 *   1. MAYORÍA (`distinct * 2 > members`) — el tipo se define por lo que
 *      reenvía, no reenvía de paso. Es lo que hace que el envoltorio sea
 *      SUSTITUIBLE por el envuelto, que es de dónde sale todo el valor del
 *      patrón.
 *   2. AL MENOS UNO AGREGA (`embellished >= 1`) — si nadie hace más que
 *      reenviar, no hay comportamiento añadido; y "añadir comportamiento sin
 *      romper a quien lo usa" ES el problema que Decorator resuelve. Sin esa
 *      cláusula, Decorator y Middle-man son literalmente indistinguibles.
 *
 * DÓNDE PESA CADA CLÁUSULA — y por qué NO son simétricas (decidido, no
 * olvidado):
 *
 *   - La MAYORÍA decide `full` SOLA. Cuando una unidad reenvía la mayoría de
 *     sus miembros a un colaborador del mismo protocolo, la ENVOLTURA existe y
 *     es sustituible; que hoy embellezca o no es asunto de la instancia
 *     concreta. Y sobre `full` no se recomienda NADA (`ya-aplicado` no compite
 *     — `engine.ts#isOpportunity`), así que exigirle además embellecimiento no
 *     evitaría ninguna recomendación mala: sólo perdería el reconocimiento de
 *     la forma. Son los dos casos canónicos: `guava .../collect/
 *     ForwardingList.java:36-90` (20+ `delegate().m(...)` sobre una clase de
 *     22 miembros — el javadoc lo llama textualmente *"the decorator
 *     pattern"*) y las 6 variantes de la fixture del patrón (`ColorDecorator`:
 *     `area`+`describe` sobre 3 miembros).
 *   - El EMBELLECIMIENTO decide `partial` vs `none` — exactamente donde se
 *     emite o no una RECOMENDACIÓN. Un reenvío suelto que no agrega nada no es
 *     una envoltura a medio hacer: es un accessor. Ahí "formalizá esto con
 *     Decorator" es el remedio equivocado, y `none` (silencio) es la respuesta
 *     honesta: los dos `required` que consumen este nivel
 *     (`cadena-de-envoltura-presente`, `reenvio-homonimo-en-el-ancla`)
 *     devuelven `false` y no se emite hipótesis.
 */
function levelFromSignal(best: DelegationSignal | null, noneEvidence: string): { level: CompositionLevel; evidence: string } {
  if (!best) return { level: "none", evidence: noneEvidence };
  const cuenta = `\`${best.field}\` recibe ${best.distinct} reenvío(s) homónimo(s) (${best.sample.join(", ")}) sobre ${best.members} miembro(s) de la unidad`;
  // CLÁUSULA 0 — "X implementa el MISMO PROTOCOLO que Y". UN nombre de miembro
  // compartido con un colaborador es coincidencia (`Engine.dispose` y
  // `Pool.dispose` se llaman igual y no comparten protocolo: `Engine` no es un
  // `Pool`); DOS o más nombres compartidos hacia el MISMO colaborador ya son un
  // protocolo. Sin grafo no hay arista `implements` que mirar (límite declarado
  // en `toConfirm`), y ésta es la evidencia estructural que sí está: medida
  // sobre `corpus/sqlalchemy`, la forma "1 solo miembro homónimo" era 27 de las
  // 30 recomendaciones `parcial` del repo, incluida `lib/sqlalchemy/sql/
  // schema.py:1600 to_metadata`, que el juicio a mano de esta ola marcó FALSA.
  if (best.distinct < 2 && !best.wholeProtocol) {
    return {
      level: "none",
      evidence: `${cuenta} — UN solo nombre de miembro compartido con \`${best.field}\` no es evidencia de que ambos implementen el MISMO protocolo (podría ser coincidencia de nombre); sin protocolo compartido no hay envoltura que formalizar`,
    };
  }
  if ((best.distinct >= 2 || best.wholeProtocol === true) && best.distinct * 2 > best.members) {
    const extra = best.embellished > 0 ? `, y ${best.embellished} de ellos hace(n) algo MÁS que reenviar (${best.embellishedSample.join(", ")})` : "";
    // OLA W (W4): cuando el denominador se redujo a propósito (el protocolo
    // entero viaja sin escribirse), la evidencia dice POR QUÉ en vez de
    // afirmar una "mayoría" sobre un conteo que no es el de la unidad.
    const razon = best.wholeProtocolWhy ? ` (${best.wholeProtocolWhy})` : "";
    return {
      level: "full",
      evidence: `${cuenta} — la MAYORÍA${razon}${extra}: la unidad dueña ya envuelve otra instancia del mismo protocolo (Decorator aplicado)`,
    };
  }
  if (best.embellished === 0) {
    return {
      level: "none",
      evidence: `${cuenta} — no la mayoría — y NINGUNO hace algo más que reenviar: es un intermediario (Middle-man/Proxy), no una envoltura a medio hacer; formalizarlo con Decorator sería el remedio equivocado`,
    };
  }
  return {
    level: "partial",
    evidence: `${cuenta} — no la mayoría — pero ${best.embellished} de ellos hace(n) algo MÁS que reenviar (${best.embellishedSample.join(", ")}): envoltura ad hoc CON comportamiento agregado, sin protocolo común confirmado; se beneficiaría de formalizarse con Decorator`,
  };
}

function classDelegationLevel(
  clsNode: AstNode,
  sets: DerivedNodeSets,
  selfNames: ReadonlySet<string>,
  /** OLA W (W4) — la raíz del archivo, para decidir si el protocolo del
   *  colaborador es EXTERNO (ver `classDeclaresSameProtocolAs`). Opcional a
   *  propósito: sin ella, el chequeo nuevo no aplica y manda el conteo de la
   *  Ola U, que es el comportamiento anterior exacto. */
  fileRoot: AstNode | null = null,
): { level: CompositionLevel; evidence: string } {
  return levelFromSignal(
    classSameNameForwards(clsNode, sets, selfNames, fileRoot),
    "ningún método de la clase reenvía HOMÓNIMAMENTE a un campo propio (`this.<campo>.<mismoNombre>()`, `@campo.<mismoNombre>`) — sin evidencia de que la clase ya componga con otra instancia del mismo protocolo",
  );
}

function goDelegationLevel(root: AstNode, sets: DerivedNodeSets, typeName: string): { level: CompositionLevel; evidence: string } {
  return levelFromSignal(
    goSameNameForwards(root, sets, typeName),
    "ningún método con receptor de este tipo reenvía HOMÓNIMAMENTE a un campo propio del struct — Go no declara `implements` explícito, así que ésta es la mejor señal estructural disponible (satisfacción por conjunto de método, igual criterio que la arista `satisfies` del grafo)",
  );
}

function fileWideDelegationLevel(root: AstNode, sets: DerivedNodeSets, exclude: AstNode): { level: CompositionLevel; evidence: string } {
  return levelFromSignal(
    fileWideSameNameForwards(root, sets, exclude),
    "ninguna otra función/closure del archivo reenvía HOMÓNIMAMENTE llamadas a uno de sus propios parámetros — sin evidencia de un wrapper de orden superior ya compuesto en este módulo",
  );
}

/**
 * Ola 11a (P2) — variante de UN SOLO NIVEL de `fileWideDelegationLevel` para
 * el ancla `homonymous-delegation` (arriba): mira el cuerpo de la PROPIA
 * función ancla (la forma FUNCIONAL, Vue Composition API, sin clase ni
 * receptor Go — `useColorDecorator` retornando un objeto cuyas claves
 * reenvían al parámetro capturado), en vez de EXCLUIRLA para buscar
 * evidencia en OTRA parte del archivo. `fileWideDelegationLevel` excluye a
 * propósito la función ancla porque la usan las 4 anclas de OLOR (el ancla
 * ES el acumulador de banderas; la envoltura, si existe, vive en otra
 * función) — acá es al revés: el ancla ES la envoltura misma.
 */
function ownFunctionalDelegationLevel(fnNode: AstNode, sets: DerivedNodeSets): { level: CompositionLevel; evidence: string } {
  const paramNames = functionParamNames(fnNode);
  const bodyNode = (fnNode.childForFieldName("body") as AstNode | null) ?? fnNode;
  return levelFromSignal(
    paramNames.size > 0 ? functionalSameNameForwards(bodyNode, paramNames) : null,
    "ninguna clave del objeto retornado reenvía HOMÓNIMAMENTE a uno de los parámetros propios capturados — sin evidencia de que esta función ya componga con un colaborador inyectado",
  );
}

/**
 * Refuerzo con GRAFO REAL, cuando `build()` recibe uno (ver la nota de
 * arquitectura del docstring del módulo: en producción, para las anclas de
 * esta hipótesis, NUNCA — pero un harness de medición o un test sí pueden
 * pasarlo). Usa la terna COMPLETA de CONTRATO-F10 §0.4 tal como
 * `wrapping-chain.ts` la implementa (implements/satisfies + calls
 * receiver-member + aridad vía `memberSignatures`) — estrictamente más
 * fuerte que el reenvío homónimo por texto, así que sólo puede SUBIR el
 * nivel a `"full"`, nunca bajarlo.
 */
function graphOverride(graph: CodeGraph | null, file: string, ownerName: string | null): { level: "full"; evidence: string } | null {
  if (!graph || !ownerName) return null;
  const ownerId = symbolNodeId(file, [ownerName]);
  const all = findWrappingChains(graph);
  const own = all.filter((m) => m.wrapperId === ownerId);
  if (own.length === 0) return null;

  const risk = own.some((m) => m.viaSatisfies) ? " — riesgo declarado: alguna resolución vía `satisfies` en vez de `implements` (CONTRATO-F10 §3, A9 sin cerrar)" : "";
  const chain = chainEvidence(graph, all);
  return {
    level: "full",
    evidence: `el grafo confirma la terna de envoltura completa (implements/satisfies + calls receiver-member, aridad verificada): ${own.map((m) => `${m.memberName}/${m.memberArity ?? "?"}`).join(", ")}${risk}${chain ? `; ${chain}` : ""}`,
  };
}

/** Encadenamiento (los decoradores envuelven decoradores): ≥2 wrappers hacia
 *  la MISMA interfaz, con `instantiates` de uno hacia otro, o desde un mismo
 *  sitio hacia ambos. Sólo confirmable con grafo — ver límites declarados. */
function chainEvidence(graph: CodeGraph, matches: readonly WrappingChainMatch[]): string | null {
  const byInterface = new Map<string, Set<string>>();
  for (const m of matches) {
    const set = byInterface.get(m.interfaceId) ?? new Set<string>();
    set.add(m.wrapperId);
    byInterface.set(m.interfaceId, set);
  }
  for (const wrappers of byInterface.values()) {
    if (wrappers.size < 2) continue;
    const ids = [...wrappers];
    for (const a of ids) {
      for (const b of ids) {
        if (a !== b && graph.edges.some((e) => e.kind === "instantiates" && e.from === a && e.to === b)) {
          return "encadenamiento confirmado: un decorador instancia a otro hacia la misma interfaz";
        }
      }
    }
    const instantiatorsOf = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (e.kind !== "instantiates" || !wrappers.has(e.to)) continue;
      const set = instantiatorsOf.get(e.from) ?? new Set<string>();
      set.add(e.to);
      instantiatorsOf.set(e.from, set);
    }
    for (const targets of instantiatorsOf.values()) {
      if (targets.size >= 2) return "encadenamiento confirmado: un mismo sitio instancia a ≥2 decoradores hacia la misma interfaz";
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * 4. El problema tipado del motor — se computa UNA vez por `build()` y se
 *    reusa en los 5 checks (2 required + 3 discriminadores) + appliedState.
 * ──────────────────────────────────────────────────────────────────────── */

interface DecoratorProblem {
  located: { fn: FnCtx2; cls: ClsCtx2 | null } | null;
  candidate: EmbellishmentCandidate | null;
  fileRoot: AstNode | null;
  sets: DerivedNodeSets | null;
  file: string;
  /** El `kind` del `Finding` ancla — decide, vía `isStructuralAnchor`, cuál de
   *  los dos caminos de entrada usa esta construcción (ver la constante
   *  `STRUCTURAL_ANCHOR_KINDS` más arriba). */
  anchorKind: string;
  /** Sólo para anclas estructurales: la clase que el hallazgo anota,
   *  ubicada por `locateClassOnly` — `null` si el ancla no es estructural,
   *  si `ctx.file` está ausente, o si el rango no coincide con ninguna
   *  clase del árbol vivo. */
  structuralClass: ClsCtx2 | null;
  /** Sólo para el ancla de FUERZA: la clase que el hallazgo anota. */
  capabilityClass: ClsCtx2 | null;
  /**
   * Sólo para el ancla de FUERZA: la unidad RE-DERIVADA del árbol vivo de
   * ESTA corrida por el propio núcleo del detector — nunca el conteo que el
   * hallazgo trae escrito. Mismo criterio de "no confiar ciegamente en el
   * detector" que `REQUIRED_WRAPPING_STRUCTURE`/`REQUIRED_DELEGATION_PRESENT`
   * ya aplican. `null` si el árbol vivo de esta corrida ya no la confirma.
   */
  capabilityUnit: CapabilityUnit | null;
}

/**
 * Elige, entre las unidades que el núcleo del detector re-deriva del árbol
 * vivo, la que corresponde a ESTE hallazgo: por nombre cuando el hallazgo lo
 * trae (`locations[0].symbol`), y si no, por contención de líneas. Nunca
 * "la primera": dos unidades-tipo del mismo archivo pueden disparar.
 */
function matchCapabilityUnit(units: readonly CapabilityUnit[], symbol: string | undefined, startLine: number, endLine: number): CapabilityUnit | null {
  const byName = symbol ? units.filter((u) => u.name === symbol) : [];
  const pool = byName.length > 0 ? byName : units;
  let best: CapabilityUnit | null = null;
  for (const u of pool) {
    if (u.startLine > startLine || u.endLine < endLine) continue;
    if (!best || u.endLine - u.startLine < best.endLine - best.startLine) best = u;
  }
  return best ?? (byName.length === 1 ? byName[0]! : null);
}

function prepareProblem(finding: Finding, ctx: HypothesisContext): DecoratorProblem {
  const file = finding.locations[0].file;
  const anchorKind = finding.kind;
  if (!ctx.file) {
    return { located: null, candidate: null, fileRoot: null, sets: null, file, anchorKind, structuralClass: null, capabilityClass: null, capabilityUnit: null };
  }
  const loc = finding.locations[0];
  const sets = ctx.setsFor(ctx.file.language);
  const located = locateFunctionAndClass(ctx.file.root, sets, loc.startLine, loc.endLine);
  const candidate = located ? pickEmbellishmentCandidate(located.fn) : null;
  const structuralClass = STRUCTURAL_ANCHOR_KINDS.has(anchorKind) ? locateClassOnly(ctx.file.root, sets, loc.startLine, loc.endLine) : null;
  const isCapability = anchorKind === CAPABILITY_ANCHOR_KIND;
  const capabilityClass = isCapability ? locateClassOnly(ctx.file.root, sets, loc.startLine, loc.endLine) : null;
  const capabilityUnit = isCapability
    ? matchCapabilityUnit(capabilityUnitsOf(ctx.file.root, sets, sets.constructorNodes), loc.symbol, loc.startLine, loc.endLine)
    : null;
  return { located, candidate, fileRoot: ctx.file.root, sets, file, anchorKind, structuralClass, capabilityClass, capabilityUnit };
}

/* ────────────────────────────────────────────────────────────────────────
 * 5. Los checks — cada uno chico, nombrado, testeable solo (CONTRATO-F6.md §1.3)
 * ──────────────────────────────────────────────────────────────────────── */

type DCheck = Check<DecoratorProblem, CodeGraph | null>;

const REQUIRED_ACCUMULATOR: DCheck = {
  id: "acumulador-tres-capas",
  describe: "Existe un acumulador (variable o campo propio) reasignado bajo ≥3 guardas de nivel superior en el cuerpo de la función",
  run(p) {
    if (isStructuralAnchor(p)) {
      return { holds: true, evidence: "ancla ESTRUCTURAL (large-class/refused-bequest): este check de acumulador no aplica — ver `cadena-de-envoltura-presente`, que exige delegación en su lugar." };
    }
    if (isDelegationAnchor(p)) {
      return { holds: true, evidence: "ancla `homonymous-delegation`: este check de acumulador no aplica — ver `reenvio-homonimo-en-el-ancla`, que exige delegación confirmada en su lugar." };
    }
    if (isCapabilityAnchor(p)) {
      return {
        holds: true,
        evidence: "ancla `optional-behavior-flags`: este check de acumulador no aplica — ver `capacidades-opcionales-en-el-ancla`, que re-verifica las capacidades opcionales en su lugar.",
      };
    }
    if (!p.located) {
      return { holds: false, evidence: "no se pudo ubicar en un árbol vivo la función del hallazgo (ctx.file ausente en esta corrida, o ninguna función del archivo contiene el rango reportado)" };
    }
    if (!p.candidate) {
      return { holds: false, evidence: "no se encontró ninguna variable/campo reasignado bajo una guarda condicional de nivel superior en el cuerpo de la función" };
    }
    if (p.candidate.layers.length < 3) {
      return { holds: false, evidence: `\`${p.candidate.target}\` sólo tiene ${p.candidate.layers.length} capa(s) condicional(es) — hacen falta al menos 3` };
    }
    return { holds: true, evidence: `\`${p.candidate.target}\` acumula ${p.candidate.layers.length} capas condicionales: ${p.candidate.layers.map((l) => l.conditionText).join(", ")}` };
  },
};

const REQUIRED_INDEPENDENT: DCheck = {
  id: "condiciones-independientes",
  describe:
    "Las condiciones de esas capas son independientes entre sí — si todas testearan la MISMA variable serían ramas de un único discriminante (Strategy/State), no capas ortogonales de Decorator",
  run(p) {
    if (isStructuralAnchor(p)) {
      return { holds: true, evidence: "ancla ESTRUCTURAL: este check no aplica (no hay acumulador que evaluar en este camino de entrada)." };
    }
    if (isDelegationAnchor(p)) {
      return { holds: true, evidence: "ancla `homonymous-delegation`: este check no aplica (no hay acumulador que evaluar en este camino de entrada)." };
    }
    if (isCapabilityAnchor(p)) {
      return { holds: true, evidence: "ancla `optional-behavior-flags`: este check no aplica (no hay acumulador que evaluar en este camino de entrada)." };
    }
    if (!p.candidate || p.candidate.layers.length < 3) {
      return { holds: false, evidence: "no aplica: el check anterior (acumulador de ≥3 capas) ya falló" };
    }
    const distinct = new Set(p.candidate.layers.map((l) => l.conditionText));
    const need = Math.min(3, p.candidate.layers.length);
    if (distinct.size < need) {
      return {
        holds: false,
        evidence: `las ${p.candidate.layers.length} capas comparten condición (sólo ${distinct.size} distinta(s) de las ${need} necesarias) — son ramas de un único discriminante, típico de Strategy/State, no capas ortogonales`,
      };
    }
    return { holds: true, evidence: `${distinct.size} condiciones distintas entre las ${p.candidate.layers.length} capas: ${[...distinct].join(", ")}` };
  },
};

/**
 * El REQUIRED de las anclas ESTRUCTURALES (`large-class`/`refused-bequest`):
 * sin acumulador que exigir, lo mínimo para ser candidata es que la clase
 * YA muestre delegación homónima (nivel != "none") — si no hay ninguna
 * forma de envoltura, esta ancla no tiene nada de Decorator que reportar
 * (evita que CUALQUIER clase grande o con herencia anulada, sin relación
 * con Decorator, dispare una hipótesis vacía). Para las anclas de OLOR
 * (las 4 de siempre), este check es un no-op: ya lo deciden
 * `acumulador-tres-capas`/`condiciones-independientes`.
 */
const REQUIRED_WRAPPING_STRUCTURE: DCheck = {
  id: "cadena-de-envoltura-presente",
  describe:
    "Ancla ESTRUCTURAL (large-class/refused-bequest, sin acumulador de banderas): la clase debe reenviar homónimamente (mismo nombre en quien reenvía y en el reenviado) a un colaborador propio — si no hay ninguna forma de envoltura, no hay nada de Decorator que reportar desde este ancla",
  run(p) {
    if (!isStructuralAnchor(p)) {
      return { holds: true, evidence: "ancla de olor (flag-accumulator y relacionadas): este check no aplica — ya lo cubren `acumulador-tres-capas`/`condiciones-independientes`." };
    }
    if (!p.structuralClass || !p.sets) {
      return {
        holds: false,
        evidence: "ancla estructural, pero el rango del hallazgo no coincide con ningún nodo de clase en el árbol vivo (ctx.file ausente en esta corrida, o el hallazgo no anota una clase resoluble).",
      };
    }
    const level = classDelegationLevel(p.structuralClass.node, p.sets, new Set(SELF_WORDS), p.fileRoot).level;
    return level !== "none"
      ? { holds: true, evidence: `\`${p.structuralClass.name}\` ya reenvía homónimamente a un colaborador propio (nivel: ${level}) — hay forma de envoltura que evaluar.` }
      : { holds: false, evidence: `ningún método de \`${p.structuralClass.name}\` reenvía homónimamente a un colaborador propio — nada de Decorator que reportar desde esta ancla estructural.` };
  },
};

/**
 * El REQUIRED del ancla `homonymous-delegation` (Ola 11a, P2): el detector ya
 * confirmó la forma cruda por texto (ver su docstring), pero el REQUIRED
 * vuelve a confirmarla contra el ÁRBOL VIVO de esta corrida (mismo criterio
 * de no confiar ciegamente en el detector que ya aplica
 * `REQUIRED_WRAPPING_STRUCTURE` arriba) — usando la MISMA función de nivel
 * que `appliedState` va a usar después (`classDelegationLevel`/
 * `goDelegationLevel`/`ownFunctionalDelegationLevel`, según la unidad dueña),
 * así que un ancla sin confirmación real no llega a producir una hipótesis
 * vacía.
 */
const REQUIRED_DELEGATION_PRESENT: DCheck = {
  id: "reenvio-homonimo-en-el-ancla",
  describe:
    "Ancla `homonymous-delegation`: la unidad dueña (clase, struct Go por receptor, o función de orden superior) debe mostrar reenvío homónimo confirmado por árbol vivo — si el árbol vivo de esta corrida ya no lo confirma, no hay nada de Decorator que reportar desde este ancla",
  run(p) {
    if (!isDelegationAnchor(p)) {
      return { holds: true, evidence: "ancla distinta de `homonymous-delegation`: este check no aplica." };
    }
    if (!p.located || !p.fileRoot || !p.sets) {
      return {
        holds: false,
        evidence: "no se pudo ubicar en un árbol vivo la unidad del hallazgo (ctx.file ausente en esta corrida, o ninguna función del archivo contiene el rango reportado).",
      };
    }
    const goRecv = goReceiverOf(p.located.fn.node);
    const level = p.located.cls
      ? classDelegationLevel(p.located.cls.node, p.sets, new Set(SELF_WORDS), p.fileRoot).level
      : goRecv
        ? goDelegationLevel(p.fileRoot, p.sets, goRecv.typeName).level
        : ownFunctionalDelegationLevel(p.located.fn.node, p.sets).level;
    return level !== "none"
      ? { holds: true, evidence: `nivel confirmado por árbol vivo: ${level}.` }
      : { holds: false, evidence: "el árbol vivo de esta corrida no confirma ningún reenvío homónimo para esta unidad — nada de Decorator que reportar desde este ancla." };
  },
};

/**
 * El REQUIRED del ancla de FUERZA `optional-behavior-flags` (Ola AD, AD3).
 *
 * RE-DERIVA las capacidades opcionales del ÁRBOL VIVO de esta corrida
 * llamando al MISMO núcleo que el detector usa (`capabilityUnitsOf`), y
 * vuelve a exigir los dos pisos — nunca lee el conteo que el hallazgo trae
 * escrito. Es el mismo criterio de "no confiar ciegamente en el detector" que
 * `REQUIRED_WRAPPING_STRUCTURE` y `REQUIRED_DELEGATION_PRESENT` ya aplican, y
 * la misma dirección de importación que `hypotheses/composite.ts` usa contra
 * `detect/intra-file/self-referential-member.ts`.
 *
 * *** LO QUE ESTE CHECK NO HACE, Y ES DELIBERADO: no mira si la envoltura ya
 * está. *** Ésa es la pregunta de la RESOLUCIÓN y la contesta `appliedState`,
 * que es lo que permite que este camino termine en `ausente` — el estado que
 * el ancla vieja no puede alcanzar.
 */
const REQUIRED_OPTIONAL_CAPABILITIES: DCheck = {
  id: "capacidades-opcionales-en-el-ancla",
  describe:
    "Ancla `optional-behavior-flags`: la unidad dueña debe seguir teniendo, en el árbol vivo de esta corrida, al menos 2 capacidades opcionales elegidas desde afuera (campo propio asignado desde un parámetro) y consultadas como guarda de presencia en al menos 2 miembros distintos que no son el constructor",
  run(p) {
    if (!isCapabilityAnchor(p)) {
      return { holds: true, evidence: "ancla distinta de `optional-behavior-flags`: este check no aplica." };
    }
    if (!p.fileRoot || !p.sets) {
      return { holds: false, evidence: "no hay árbol vivo en esta corrida para re-verificar las capacidades opcionales de la unidad." };
    }
    const unit = p.capabilityUnit;
    if (!unit) {
      return { holds: false, evidence: "el árbol vivo de esta corrida ya no ubica ninguna unidad-tipo con capacidades opcionales en el rango del hallazgo." };
    }
    if (unit.capabilities.length < MIN_CAPABILITIES) {
      return {
        holds: false,
        evidence: `\`${unit.name}\` tiene ${unit.capabilities.length} capacidad(es) opcional(es) en el árbol vivo — hacen falta ${MIN_CAPABILITIES}: con una sola, la respuesta barata es una subclase o un método extraído y el patrón no paga.`,
      };
    }
    if (unit.embellishedMembers.length < MIN_EMBELLISHED_MEMBERS) {
      return {
        holds: false,
        evidence: `las capacidades de \`${unit.name}\` embellecen ${unit.embellishedMembers.length} miembro(s) — hacen falta ${MIN_EMBELLISHED_MEMBERS} para que el embellecimiento atraviese el comportamiento y no sea un condicional local.`,
      };
    }
    return {
      holds: true,
      evidence:
        `\`${unit.name}\` lleva ${unit.capabilities.length} capacidades opcionales elegidas desde afuera ` +
        `(${unit.capabilities.map((c) => `\`${c.field}\``).join(", ")}), consultadas en ${unit.embellishedMembers.length} de sus ${unit.memberCount} miembros.`,
    };
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * OLA AK, FRENTE AK6 — **UNA CAPACIDAD ES UN INTERRUPTOR, NO UN DATO.**
 *
 * QUÉ SITUACIÓN RECONOCE Y CUÁL NO (la intención, en vocabulario de
 * gramática): un campo cuenta como CAPACIDAD OPCIONAL sólo si, dentro de la
 * unidad-tipo dueña, **no aparece nunca fuera de la CONDICIÓN de una guarda**.
 * No reconoce un campo que además viaja como VALOR en cualquier otro lugar de
 * la unidad — pasado como argumento, devuelto, copiado a otra unidad,
 * compuesto en una expresión, enumerado para serializar.
 *
 * POR QUÉ ES LA FRONTERA DEL PATRÓN, y no un umbral de gusto: Decorator saca
 * el comportamiento de la clase y lo pone en un envoltorio. Eso sólo es
 * posible si el ÚNICO papel del campo en la unidad es decidir si el paso extra
 * corre — entonces el envoltorio se lleva el paso y el campo desaparece. Si el
 * campo además se lee como valor, lo que lleva es INFORMACIÓN que la unidad
 * usa, y el envoltorio no se la puede llevar: quien lee el valor la sigue
 * necesitando, así que la bandera se queda y no hay nada que envolver. Es la
 * MISMA frontera que la condición (2) del detector ya traza en el sitio de
 * consulta (*"una comparación contra un valor no es una capa opcional: es un
 * discriminante con alternativas, y eso es State/Strategy"*), llevada del
 * sitio al CAMPO entero.
 *
 * NINGÚN NÚMERO NUEVO: el piso sigue siendo `MIN_CAPABILITIES`, el mismo que
 * el detector y `REQUIRED_OPTIONAL_CAPABILITIES` ya aplican. Lo único que
 * cambia es QUÉ se cuenta como capacidad.
 *
 * SOMBREADO, la misma regla que el detector: un parámetro con el mismo nombre
 * que un campo lo tapa DENTRO de ese miembro. Sin esto, el propio parámetro
 * del constructor (`FileChannelWriter(…, boolean forceOnFlush, …)` en Java,
 * donde el campo se nombra desnudo) contaría como una lectura del campo y
 * silenciaría exactamente los casos correctos.
 *
 * LO AMBIGUO VIAJA COMO AMBIGUO: sin nodo de clase resoluble en el árbol vivo
 * (el caso de Go, cuya unidad-tipo la define el RECEPTOR y no un nodo que la
 * contenga), este check **no rechaza**: devuelve `holds: true` diciendo que no
 * pudo mirar. Un check que no puede evaluarse en una gramática no debe
 * convertirse en una compuerta imposible para esa gramática.
 * ──────────────────────────────────────────────────────────────────────── */

/** Copia declarada de `detect/intra-file/optional-behavior-flags.ts` (misma
 *  razón que el resto de las primitivas duplicadas de este módulo: `detect/*`
 *  y `hypotheses/*` no comparten un módulo de primitivas). */
const FIELD_DECL_NODE_TYPE = /(^|_)(field|property)_(declaration|definition)$/;

function declaredFieldNamesDec(classNode: AstNode): Set<string> {
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

/** Las tres vías de "campo del propio objeto" — idéntica a
 *  `optional-behavior-flags.ts#selfFieldNameOf` y a `temporary-field.ts`. */
function selfFieldNameOfDec(node: AstNode, selfNames: ReadonlySet<string>, declaredFields: ReadonlySet<string>): string | null {
  if (node.type === RUBY_IVAR_TYPE) return node.text;
  const obj = objectOf(node);
  if (obj && selfNames.has(obj.text)) return memberNameOf(node);
  if (node.type === "identifier" && declaredFields.has(node.text)) return node.text;
  return null;
}

/** Los tipos "if-like", DERIVADOS de los conjuntos de `code-grammar.ts` y
 *  nunca escritos a mano — misma derivación que el detector
 *  (`chainNodes ∩ nestingNodes − switchContainerNodes`). */
function ifLikeTypesDec(sets: DerivedNodeSets): Set<string> {
  const out = new Set<string>();
  for (const t of sets.chainNodes) if (sets.nestingNodes.has(t) && !sets.switchContainerNodes.has(t)) out.add(t);
  return out;
}

/** Los nodos de tree-sitter no tienen identidad estable entre llamadas a
 *  `child(i)`, así que "¿este hijo ES el campo `condition`?" se pregunta por
 *  SPAN, nunca por `===`. */
function spanKeyDec(n: AstNode): string {
  return `${n.startPosition.row}:${n.startPosition.column}:${n.endPosition.row}:${n.endPosition.column}:${n.type}`;
}

/**
 * OLA AP, FRENTE AP3 — LOS CAMPOS QUE UNA GUARDA MENCIONA EN SU CONDICIÓN.
 *
 * QUÉ INTENCIÓN VERIFICA: *"¿de qué campo habla esta guarda?"*. Se pregunta con
 * la MISMA función de campo propio que usa el walk (`selfFieldNameOfDec`) sobre
 * el subárbol de la condición — nunca comparando texto crudo, y sin una lista
 * de nombres en ningún lado.
 */
function capabilityFieldsInCondition(condNode: AstNode, sets: DerivedNodeSets, selfNames: ReadonlySet<string>, visible: ReadonlySet<string>, capFields: ReadonlySet<string>): Set<string> {
  const found = new Set<string>();
  const walk = (n: AstNode): void => {
    const f = selfFieldNameOfDec(n, selfNames, visible);
    if (f && capFields.has(f)) found.add(f);
    for (const c of namedChildren(n)) walk(c);
  };
  walk(condNode);
  return found;
}

/**
 * Los campos de `capFields` que aparecen, dentro de `classNode`, en algún
 * lugar que NO es la condición de una guarda ni el lado izquierdo de una
 * asignación ni la declaración del propio campo. Ésos son los que llevan un
 * DATO además de un interruptor.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OLA AP (FRENTE AP3) — **EL PASO QUE LA GUARDA GOBIERNA NO ES UNA LECTURA
 * COMO VALOR, Y HASTA HOY LO ERA: ESO HACÍA IMPOSIBLE, POR CONSTRUCCIÓN, QUE
 * UN COLABORADOR OPCIONAL FUERA UNA CAPACIDAD.**
 * ═══════════════════════════════════════════════════════════════════════
 *
 * EL DEFECTO, en una frase: *una capacidad que es un COLABORADOR OPCIONAL tiene
 * que USARSE dentro del paso que su propia guarda gobierna, y ese uso está
 * FUERA de la `condition` — así que todo colaborador opcional quedaba
 * descalificado por construcción.* Y Decorator resuelve exactamente eso: un
 * comportamiento que a veces corre y a veces no, elegido desde afuera. Si la
 * capacidad es un `bool` desnudo la guarda no lee nada más; si es un
 * colaborador —un hook, un logger, una caché—, la guarda TIENE que leerlo.
 *
 * CASO TESTIGO, verificado a mano ANTES de escribir esta rama
 * (`corpus/nest/packages/platform-fastify/adapters/fastify-adapter.ts`):
 *
 *     private onRequestHook?: (…) => void;        // :148  declaración → ya excluida
 *     if (this.onRequestHook) {                    // :268  condición   → ya excluida
 *       this.onRequestHook(request, reply, done);  // :269  EL PASO     → contaba como "valor"
 *     }
 *     this.onRequestHook = hook;                   // :291  asignación  → ya excluida
 *
 * Y ES LO CONTRARIO DE LO QUE EL PROPIO DOCSTRING DE AK6 DICE QUE QUIERE
 * VERIFICAR: *"el envoltorio se lleva el paso y el campo desaparece"*. Si el
 * paso que el envoltorio se lleva ES el `if (this.hook) { this.hook(...) }`
 * entero, la lectura de `:269` **se va con el paso**. El chequeo no podía
 * distinguir "adentro del paso que la guarda gobierna" de "en cualquier otro
 * lado de la unidad", y por eso mataba el caso canónico.
 *
 * LA REGLA, y sus límites declarados:
 *   · Gobierna el nodo if-like **cuya condición MENCIONA A ESE MISMO CAMPO**.
 *     `if (this.a) { use(this.b) }` **no** protege a `b`: `b` sigue siendo un
 *     dato que la unidad transporta.
 *   · Se toma el nodo if-like ENTERO (consecuencia y alternativa), no sólo la
 *     consecuencia: pedir el nombre de campo `consequence` sería una suposición
 *     de gramática POR LENGUAJE, y este proyecto lo prohíbe. Es la lectura más
 *     generosa de las dos y va declarada como tal, no escondida.
 *   · NINGÚN NÚMERO NUEVO: `MIN_CAPABILITIES` sigue siendo el piso, el mismo
 *     que el detector y `REQUIRED_OPTIONAL_CAPABILITIES` aplican.
 *   · **ESTRICTAMENTE ADITIVO:** esta rama sólo puede QUITAR elementos de
 *     `readAsValue`, así que `switches.length` sólo puede CRECER y el
 *     `required` sólo puede PASAR más. Un `required` que pasa más no puede
 *     matar ninguna hipótesis que ya existía.
 *   · Go queda igual que hoy: sin nodo de clase resoluble el check ya devuelve
 *     `holds: true` ("lo ambiguo viaja como ambiguo"), y esta rama no lo toca.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * **EL RESULTADO, Y POR ESO LA RAMA ESTÁ APAGADA: `AP3_PASO_GOBERNADO = false`.**
 * ═══════════════════════════════════════════════════════════════════════
 *
 * La rama se CONSTRUYÓ, se MIDIÓ sobre toda su población y se DESCONECTÓ, que es
 * lo que la compuerta de aterrizaje de la Ola AP pide cuando lo que emite no
 * acierta. **Medido con la rama prendida, contra el mismo árbol congelado y con
 * SÓLO este archivo distinto (`scratchpad-ap3/src0` vs `srcB`, `diff -r` = un
 * archivo): emite EXACTAMENTE 5 recomendaciones nuevas, las 5 `ausente`, las 5
 * en bibliotecas (`nest` 1 · `sqlalchemy` 4), 0 en aplicaciones, y no pierde ni
 * cambia ninguna de las que ya existían (0 hallazgos con hipótesis distinta
 * fuera de esos 5, sobre los 9 repos que contienen toda la población del ancla
 * más un control).** Las 5 las juzgué abriendo el archivo real: **0 VERDADERAS
 * de 5** (Wilson 95 % [0,0 %, 43,4 %]).
 *
 * POR QUÉ FALLA, y es el límite honesto de la regla: no puede distinguir *"la
 * guarda protege el PASO que el envoltorio se lleva"* de *"la guarda es un
 * chequeo de presencia y el cuerpo USA EL VALOR"*. Los cuatro de `sqlalchemy`
 * son de la segunda forma —`if self.params: params = self.params`
 * (`testing/assertsql.py:214`), `if self.callable: return self.callable()`
 * (`sql/elements.py:2185`), `if self.comparator_factory: comp =
 * self.comparator_factory(...)` (`orm/descriptor_props.py:1077`), `if
 * self.inherits: … self.inherits.class_ …` (`orm/mapper.py:1150`)—: campos que
 * la unidad TRANSPORTA, que es exactamente lo que `readAsValue` existe para
 * atrapar. Y el quinto, el caso testigo (`nest`
 * `platform-fastify/adapters/fastify-adapter.ts:268`), es un par de hooks
 * opcionales de UNA SOLA RANURA con un `else { done(); }` de respaldo: un
 * respaldo por defecto, no una capa apilable elegida en tiempo de ejecución.
 *
 * PARA LA PRÓXIMA OLA, para que no lo pague dos veces: la lista de las 5, con
 * repo/archivo/línea/símbolo y el porqué de cada juicio, está en
 * `claude-kanban-docs/ola-ap/veredictos/AP3.json` y en `ola-ap/informes/AP3.md`.
 * **Prenderla es UNA LÍNEA** (`AP3_PASO_GOBERNADO = true`). Lo que habría que
 * agregarle antes es la distinción que le falta: exigir que la lectura guardada
 * esté en POSICIÓN DE LLAMADA y que su resultado NO se use. De los 5, el único
 * que sobrevive a esa condición es el caso testigo — y ese ya está juzgado falso.
 */
const AP3_PASO_GOBERNADO: boolean = false;

function capabilityFieldsReadAsValue(classNode: AstNode, sets: DerivedNodeSets, capFields: ReadonlySet<string>): Set<string> {
  const declared = declaredFieldNamesDec(classNode);
  const ifLike = ifLikeTypesDec(sets);
  const selfNames = new Set(SELF_WORDS);
  const readAsValue = new Set<string>();
  const SIN_GUARDA: ReadonlySet<string> = new Set<string>();

  const walk = (node: AstNode, inCondition: boolean, visibleFields: ReadonlySet<string>, isWriteTarget: boolean, governed: ReadonlySet<string>): void => {
    let visible = visibleFields;
    if (sets.functionNodes.has(node.type)) {
      const params = functionParamNames(node);
      visible = new Set([...declared].filter((f) => !params.has(f)));
    }
    if (FIELD_DECL_NODE_TYPE.test(node.type)) return; // declarar el campo no es leerlo.
    const field = selfFieldNameOfDec(node, selfNames, visible);
    if (field && capFields.has(field) && !isWriteTarget && !inCondition && !governed.has(field)) readAsValue.add(field);

    const condNode = ifLike.has(node.type) ? (node.childForFieldName("condition") as AstNode | null) : null;
    const condKey = condNode ? spanKeyDec(condNode) : null;
    // OLA AP (AP3) — el paso que ESTA guarda gobierna. CONSTRUIDA, MEDIDA Y
    // DESCONECTADA (`AP3_PASO_GOBERNADO = false`): 5 recomendaciones emitidas,
    // 0 verdaderas. Ver el bloque de arriba.
    const guarded = AP3_PASO_GOBERNADO && condNode ? capabilityFieldsInCondition(condNode, sets, selfNames, visible, capFields) : null;
    const heredado: ReadonlySet<string> = guarded && guarded.size > 0 ? new Set([...governed, ...guarded]) : governed;
    const leftNode = isAssignmentLike(node) ? (node.childForFieldName("left") as AstNode | null) : null;
    const leftKey = leftNode ? spanKeyDec(leftNode) : null;
    for (const child of namedChildren(node)) {
      const key = spanKeyDec(child);
      walk(child, inCondition || (condKey !== null && key === condKey), visible, isWriteTarget || (leftKey !== null && key === leftKey), heredado);
    }
  };
  walk(classNode, false, declared, false, SIN_GUARDA);
  return readAsValue;
}

const REQUIRED_CAPABILITY_IS_SWITCH_NOT_DATA: DCheck = {
  id: "capacidad-es-interruptor-no-dato",
  describe:
    "Ancla `optional-behavior-flags`: al menos 2 de las capacidades de la unidad tienen que ser INTERRUPTORES y no DATOS — el campo no puede aparecer, dentro de la unidad dueña, fuera de la condición de una guarda (si además se lee como valor, el envoltorio no se lo puede llevar y no hay nada que envolver)",
  run(p) {
    if (!isCapabilityAnchor(p)) {
      return { holds: true, evidence: "ancla distinta de `optional-behavior-flags`: este check no aplica." };
    }
    const unit = p.capabilityUnit;
    if (!unit || !p.sets) {
      return { holds: true, evidence: "no aplica: el check `capacidades-opcionales-en-el-ancla` ya decide este caso." };
    }
    if (!p.capabilityClass) {
      // LO AMBIGUO VIAJA COMO AMBIGUO — ver el docstring de arriba.
      return { holds: true, evidence: "la unidad-tipo de esta gramática no es un nodo de clase que contenga sus miembros (Go: la define el receptor), así que este check no pudo mirarla: viaja como ambiguo, no se rechaza." };
    }
    const capFields = new Set(unit.capabilities.map((c) => c.field));
    const asValue = capabilityFieldsReadAsValue(p.capabilityClass.node, p.sets, capFields);
    const switches = [...capFields].filter((f) => !asValue.has(f));
    if (switches.length < MIN_CAPABILITIES) {
      return {
        holds: false,
        evidence:
          `de las ${capFields.size} capacidades de \`${unit.name}\`, sólo ${switches.length} son un INTERRUPTOR puro` +
          (asValue.size > 0 ? ` — ${[...asValue].map((f) => `\`${f}\``).join(", ")} se lee(n) además como VALOR fuera de toda condición` : "") +
          `. Hacen falta ${MIN_CAPABILITIES}: un campo que la unidad usa como dato no se lo puede llevar un envoltorio.`,
      };
    }
    return {
      holds: true,
      evidence: `${switches.length} capacidades de \`${unit.name}\` (${switches.map((f) => `\`${f}\``).join(", ")}) sólo aparecen en la condición de una guarda: son interruptores de comportamiento, no datos que la unidad transporte.`,
    };
  },
};

const DISC_FOUR_LAYERS: DCheck = {
  id: "cuatro-o-mas-capas",
  describe: "≥4 capas opcionales (más que el mínimo canónico de 3)",
  run(p) {
    const n = p.candidate?.layers.length ?? 0;
    return n >= 4 ? { holds: true, evidence: `${n} capas` } : { holds: false, evidence: `sólo ${n} capa(s)` };
  },
};

const DISC_DISTINCT_RECEIVERS: DCheck = {
  id: "receptores-distintos",
  describe: "Las condiciones involucran objetos/receptores DISTINTOS, no sólo propiedades distintas de un mismo objeto — capacidades ortogonales de verdad",
  run(p) {
    if (!p.candidate) return { holds: false, evidence: "no hay candidato" };
    const receivers = new Set(p.candidate.layers.map((l) => l.receiverRoot));
    return receivers.size >= 2
      ? { holds: true, evidence: `${receivers.size} receptores distintos: ${[...receivers].join(", ")}` }
      : { holds: false, evidence: `un único receptor (\`${[...receivers][0] ?? "?"}\`) en todas las capas — podrían ser flags del mismo objeto, no capacidades de fuentes distintas` };
  },
};

const DISC_OWN_FIELD: DCheck = {
  id: "acumulador-es-campo-propio",
  describe: "El acumulador es un campo propio (persiste entre llamadas), no una variable local de un solo cálculo",
  run(p) {
    if (!p.candidate) return { holds: false, evidence: "no hay candidato" };
    return p.candidate.isOwnField ? { holds: true, evidence: `\`${p.candidate.target}\` es un campo propio` } : { holds: false, evidence: `\`${p.candidate.target}\` es una variable local` };
  },
};

function appliedState(p: DecoratorProblem, graph: CodeGraph | null): AppliedStateResult {
  if (isStructuralAnchor(p)) {
    // Ancla ESTRUCTURAL: `REQUIRED_WRAPPING_STRUCTURE` ya garantizó
    // `p.structuralClass !== null` y nivel != "none" con estos MISMOS
    // argumentos (función pura) — así que "ausente" es inalcanzable acá en
    // la práctica; se deja como respaldo defensivo, no como camino esperado.
    if (!p.structuralClass || !p.sets) {
      return {
        state: "ausente",
        checks: [{ label: "La unidad dueña ya compone con otra instancia del mismo protocolo", passed: false, why: "inalcanzable si el required pasó: sin clase resoluble para evaluar", role: "applied" }],
      };
    }
    const result = classDelegationLevel(p.structuralClass.node, p.sets, new Set(SELF_WORDS), p.fileRoot);
    const override = graphOverride(graph, p.file, p.structuralClass.name);
    // OLA U (N4): la terna del grafo REFUERZA, no reemplaza. Si la vía AST
    // ya concluyó que no hay comportamiento agregado (`none` = Middle-man,
    // ver `levelFromSignal`), el grafo no puede promover eso a "Decorator
    // aplicado": la terna confirma reenvío homónimo con protocolo común, que
    // es justamente lo que Middle-man y Decorator COMPARTEN.
    const finalLevel: CompositionLevel = override && result.level !== "none" ? "full" : result.level;
    const evidence = override ? `${result.evidence}. Además, ${override.evidence}` : result.evidence;
    const state = finalLevel === "full" ? "ya-aplicado" : finalLevel === "partial" ? "parcial" : "ausente";
    return {
      state,
      checks: [
        {
          label:
            "La unidad dueña (clase) ya compone con otra instancia del mismo protocolo (reenvío homónimo, y grafo real cuando está disponible) — ancla ESTRUCTURAL (large-class/refused-bequest), sin acumulador de banderas en la misma unidad",
          passed: finalLevel !== "none",
          why: evidence,
          role: "applied",
        },
      ],
    };
  }

  if (isCapabilityAnchor(p)) {
    // *** EL CAMINO QUE FALTABA (Ola AD, AD3). *** Misma pregunta y MISMA
    // función que el ancla vieja —`classDelegationLevel`/`goDelegationLevel`—
    // pero SIN una compuerta previa que haya excluido el `"none"`: acá
    // `"none" → ausente` es alcanzable, y es el caso esperado. Ésa es la
    // condición (5) de la receta de la Ola AC, "resolución verificada": el
    // ancla nombra la fuerza, esta escalera dice si la envoltura ya está.
    if (!p.fileRoot || !p.sets) {
      return {
        state: "ausente",
        checks: [{ label: "La unidad dueña ya compone con otra instancia del mismo protocolo", passed: false, why: "no hay árbol vivo para evaluar composición", role: "applied" }],
      };
    }
    const goRecv = p.located ? goReceiverOf(p.located.fn.node) : null;
    const owner = p.capabilityClass ?? p.located?.cls ?? null;
    const result = owner
      ? classDelegationLevel(owner.node, p.sets, new Set(SELF_WORDS), p.fileRoot)
      : goRecv
        ? goDelegationLevel(p.fileRoot, p.sets, goRecv.typeName)
        : { level: "none" as CompositionLevel, evidence: "no se pudo resolver una unidad dueña (ni clase ni receptor Go) para evaluar composición: se reporta como ausente, que es lo que el árbol vivo permite afirmar." };
    const override = graphOverride(graph, p.file, owner?.name ?? goRecv?.typeName ?? null);
    // OLA U (N4): la terna del grafo REFUERZA, no reemplaza — misma regla que
    // los otros dos caminos.
    const finalLevel: CompositionLevel = override && result.level !== "none" ? "full" : result.level;
    const evidence = override ? `${result.evidence}. Además, ${override.evidence}` : result.evidence;
    const state = finalLevel === "full" ? "ya-aplicado" : finalLevel === "partial" ? "parcial" : "ausente";
    return {
      state,
      checks: [
        {
          label:
            "La unidad dueña ya compone con otra instancia del mismo protocolo (reenvío homónimo a un colaborador propio, y grafo real cuando está disponible) — ancla de FUERZA `optional-behavior-flags`: si NO compone, las capacidades opcionales no tienen dónde vivir salvo adentro de la clase, y ése es el `ausente` de Decorator",
          passed: finalLevel !== "none",
          why: evidence,
          role: "applied",
        },
      ],
    };
  }

  if (!p.located || !p.fileRoot || !p.sets) {
    return { state: "ausente", checks: [{ label: "La unidad dueña ya compone con otra instancia del mismo protocolo", passed: false, why: "no hay árbol vivo para evaluar composición", role: "applied" }] };
  }

  const goRecv = goReceiverOf(p.located.fn.node);
  const result = p.located.cls
    ? classDelegationLevel(p.located.cls.node, p.sets, p.located.fn.selfNames, p.fileRoot)
    : goRecv
      ? goDelegationLevel(p.fileRoot, p.sets, goRecv.typeName)
      : isDelegationAnchor(p)
        ? // Ancla `homonymous-delegation`, forma FUNCIONAL (Vue, sin clase ni
          // receptor Go): el ancla ES la envoltura — se mira su PROPIO cuerpo,
          // sin excluirlo (ver el docstring de `ownFunctionalDelegationLevel`).
          ownFunctionalDelegationLevel(p.located.fn.node, p.sets)
        : fileWideDelegationLevel(p.fileRoot, p.sets, p.located.fn.node);

  const ownerName = p.located.cls?.name ?? goRecv?.typeName ?? null;
  const override = graphOverride(graph, p.file, ownerName);
  // OLA U (N4): la terna del grafo REFUERZA, no reemplaza. Si la vía AST
    // ya concluyó que no hay comportamiento agregado (`none` = Middle-man,
    // ver `levelFromSignal`), el grafo no puede promover eso a "Decorator
    // aplicado": la terna confirma reenvío homónimo con protocolo común, que
    // es justamente lo que Middle-man y Decorator COMPARTEN.
    const finalLevel: CompositionLevel = override && result.level !== "none" ? "full" : result.level;
  const evidence = override ? `${result.evidence}. Además, ${override.evidence}` : result.evidence;

  const state = finalLevel === "full" ? "ya-aplicado" : finalLevel === "partial" ? "parcial" : "ausente";
  return {
    state,
    checks: [
      {
        label: "La unidad dueña (clase, struct Go, o archivo en forma funcional) ya compone con otra instancia del mismo protocolo (reenvío homónimo, y grafo real cuando está disponible)",
        passed: finalLevel !== "none",
        why: evidence,
        role: "applied",
      },
    ],
  };
}

/**
 * Ola 11a (P2) — CONSUMO de `ctx.neighborhood` (registro de pendientes, "El
 * vecindario: cableado y verificado en producción, leído por 1 de 17
 * hipótesis" — antes de esta ola, `decorator.ts` no lo leía NUNCA). Las 7
 * anclas de esta hipótesis son intra-function/intra-file, así que la ÚNICA
 * llamada de producción a `build()` pasa SIEMPRE `EMPTY_NEIGHBORHOOD`
 * (`code-analyzer.ts:1611`, dentro de `analyzeFile`) — mismo bloqueo
 * arquitectónico que `strategy.ts` ya documenta y resuelve con `refresh()`
 * (`hypotheses/run.ts#refreshHypotheses`, invocada desde `crossAnalyze`
 * DESPUÉS de construir el `NeighborhoodIndex` real — ver `refresh()` de esta
 * hipótesis, más abajo). El discriminador no necesita nada de `ctx.file`
 * (sólo `problem.file`, que `prepareProblem` siempre puebla desde
 * `finding.locations[0].file`, con o sin árbol vivo) — así que, a diferencia
 * de `strategy.ts`, esta hipótesis no necesita cachear nada en
 * `refreshState`: `refresh()` simplemente reconstruye `DecoratorProblem` con
 * el `ctx` (mejor) que le llega y vuelve a correr la escalera completa de
 * discriminadores.
 */
/**
 * *** POLARIDAD INVERTIDA — Engler et al., SOSP 2001, "Bugs as Deviant
 * Behavior" (ola de precisión posterior a la Ola D, frente Decorator) ***
 * La versión anterior de este discriminador sumaba confianza cuando OTRO
 * archivo del repo mostraba la misma forma de reenvío homónimo — "familia de
 * envolturas repetida, no un caso aislado". Es la polaridad CONTRARIA a la
 * que `builder.ts#noEsConvencionDelRepo` (líneas 317-341) ya usa para el
 * mismo tipo de cuenta: lo FRECUENTE en un repo es CONVENCIÓN (un idiom de
 * framework, repetido a propósito por muchas clases no relacionadas — el
 * caso medido: `update`/`destroy`/`show` reenviando homónimamente a
 * `@recurso` en 19 controladores Rails DISTINTOS, ninguno relacionado con
 * otro), y sólo lo RARO es sospechoso de ser una instancia real y aislada de
 * composición. Sumar confianza por "hay una familia" tiene el efecto
 * contrario al que Engler documenta: premia exactamente el caso que más
 * probablemente es idioma, no Decorator.
 *
 * El techo NO es un número fijo (`builder.ts` usa 5, declarado
 * `[provisional]` ahí mismo): un repo de 50 archivos y uno de 5.000 no
 * deberían compartir el mismo techo absoluto, así que acá se escala por
 * `ctx.repo.files.length` — real sólo en `refresh()` (`ctx.repo` es
 * `{files: [], ...}` en el `build()` de producción, ver la nota de
 * arquitectura del docstring del módulo; con `files.length === 0` el techo
 * cae al piso mínimo, y con `countOfKind === 0` (EMPTY_NEIGHBORHOOD) el
 * check ya devuelve `holds:false` antes de necesitar el techo — mismo
 * default conservador que antes de este cambio).
 *
 * *** LÍMITE DECLARADO: esto es HIGIENE DE CONFIANZA, no la corrección de
 * `state` ***. `build()` en producción ve SIEMPRE `EMPTY_NEIGHBORHOOD` (ver
 * la nota de arquitectura del módulo) y `refresh()` tiene prohibido tocar
 * `state`/`required` (`engine.ts#refreshDiscriminators`) — así que este
 * discriminador NUNCA puede suprimir una hipótesis `ya-aplicado`/`parcial`
 * ya construida, sólo bajarle la confianza cuando SÍ compite (`parcial`) y
 * el vecindario real (`refresh()`) confirma que es un idiom repetido. La
 * corrección real de los 19 falsos Rails (`idioma-framework`) es
 * estructural: `classInjectsField`/`goInjectsField` (arriba), que corren con
 * `ctx.file` — vivo también en el `build()` de producción — y SÍ deciden
 * `state` antes de que este discriminador exista.
 */
const REPO_CONVENTION_FRACTION = 0.02; // [provisional] K2 — ~1 cada 50 archivos del repo antes de leerlo como convención repetida.
const REPO_CONVENTION_FLOOR = 3; // incluso en un repo chico, hasta 3 repeticiones no alcanzan para llamarlo convención.

function repoConventionCeiling(fileCount: number): number {
  return Math.max(REPO_CONVENTION_FLOOR, Math.round(fileCount * REPO_CONVENTION_FRACTION));
}

function otherWrappersInRepoDiscriminator(ctx: HypothesisContext): DCheck {
  return {
    id: "otros-envoltorios-en-el-repo",
    describe:
      "El repo NO muestra otras envolturas de esta forma más allá de un techo escalado por tamaño del repo (Engler et al. SOSP 2001: lo frecuente es convención/idioma de framework, sólo lo raro es evidencia de una composición real y aislada)",
    run(p) {
      const count = ctx.neighborhood.countOfKind(DELEGATION_ANCHOR_KIND);
      if (count === 0) {
        return {
          holds: false,
          evidence: "ningún otro archivo visible por ctx.neighborhood.findingsOfKind('homonymous-delegation') muestra la misma forma de envoltura (o el vecindario está vacío en esta pasada) — sin vecindario real no se puede confirmar rareza.",
        };
      }
      const ceiling = repoConventionCeiling(ctx.repo.files.length);
      const holds = count <= ceiling;
      return {
        holds,
        evidence: holds
          ? `sólo ${count} caso(s) más de "homonymous-delegation" en todo el repo (techo ${ceiling} para ${ctx.repo.files.length} archivos): no es una convención extendida, este caso se destaca como composición aislada.`
          : `${count} caso(s) más de "homonymous-delegation" en el repo (techo ${ceiling} para ${ctx.repo.files.length} archivos): con tantos casos repetidos, es más compatible con una convención del propio repo/framework (Engler et al.: lo frecuente es convención) que con una familia genuina de envolturas — señal más débil, no se suma.`,
      };
    },
  };
}

function buildSpec(ctx: HypothesisContext): HypothesisSpec<DecoratorProblem, CodeGraph | null> {
  return {
    pattern: "Decorator",
    // Provisional (K2 lo re-deriva contra el corpus externo): la regla vieja
    // siempre emitió "media" a secas — este techo no la regresiona, y la
    // escalera de discriminadores no puede superarlo hasta que se mida.
    ceiling: "media",
    needs: [],
    required: [REQUIRED_ACCUMULATOR, REQUIRED_INDEPENDENT, REQUIRED_WRAPPING_STRUCTURE, REQUIRED_DELEGATION_PRESENT, REQUIRED_OPTIONAL_CAPABILITIES, REQUIRED_CAPABILITY_IS_SWITCH_NOT_DATA],
    discriminators: [DISC_FOUR_LAYERS, DISC_DISTINCT_RECEIVERS, DISC_OWN_FIELD, otherWrappersInRepoDiscriminator(ctx)],
    appliedState,
    toConfirm: [
      "Confirmar que las capas se combinan en cualquier orden/combinación real hoy o a futuro (si son sólo 2-3 combinaciones fijas, un objeto por combinación puede ser más simple que Decorator).",
      "Confirmar que las banderas son CAPACIDADES ORTOGONALES independientes, no los pasos de UNA fórmula de negocio única (descuentos/impuestos acumulados) — el falso positivo más probable.",
      "Sin grafo, no se verificó la ARIDAD del miembro compartido ni que el colaborador declare la MISMA interfaz (CONTRATO-F10 §0.4 completa) — sólo que reenvía homónimamente; confirmar manualmente si el colaborador es externo.",
    ],
    source: SOURCE_DECORATOR,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * 6. El HypothesisBuilder — el único punto de entrada que produce un
 *    `PatternHypothesis`, y sólo colgado de un `Finding` ya detectado.
 * ──────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────
 * LA TRAZA DEL EMBUDO DE DECORATOR — OLA AP, frente AP3.
 *
 * Copia deliberada, en forma y en default, de `state.ts#startStateTrace` (Ola
 * AI) y `facade.ts#startFacadeTrace` (Ola AN). `null` —el default de
 * producción— ⇒ COSTO CERO: ni una rama de más por hallazgo, ni un check de
 * más corrido.
 *
 * QUÉ CONTESTA, y por qué el volcado de producción no puede contestarlo: el
 * volcado sólo publica lo que SOBREVIVE (`build()` devuelve `null` cuando un
 * `required` no se sostiene, y con él se pierde CUÁL no se sostuvo). Medido
 * sobre el volcado del 26-08, `homonymous-delegation` entrega **548 hallazgos
 * en bibliotecas y 367 en aplicaciones** y sólo **101 y 16** llegan a tener
 * una hipótesis de Decorator: el resto muere ANTES de que `appliedState`
 * opine, y ningún volcado dice en cuál check. Esta traza lo dice, por hallazgo
 * y por pasada.
 * ──────────────────────────────────────────────────────────────────────── */
export interface DecoratorTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly endLine: number;
  readonly symbol: string;
  readonly lang: string;
  /** `true` en la pasada con grafo del repo; `false` en la primera (dentro de `analyzeFile`). */
  readonly withGraph: boolean;
  /** ¿había árbol vivo? — el eje que separa "no se pudo confirmar" de "se confirmó que no". */
  readonly withFile: boolean;
  /** ¿`locateFunctionAndClass` ubicó la función del rango del hallazgo? */
  readonly located: boolean;
  /** Nombre de la clase envolvente ubicada, o `null` (gramática sin clase, o rango fuera de toda clase). */
  readonly ownerClass: string | null;
  /** Nombre del TIPO del receptor Go, o `null`. */
  readonly goReceiverType: string | null;
  /** La vía por la que se resolvió el nivel de composición. */
  readonly via: string;
  /** El nivel que la vía de arriba devuelve: `full` | `partial` | `none`. */
  readonly level: string;
  readonly checks: readonly { readonly id: string; readonly holds: boolean; readonly why: string }[];
  /** El primero de `required` que NO se sostiene, o `null` si todos se sostienen. */
  readonly diesAt: string | null;
  /** El estado que `appliedState` decide — se registra TAMBIÉN cuando un `required` mata la hipótesis, porque es el dato que dice qué se está perdiendo. */
  readonly appliedState: string;
  readonly emitted: boolean;
}

let decoratorTrace: DecoratorTraceEntry[] | null = null;

export function startDecoratorTrace(): void {
  decoratorTrace = [];
}

export function takeDecoratorTrace(): readonly DecoratorTraceEntry[] {
  const t = decoratorTrace ?? [];
  decoratorTrace = null;
  return t;
}

/** La vía y el nivel que `appliedState` usaría para esta unidad — se re-deriva
 *  con las MISMAS funciones puras, sólo para la traza. */
function traceDelegation(p: DecoratorProblem): { via: string; level: string } {
  if (!p.fileRoot || !p.sets) return { via: "sin-arbol", level: "none" };
  if (isStructuralAnchor(p)) {
    if (!p.structuralClass) return { via: "sin-clase-estructural", level: "none" };
    return { via: "clase", level: classDelegationLevel(p.structuralClass.node, p.sets, new Set(SELF_WORDS), p.fileRoot).level };
  }
  const goRecv = p.located ? goReceiverOf(p.located.fn.node) : null;
  if (isCapabilityAnchor(p)) {
    const owner = p.capabilityClass ?? p.located?.cls ?? null;
    if (owner) return { via: "clase", level: classDelegationLevel(owner.node, p.sets, new Set(SELF_WORDS), p.fileRoot).level };
    if (goRecv) return { via: "receptor-go", level: goDelegationLevel(p.fileRoot, p.sets, goRecv.typeName).level };
    return { via: "sin-duena", level: "none" };
  }
  if (!p.located) return { via: "sin-ubicar", level: "none" };
  if (p.located.cls) return { via: "clase", level: classDelegationLevel(p.located.cls.node, p.sets, p.located.fn.selfNames, p.fileRoot).level };
  if (goRecv) return { via: "receptor-go", level: goDelegationLevel(p.fileRoot, p.sets, goRecv.typeName).level };
  if (isDelegationAnchor(p)) return { via: "funcional", level: ownFunctionalDelegationLevel(p.located.fn.node, p.sets).level };
  return { via: "archivo", level: fileWideDelegationLevel(p.fileRoot, p.sets, p.located.fn.node).level };
}

function recordDecoratorTrace(
  problem: Finding,
  dp: DecoratorProblem,
  spec: HypothesisSpec<DecoratorProblem, CodeGraph | null>,
  graph: CodeGraph | null,
  ctx: HypothesisContext,
  emitted: boolean,
): void {
  const checks = spec.required.map((c) => {
    const r = c.run(dp, graph);
    return { id: c.id, holds: r.holds, why: r.evidence };
  });
  const loc = problem.locations[0];
  const d = traceDelegation(dp);
  decoratorTrace?.push({
    findingId: problem.id ?? "",
    kind: problem.kind,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    endLine: loc?.endLine ?? 0,
    symbol: loc?.symbol ?? "",
    lang: ctx.file?.language ?? "",
    withGraph: graph !== null,
    withFile: ctx.file !== null,
    located: dp.located !== null,
    ownerClass: dp.located?.cls?.name ?? dp.structuralClass?.name ?? dp.capabilityClass?.name ?? null,
    goReceiverType: dp.located ? (goReceiverOf(dp.located.fn.node)?.typeName ?? null) : null,
    via: d.via,
    level: d.level,
    checks,
    diesAt: checks.find((c) => !c.holds)?.id ?? null,
    appliedState: spec.appliedState(dp, graph).state,
    emitted,
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "decorator",
  pattern: "Decorator",
  layer: "patron",
  // OLA AD (AD3) — SE SUMA `optional-behavior-flags`, NO SE SACA NINGUNA.
  // Es el único camino de esta hipótesis por el que `ausente` es alcanzable
  // (ver el docstring de `CAPABILITY_ANCHOR_KIND`): las otras siete o exigen
  // el acumulador, o exigen que el reenvío YA esté escrito.
  //
  // OLA AL (AL1) — SE SACA `boolean-flag-param`, Y SÓLO ÉSA. Se saca del
  // array —explícito y auditable— en vez de silenciarla con un discriminador,
  // que escondería la decisión. Medido sobre el volcado del 21-08, con el
  // 100 % de la población viva juzgada en las DOS poblaciones (yo juzgué las
  // 2 que faltaban abriendo el archivo real, 1 y 1):
  //
  //   · nivel 2: 8 recomendaciones en biblioteca y 4 en aplicación, las 12
  //     juzgadas, **0 verdaderas** (0/7 y 0/4, más 1 `problema-si-patrón-no`).
  //   · costo en cobertura: **1 huérfano** en biblioteca
  //     (`hugo helpers/url.go:110 · RelURL`) y 0 en aplicación. Es el precio,
  //     y va declarado en vez de escondido detrás de la precisión.
  //   · la figura, repetida: las "capas opcionales" que este camino encuentra
  //     detrás de un booleano son ramas MUTUAMENTE EXCLUYENTES de un análisis
  //     de casos, o la API componible de un framework ya aplicada — o sea el
  //     falso positivo que el propio `toConfirm` de la hipótesis nombra
  //     ("capacidades ORTOGONALES, no los pasos de UNA fórmula").
  //
  // LAS OTRAS SIETE NO SE TOCAN, y tres de ellas por una razón MEDIDA, no por
  // omisión: `homonymous-delegation` y `optional-behavior-flags` tienen cada
  // una una propuesta juzgada VERDADERA en aplicaciones
  // (`gitea modules/proxyprotocol/conn.go:56` y
  // `jenkins core/src/main/java/hudson/util/FileChannelWriter.java:29`), y
  // `homonymous-delegation` es además la salida más cara del catálogo: 10
  // hallazgos de nivel 1 juzgados `verdadero` se quedarían sin NINGUNA
  // recomendación. El `build` queda intacto para las ocho.
  // ──────────────────────────────────────────────────────────────────────
  // OLA AY (frente AY4) — SE RETIRAN DOS ANCLAS: `long-parameter-list` y
  // `large-class`. Compuerta escrita ANTES de juzgar los sujetos frescos
  // (`scratchpad-ay4/DECISION-ESCRITA-ANTES.md`, G2) y con su condición de
  // aterrizaje escrita en el mismo lugar: «si alguna de las 2 propuestas
  // frescas de `long-parameter-list` sale `verdadero`, NO se aterriza ese
  // corte». Las dos salieron `falso` (sqlalchemy `sql/compiler.py`
  // `_label_select_column` de 13 parámetros y `dialects/oracle/base.py`
  // `__init__` de 10: una lista larga de parámetros no se arregla envolviendo
  // la unidad, se arregla con `Parameter Object` — que es otra hipótesis del
  // catálogo y sigue anclada ahí), así que el corte entra ENTERO.
  //
  // LO MEDIDO, celda por celda, sobre los 21 repos, con la población VIVA
  // enumerada al 100 % (13 de 13 propuestas juzgadas):
  //
  //   `long-parameter-list` · ausente   11 propuestas · 11 juzgadas · V=0 F=10 psp=1
  //   `long-parameter-list` · parcial    1 propuesta  ·  1 juzgada  · V=0 F=1
  //   `large-class`         · parcial    1 propuesta  ·  1 juzgada  · V=0 F=1
  //
  // CERO verdaderas en las tres celdas, y ningún sujeto sin juzgar donde una
  // pudiera esconderse: el costo sobre verdaderas juzgadas es cero POR CENSO,
  // no por extrapolación. LÍMITE: el censo es el de estos 21 repos.
  //
  // NIVEL 1 NO SE MUEVE, verificado: los dos `kind` siguen teniendo
  // consumidores —`long-parameter-list` en `builder.ts` y `parameter-object.ts`,
  // `large-class` en `extract-class.ts` y `template-method.ts`—, así que
  // ningún hallazgo de nivel 1 se queda sin hipótesis por este cambio.
  //
  // `refused-bequest` SE QUEDA y por eso `STRUCTURAL_ANCHOR_KINDS` no se toca:
  // el camino estructural sigue vivo por ese ancla, que no medí y no toco.
  //
  // AGNÓSTICO DE LENGUAJE: se retiran dos `kind` de una lista de anclas. No
  // hay un solo literal de sintaxis, extensión ni idioma en este cambio, y las
  // 13 propuestas que apaga cruzan SEIS lenguajes y ocho repos: python 5,
  // csharp 3, javascript 2, ruby 1, go 1, java 1.
  // ──────────────────────────────────────────────────────────────────────
  anchors: ["flag-accumulator", "boolean-complexity", "refused-bequest", DELEGATION_ANCHOR_KIND, CAPABILITY_ANCHOR_KIND],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const dp = prepareProblem(problem, ctx);
    const spec = buildSpec(ctx);
    const outcome = build(spec, ctx.capabilities, dp, graph);
    // OLA AP (AP3) — SÓLO TRAZA: costo cero apagada (el default de producción),
    // ni un `required` se mueve. Ver `startDecoratorTrace`.
    if (decoratorTrace) recordDecoratorTrace(problem, dp, spec, graph, ctx, outcome !== null);
    if (!outcome) return null;

    const baseLoc = problem.locations[0];
    const places: readonly RoleLocation[] = dp.candidate
      ? dp.candidate.layers.map((l, i) => ({
          file: baseLoc.file,
          startLine: l.startLine,
          endLine: l.endLine,
          symbol: dp.located?.fn.name ?? undefined,
          role: i === 0 ? `acumulador \`${dp.candidate!.target}\` — capa opcional 1 de ${dp.candidate!.layers.length}` : `capa opcional ${i + 1} de ${dp.candidate!.layers.length}`,
        }))
      : dp.structuralClass
        ? [
            {
              file: baseLoc.file,
              startLine: dp.structuralClass.node.startPosition.row + 1,
              endLine: dp.structuralClass.node.endPosition.row + 1,
              symbol: dp.structuralClass.name,
              role: "clase con cadena de envoltura (ancla estructural: large-class/refused-bequest, sin acumulador de banderas)",
            },
          ]
        : isDelegationAnchor(dp)
          ? [{ ...baseLoc, role: "unidad con reenvío homónimo confirmado (ancla `homonymous-delegation`, sin acumulador de banderas)" }]
          : isCapabilityAnchor(dp) && dp.capabilityUnit
            ? [
                {
                  file: baseLoc.file,
                  startLine: dp.capabilityUnit.startLine,
                  endLine: dp.capabilityUnit.endLine,
                  symbol: dp.capabilityUnit.name,
                  role: `unidad-tipo con ${dp.capabilityUnit.capabilities.length} capacidades opcionales atadas a su código (ancla de FUERZA \`optional-behavior-flags\`)`,
                },
                ...dp.capabilityUnit.capabilities.map((c) => ({
                  file: baseLoc.file,
                  startLine: c.sites[0]!.startLine,
                  endLine: c.sites[0]!.endLine,
                  symbol: c.sites[0]!.member,
                  role: `capacidad opcional \`${c.field}\` — candidata a envoltorio propio; hoy consultada en ${c.members.length} miembro(s): ${c.members.join(", ")}`,
                })),
              ]
            : [{ ...baseLoc, role: "función ancla (sin árbol vivo para localizar las capas)" }];

    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places,
      cost: "Una clase/función wrapper por capa opcional, más la composición en el punto de uso — más indirección que banderas booleanas; se paga si el número de combinaciones reales de capas crece.",
    });
  },
  /**
   * Ola 11a (P2) — segunda pasada (`hypotheses/run.ts#refreshHypotheses`,
   * desde `crossAnalyze`, DESPUÉS de construir el `NeighborhoodIndex` real):
   * recalcula SÓLO discriminadores/confianza contra `ctx.neighborhood` real
   * (ver `otherWrappersInRepoDiscriminator`, arriba) — nunca toca `state` ni
   * los checks `required`/`applied` de `existing` (contrato duro de
   * `engine.ts#refreshDiscriminators`). `ya-aplicado`/`aplicado-eludido` no
   * compiten por confianza (mismo criterio que `build()`), así que no hay
   * nada que una escalera de discriminadores pueda mejorar ahí — se
   * descarta antes de reconstruir nada.
   */
  refresh(existing, problem, graph, ctx) {
    if (existing.state !== "ausente" && existing.state !== "parcial") return null;
    const dp = prepareProblem(problem, ctx);
    const spec = buildSpec(ctx);
    return refreshDiscriminators(spec, existing, dp, graph);
  },
};

/** Exportado SÓLO para el harness de medición sobre el corpus y para
 *  verificar el excluder DIRECTAMENTE contra fixtures de Decorator ya
 *  aplicado correctamente que NO tienen la forma AUSENTE (el acumulador) —
 *  `build()` completo nunca corre sobre ellas, porque `required` las
 *  descarta antes de llegar a `appliedState` (arquitectura de `engine.ts`,
 *  no de este archivo): no hay hallazgo ancla que las dispare. */
export const __internals = {
  locateFunctionAndClass,
  pickEmbellishmentCandidate,
  classDelegationLevel,
  goDelegationLevel,
  fileWideDelegationLevel,
  graphOverride,
  // OLA AP (AP3) — para la sonda por-archivo del embudo de `optional-behavior-flags`
  // (`scratchpad-ap3/scripts/ap3-sonda-capacidades.mts`): son las MISMAS funciones
  // que `prepareProblem` y los dos `required` de capacidades usan, expuestas para
  // poder contar el embudo sin re-correr `analyzeRepo` sobre los 21 repos.
  locateClassOnly,
  matchCapabilityUnit,
  capabilityFieldsReadAsValue,
  ownFunctionalDelegationLevel,
  goReceiverOf,
};
