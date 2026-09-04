/**
 * Factory Method — F6, primera migración de S1 sobre el motor (CONTRATO-F6.md
 * Contrato 1/3, fila `factory-method`). Vive hoy además en
 * `pattern-behavioral.ts:427 findFactoryMethodOpportunities` (SIGUE CORRIENDO
 * — no se toca ni se apaga acá: la migración se mide por solapamiento, no se
 * reemplaza a ciegas).
 *
 * ANCLA: `conditional-chain` (`detect/intra-function/conditional-chain.ts`),
 * exclusivamente su sub-forma `variant === "instantiates"` — la que el propio
 * detector emite sólo cuando TODAS las ramas de la cadena construyen tipos
 * DISTINTOS Y la función NO es ya `isFactoryLike`.
 *
 * ═══════════════════ OLA X (B6) — SEGUNDA ANCLA: `repeated-switch` ══════════
 *
 * MEDIDO, NO SUPUESTO (A2.md, `x-a2-tabla.py` sobre los 13 repos): la única
 * ancla de este archivo muere en `is-instantiates-variant` **381 de 382**
 * veces. La causa NO está acá — está en `code-analyzer.ts#ladderInstantiatesTypes`,
 * que exige que TODAS las ramas de la escalera `if`/`else if` construyan un
 * tipo DISTINTO para que `conditional-chain` emita siquiera `variant:
 * "instantiates"`. Esa función es de `code-analyzer.ts` (nivel 1, fuera de
 * este alcance — PIDO A OTRO FRENTE, heredado de W1/A2, sigue sin dueño). Con
 * ese techo, este archivo no podía sumar población tocando sólo sus propios
 * archivos SIN un segundo ancla que no dependa de esa función.
 *
 * POR QUÉ `repeated-switch` Y NO OTRA COSA: es un SMELL (Fowler, "Switch
 * Statements" — el mismo discriminante decidido por `switch`/`case`/`match`
 * en ≥2 lugares del archivo), no estructura — el propio detector
 * (`detect/intra-file/repeated-switch.ts`) ya declara su remedio como
 * "Replace Conditional with Polymorphism" y su `advice.primary.source` ES
 * literalmente `.../design-patterns/factory-method`. Hoy ese smell alimenta
 * State y Strategy (compartir ancla es la norma, `hypotheses/engine.ts`
 * arbitra los rivales) pero NADIE lo mira para su remedio más citado. La
 * pregunta que el `required` nuevo hace es la MISMA semántica que
 * `ladderInstantiatesTypes` (¿construye ≥2 tipos DISTINTOS?), calculada acá
 * mismo sobre el CUERPO de la función que contiene el switch — sin la
 * exigencia "TODAS las ramas" (que es, medido, el techo real): un switch
 * repetido cuyo cuerpo construye ≥2 tipos distintos entre `case`s, aunque
 * algún `case` no construya nada (un `default` que loguea, un `case` que
 * delega), sigue siendo la forma exacta que Factory Method reemplaza.
 *
 * CÓMO SE RESUELVE LA FUNCIÓN: a diferencia de `conditional-chain` (donde el
 * `Finding` ancla ES el propio método, rango exacto), `repeated-switch`
 * ancla en el NODO DEL SWITCH — casi nunca el mismo rango que el método que
 * lo envuelve. `smallestContaining` busca, por CONTENCIÓN (no igualdad), el
 * miembro más chico que contiene ese rango, en `file.functions` (árbol vivo,
 * mismo mecanismo intra-file que ya hace resolver `ctx.fileAt` siempre para
 * esta ancla — ninguna de las dos anclas necesita reparse bajo demanda) y en
 * `ctx.repo.functions` (para `chainHasNullCheck`, igual que antes). Toda la
 * maquinaria de abajo (`computeAstFamily`/`computeGraphFamily`/`appliedState`)
 * es la MISMA para las dos anclas — sólo cambia CÓMO se llega al
 * `(ownerClassName, memberName, memberArity)` de partida.
 *
 * LÍMITE DECLARADO: `distinctConstructedTypes` reutiliza `RETURN_CONSTRUCTS`
 * (las mismas 4 formas de arriba) pero GLOBAL sobre el cuerpo entero, no sólo
 * la primera aparición — no incluye el refuerzo Python de `detectProduct`
 * (`RETURN_BARE_CALL` + `knownClasses`): extender esa segunda forma a un
 * escaneo global no se verificó contra ningún caso real en el tiempo de esta
 * ola, así que Python sigue viendo únicamente las 4 formas con palabra clave
 * de construcción para esta ancla nueva — mismo hueco ya declarado arriba
 * para `detectProduct`, no uno nuevo.
 *
 * ═══════════════════ OLA 10 — LAS TRES FORMAS ═══════════════════════════
 *
 * El vocabulario `FACTORY_NAME_LIKE` (create/build/make/new/for/from/of/
 * instantiate, igual clase que `CREATE_NAME`/`RETURN_NEW`/`FACTORY_NAME` de
 * `pattern-structural.ts`/`pattern-behavioral.ts`) SE RETIRA de acá. Además
 * era estructuralmente MUERTO: `conditional-chain.ts:49` sólo emite este
 * `Finding` cuando `!fn.isFactoryLike` — así que ningún `Finding` que llega a
 * este archivo puede tener un nombre de fábrica que ese MISMO vocabulario
 * (duplicado, ver el docstring viejo) ya rechazó antes. El reemplazo
 * ESTRUCTURAL, tal como lo pide CONTRATO-F10.md: "miembro con `instantiates`
 * saliente redeclarado con misma (name, arity) en ≥2 subtipos".
 *
 * LAS TRES FORMAS (evaluadas en `appliedState`, más abajo):
 *   - COMPLETA: base B con ≥2 subtipos Si que la `extends`/`implements`
 *     (textual/AST — ver LÍMITE DE ALCANCE); B redeclara el miembro m (mismo
 *     nombre+aridad que el `Finding` ancla) y CADA Si también; cada Si.m
 *     construye un producto (detectado por FORMA: `return`/expresión que
 *     construye una instancia — nunca por nombre) y los productos son
 *     DISTINTOS entre sí; B.m NO construye nada (abstracto, o no se pudo
 *     encontrar — ver hueco declarado). ⇒ `ya-aplicado`, NUNCA una
 *     sugerencia (requisito 1: sugerir Factory Method sobre un Factory
 *     Method ya hecho es el falso positivo que el usuario rechazó).
 *   - PARCIAL (dos formas, cualquiera de las dos):
 *     (a) ≥2 miembros con la misma (name, arity) que SÍ construyen productos
 *         DISTINTOS, pero SIN una base común que los unifique — la
 *         variación existe, no está formalizada (CONTRATO-F10.md, forma
 *         PARCIAL #1).
 *     (b) el `chain-is-whole-method` heredado (declarado NO EVALUABLE hoy,
 *         ver LÍMITE MEDIDO 2 más abajo, sin cambios de la Ola 6-9).
 *   - AUSENTE: lo de siempre — el hallazgo ancla existe (`conditional-chain`
 *     con `variant: "instantiates"`) y ninguna de las dos formas de arriba
 *     se pudo confirmar.
 *
 * DOS FUENTES DE EVIDENCIA, EN ORDEN DE PREFERENCIA — `computeGraphFamily`
 * (grafo: `extends`/`implements`/`satisfies`, `memberSignatures`,
 * `instantiates`) y `computeAstFamily` (AST del archivo vivo, vía
 * `ctx.fileAt`). El camino por GRAFO da SIEMPRE `null` en producción para
 * esta ancla — no por un bug de esta hipótesis, sino porque `conditional-chain`
 * es intra-function y su único paso por `attachHypotheses` ocurre DENTRO de
 * `analyzeFile` (`code-analyzer.ts:1611-1616`), con `repo.graph: null`
 * explícito (el grafo del repo se arma recién en `crossAnalyze`, y ESE
 * segundo paso sólo procesa `interFile.findings`, nunca los intra-function —
 * ver `hypotheses/run.ts`). VERIFICADO leyendo ese llamador, no corriendo
 * `analyzeRepo`: la fixture canónica propia (`factory_method_override/*`) NO
 * tiene ningún condicional de ≥5 ramas (es código YA bien aplicado, sin el
 * olor que `conditional-chain` busca), así que `analyzeRepo` sobre ella da
 * CERO hallazgos de cualquier tipo — confirmado corriendo el analizador real
 * sobre la fixture, ver el resultado final de la tarea. La verificación de
 * las tres formas contra esa fixture (`factory-method.test.ts`) usa por eso
 * un `Finding` ancla SINTÉTICO, exactamente como `prototype.test.ts`/
 * `null-object.test.ts` ya hacen para sus propias anclas inter-file (que
 * tampoco disparan solas ahí). El mismo `code-analyzer.ts:1611-1616` SÍ pasa
 * `files: [fileUnit]`, así que `ctx.fileAt(mismo archivo)` tiene árbol vivo —
 * a diferencia de `prototype.ts`/`null-object.ts` (anclados en un `Finding`
 * inter-file, con árbol SIEMPRE muerto). Por eso el camino real de esta
 * hipótesis en producción, cuando SÍ hay un `Finding` ancla real, es el AST,
 * no el grafo. El camino por grafo se conserva — probado con grafos
 * sintéticos (`factory-method.test.ts`) — porque es la forma que el contrato
 * pide textualmente y porque una ola futura podría cablear este ancla de
 * otra manera; declarado inerte hoy, no escondido (mismo trato que
 * `wrapping-chain.ts` documenta para sí mismo).
 *
 * DETECCIÓN DE "CONSTRUYE UN PRODUCTO", POR FORMA NO POR NOMBRE: un miembro
 * "construye" cuando su `return` (misma línea/statement, nunca cruzando
 * `;`/`{`/`}`) contiene `new X(`, `X.new`, `NewX(` o `&X{` (mismas 4 formas
 * que `prototype.ts#CONSTRUCTS_TYPE` ya usa en producción para la misma
 * pregunta — replicado, no importado, mismo criterio que ese archivo
 * documenta). Anclar en `return` es lo que separa `return new WindowsButton()`
 * de `throw new Error(...)` en el propio método abstracto (JS/TS/Vue) — sin
 * ese anclaje, la base dejaría de verse abstracta.
 *
 * PYTHON, un QUINTO camino que `prototype.ts` NO tiene: sin palabra clave de
 * construcción, `return WindowsButton()` es sintácticamente una llamada
 * cualquiera — declarado en `graph/edges/instanciacion.ts` ("instanciación y
 * llamada común son el MISMO nodo AST, sin campo que las distinga"), y
 * heredado tal cual por `prototype.ts#CONSTRUCTS_TYPE` (mismo hueco, no
 * nuevo). Adivinar por convención de mayúscula sería vocabulario disfrazado
 * de sintaxis — lo que el requisito 3 prohíbe, y lo que el propio hueco ya
 * declaraba antes de esta ola. Se agregó (`RETURN_BARE_CALL`, sólo en este
 * archivo) el único refuerzo genuinamente estructural posible sin adivinar:
 * ¿el identificador llamado es el nombre de una clase YA DECLARADA en este
 * MISMO archivo (`knownClasses`)? — un cruce contra un símbolo real, no una
 * heurística de nombre. MEDIDO, Y DECLARADO SIN INFLAR EL RESULTADO: este
 * refuerzo NO alcanza a la fixture canónica de Python (`factory_method_
 * override/python.py`) — ahí el producto (`WindowsButton`/`WebButton`) es
 * una clase EXTERNA, no declarada en ese archivo, así que `knownClasses` no
 * la contiene y el "quinto camino" no dispara. El hueco declarado para
 * Python SIGUE ABIERTO para el caso general (producto en otro archivo/
 * módulo, el caso común); el refuerzo sólo cubre el caso más angosto de un
 * producto auto-referencial dentro del mismo archivo — verificado con
 * `factory-method.test.ts`, no con la fixture canónica (ver ahí el estado
 * real: `ausente`, no `ya-aplicado`, para Python).
 *
 * LÍMITE DE ALCANCE, MEDIDO: la jerarquía completa (B + todos los Si) tiene
 * que vivir en el MISMO archivo que el `Finding` ancla — `ctx.fileAt` sólo
 * tiene el árbol de ESE archivo en esta llamada (`input.files: [fileUnit]`,
 * un único elemento). La convención "una clase por archivo" (común en
 * Java/C#) vuelve esto invisible ahí. Medido sobre la fixture propia (ver el
 * resultado final de la tarea, `factory-method.test.ts`): funciona en
 * ruby/javascript/typescript/vue (una clase por archivo, PERO la fixture
 * entera vive en un solo archivo); Python NO llega a `ya-aplicado` en ESA
 * fixture específica (el producto es una clase externa — ver el párrafo de
 * arriba), aunque el `required`/`appliedState` corren igual y el estado real
 * medido es `ausente`, nunca `null`/silencio; Go falla porque
 * `graph/symbols.ts`/`fileUnitFrom` no vinculan un método-con-receptor a su
 * struct (`sets.classNodes` vacío para Go — `code-grammar.ts`, ya declarado
 * en otros módulos) — confirmado por sonda: el método queda con
 * `symbolPath` de un solo segmento, sin clase, así que ni `ownerClassName`
 * ni `ownerId` se pueden derivar — el estado queda `ausente` (nunca `null`:
 * `needs: []` no excluye a Go, sólo no hay familia que reportar).
 *
 * `aplicado-eludido` NO se produce por este camino — DECISIÓN DE CONTRATO,
 * Ola 11a (P3), no ya un hueco. La justificación vieja ("invisible sin grafo
 * repo-completo") está VENCIDA: el grafo repo-completo existe hoy
 * (`instantiates`/`calls` a nivel de símbolo, el propio archivo ya los usa
 * arriba) y `computeGraphFamily` ya sabe encontrar la familia. Lo que sigue
 * siendo cierto, y es la razón REAL (no la vieja): el único punto de esta
 * hipótesis que ve un `graph` no-`null` es `refresh()` (ver más abajo, y
 * `hypotheses/run.ts#refreshHypotheses`) — `build()` recibe SIEMPRE
 * `graph: null` para este ancla intra-function (`analyzeFile`, antes de que
 * `repo.graph` exista). Y `refresh()` tiene PROHIBIDO por contrato
 * (`engine.ts#refreshDiscriminators`, `hypotheses/types.ts#HypothesisBuilder.refresh`)
 * tocar `state`/`checks` — sólo `discriminators`/`confidence`. Ese contrato
 * es compartido con P2/P6 (`hypotheses/engine.ts`/`types.ts`/`run.ts`, ver
 * el dueño de archivo de la ola): ensancharlo para permitir que UN camino
 * mueva `state` (aunque fuera en una sola dirección, sin poder revertir una
 * exclusión que `build()` ya confirmó con árbol vivo) es una decisión que
 * esta ola, deliberadamente, NO toma acá — cambiaría una garantía que otros
 * dos paquetes de la MISMA ola están asumiendo fija en este preciso momento.
 * DECISIÓN: el puenteo se expresa como DISCRIMINADOR
 * (`externalBypassDiscriminator`, más abajo), nunca como cambio de estado.
 * Un cliente externo que llama por `calls` directamente a un `Si.m`
 * saltando `B.m` queda registrado en `checks`/`discriminators` — visible en
 * la UI, auditable — pero el `state` sigue siendo el que `build()` decidió
 * con el árbol vivo (`ya-aplicado` para la forma COMPLETA). El camino real
 * en producción para ESTE discriminador es `refresh()`: `build()` (graph
 * `null`) siempre lo ve como "no evaluable"; sólo la segunda pasada, con el
 * grafo real de `crossAnalyze`, puede confirmarlo — mismo patrón que
 * `strategy.ts#crossRepetitionDiscriminator`. Si una ola futura decide
 * ensanchar el contrato de `refresh()`, este es el punto exacto que se
 * beneficiaría; hoy queda declarado, no escondido.
 *
 * LÍMITE MEDIDO 2 (sin cambios desde la Ola 6-9): `chain-is-whole-method"
 * sigue sin ser evaluable — necesitaría contar, en el AST vivo, los
 * statements hermanos del cuerpo que NO sean el nodo de la cadena, cosa que
 * ni `HypothesisContext` ni `RepoFunctionUnit` exponen hoy. Se declara
 * `holds: false` con evidencia explícita, igual que antes de esta ola.
 *
 * FORMA EN LENGUAJES SIN CLASES: sigue funcionando igual (`needs: []`) — Go
 * queda sin señal por el límite de arriba (declarado, no un `needs` que lo
 * excluya a propósito: si algún día `symbols.ts` vincula el método a su
 * struct, esto empieza a verlo solo).
 */
import { ROLE_ANCESTOR, ROLE_REDECLARES } from "../detect/inter-file/homonymous-divergent-construction.js";
import type { AstNode, Finding, FileUnit, FunctionUnit, RepoFunctionUnit } from "../detect/types.js";
import type { DerivedNodeSets } from "../code-grammar.js";
import { walkTree } from "../detect/tree-walk.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { memberSignatures, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type GraphIndex } from "../graph/types.js";
import type { AppliedStateResult, Check, HypothesisSpec } from "./engine.js";
import { build, refreshDiscriminators, toPatternHypothesis } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisCheck, PatternHypothesisDraft, PatternState } from "./types.js";

/** Un peldaño más allá del mínimo estructural (2, ya garantizado por
 *  `variant === "instantiates"` — ver `isInstantiatesVariant`) sube la
 *  escalera: familia de tipos más rica, más beneficio de centralizar. */
const THREE_OR_MORE_BRANCHES = 3;

/* ────────────────────────────────────────────────────────────────────────
 * "¿Este miembro construye un producto?" — POR FORMA, replicado de
 * `prototype.ts#CONSTRUCTS_TYPE`/`constructedType` (mismo criterio de "no
 * importar entre archivos de hipótesis por un detalle propio" que ese mismo
 * módulo documenta). Anclado a `return` (misma línea/statement) para no
 * confundir `throw new Error(...)` de un método abstracto con una
 * construcción real — ver docstring del módulo.
 * ──────────────────────────────────────────────────────────────────────── */
const RETURN_CONSTRUCTS =
  /\breturn\b[^;{}]*?(?:\bnew\s+([A-Za-z_]\w*)\s*\(|\b([A-Za-z_][\w:]*)\.new\b|New([A-Za-z_]\w*)\s*\(|&([A-Za-z_]\w*)\s*\{)/;

/**
 * Python NO tiene ninguna de las 4 formas de arriba: no hay palabra clave de
 * construcción, `return WindowsButton()` es sintácticamente una llamada
 * cualquiera — declarado en `graph/edges/instanciacion.ts` ("instanciación y
 * llamada común son el MISMO nodo AST, sin campo que las distinga") y
 * heredado tal cual por `prototype.ts#CONSTRUCTS_TYPE` (mismo hueco, no
 * nuevo). Adivinar por convención de mayúscula sería vocabulario disfrazado
 * de sintaxis — LO QUE SÍ es estructural, y por eso se agrega acá: ¿el
 * identificador llamado es el nombre de una clase YA DECLARADA en este MISMO
 * archivo (`knownClasses`, las claves de `superclassByClass`)? Eso es un
 * cruce contra un símbolo real, no una heurística de nombre.
 */
const RETURN_BARE_CALL = /\breturn\s+([A-Za-z_]\w*)\s*\(/;

function detectProduct(bodyText: string, knownClasses?: ReadonlySet<string>): string | null {
  const m = RETURN_CONSTRUCTS.exec(bodyText);
  if (m) return m[1] ?? m[2] ?? m[3] ?? m[4] ?? null;
  if (!knownClasses) return null;
  const callee = RETURN_BARE_CALL.exec(bodyText)?.[1];
  return callee && knownClasses.has(callee) ? callee : null;
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA X (B6) — sólo para el ancla nueva `repeated-switch`: ¿el CUERPO de la
 * función que contiene el switch construye ≥2 tipos DISTINTOS en total? Ver
 * "SEGUNDA ANCLA" en el docstring del módulo — misma pregunta que
 * `ladderInstantiatesTypes` (nivel 1, fuera de este archivo) pero sin exigir
 * que TODAS las ramas construyan: alcanza con que el switch, en algún par de
 * `case`s, elija entre construir tipos distintos.
 * ──────────────────────────────────────────────────────────────────────── */
const RETURN_CONSTRUCTS_GLOBAL = new RegExp(RETURN_CONSTRUCTS.source, "g");

function distinctConstructedTypes(bodyText: string): ReadonlySet<string> {
  const types = new Set<string>();
  for (const m of bodyText.matchAll(RETURN_CONSTRUCTS_GLOBAL)) {
    const t = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (t) types.add(t);
  }
  return types;
}

/**
 * El miembro más CHICO (menor rango de líneas) que CONTIENE `loc` — a
 * diferencia de `findMatchingFunction`/`findFunctionInFile` (más abajo,
 * EXACTOS: para `conditional-chain` el `Finding` ancla ES el propio método),
 * `repeated-switch` ancla en el NODO DEL SWITCH, casi nunca idéntico al
 * rango del método que lo envuelve — hace falta CONTENCIÓN, no igualdad.
 * "Más chico" evita que una función externa que también contenga el rango
 * (anidamiento) gane sobre la que envuelve el switch de verdad.
 */
function smallestContaining<T extends { readonly startLine: number; readonly endLine: number }>(
  units: readonly T[],
  loc: Finding["locations"][number],
): T | null {
  let best: T | null = null;
  for (const u of units) {
    if (u.startLine > loc.startLine || u.endLine < loc.endLine) continue;
    if (!best || u.endLine - u.startLine < best.endLine - best.startLine) best = u;
  }
  return best;
}

/** Lo que ambas fuentes (grafo/AST) producen — la forma normalizada que
 *  `appliedState` decide, sin importar de dónde salió. */
interface FamilyEvidence {
  /** Cuántos tipos (incluido el propio) redeclaran el miembro CON un producto detectado — el reemplazo estructural de "nombre de fábrica". */
  variantsWithProduct: number;
  /** Productos distintos (texto crudo, sin resolver) entre esos tipos. */
  distinctProducts: number;
  /** Etiqueta legible de la base común (extends/implements), o `null` si no se encontró ninguna que unifique ≥2 variantes. */
  baseLabel: string | null;
  /** `true` ⇒ la base NO construye nada ella misma (abstracta, confirmada o asumida por hueco de extracción). Sólo significativo cuando `baseLabel !== null`. */
  hasAbstractCommonBase: boolean;
  /** `true` ⇒ no se pudo ubicar el propio miembro de la base (abstracto sin cuerpo — hueco de extracción declarado, p.ej. TypeScript `abstract m(): T;`) — se trató como abstracto por defecto, no confirmado. */
  baseMemberUnconfirmed: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * Fuente 1 — AST del archivo vivo (`ctx.fileAt`). ES LA QUE CORRE DE VERDAD
 * en producción para esta ancla — ver docstring del módulo.
 * ──────────────────────────────────────────────────────────────────────── */

/** Mismas 3 formas + fallback posicional que `prototype.ts#extractSuperclassName`/
 *  `pattern-structural.ts#extractSuperclass` ya prueban contra las 6 gramáticas
 *  con `herencia` real. Replicada, no importada (mismo criterio que ese archivo documenta). */
function extractSuperclassName(node: AstNode): string | null {
  const direct = (node.childForFieldName("superclass") as AstNode | null)?.text;
  if (direct) {
    const cleaned = direct
      .replace(/^[<:]\s*/, "")
      .replace(/^extends\s+/, "")
      .trim();
    return cleaned || null;
  }
  const plural = (node.childForFieldName("superclasses") as AstNode | null)?.text;
  if (plural) {
    const inner = /\(([^)]+)\)/.exec(plural)?.[1] ?? plural;
    return inner.split(",")[0]?.trim() || null;
  }
  const bases = (node.childForFieldName("bases") as AstNode | null)?.text;
  if (bases) {
    const first = bases.replace(/^:\s*/, "").split(",")[0]?.trim();
    return first || null;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && /heritage/i.test(child.type)) {
      const m = /extends\s+([A-Za-z_$][\w$.]*)/.exec((child as AstNode).text);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

function extractSuperclassesByClassName(root: AstNode, sets: DerivedNodeSets): ReadonlyMap<string, string | null> {
  const out = new Map<string, string | null>();
  walkTree(root, (node) => {
    if (!node.isNamed || !sets.classNodes.has(node.type)) return;
    const real = node as AstNode;
    const name = (real.childForFieldName("name") as AstNode | null)?.text;
    if (name) out.set(name, extractSuperclassName(real));
  });
  return out;
}

function computeAstFamily(file: FileUnit, sets: DerivedNodeSets, ownerClassName: string, memberName: string, memberArity: number | null): FamilyEvidence | null {
  const superclassByClass = extractSuperclassesByClassName(file.root, sets);
  // Estructural, no vocabulario: los nombres de TODAS las clases declaradas
  // en este archivo — ver `RETURN_BARE_CALL`/`detectProduct` (Python).
  const knownClasses = new Set(superclassByClass.keys());
  const candidates = file.functions.filter((fn) => fn.name === memberName && fn.metrics.parameters === memberArity && fn.metrics.className !== null);
  const withClass = candidates.map((fn) => ({ className: fn.metrics.className as string, product: detectProduct(fn.node.text, knownClasses) }));

  const ownerSuperclass = superclassByClass.get(ownerClassName) ?? null;
  if (ownerSuperclass) {
    const sameBase = withClass.filter((v) => superclassByClass.get(v.className) === ownerSuperclass);
    const withProduct = sameBase.filter((v): v is { className: string; product: string } => v.product !== null);
    if (withProduct.length >= 2) {
      const baseFn = file.functions.find((fn) => fn.metrics.className === ownerSuperclass && fn.name === memberName);
      const baseProduct = baseFn ? detectProduct(baseFn.node.text, knownClasses) : null;
      return {
        variantsWithProduct: withProduct.length,
        distinctProducts: new Set(withProduct.map((v) => v.product)).size,
        baseLabel: ownerSuperclass,
        hasAbstractCommonBase: baseProduct === null,
        baseMemberUnconfirmed: baseFn === undefined,
      };
    }
  }

  // Sin base común que unifique (o no alcanzó ≥2 con producto bajo ella): PARCIAL var. 1 — TODO el archivo, sin agrupar por base.
  const withProductAny = withClass.filter((v): v is { className: string; product: string } => v.product !== null);
  if (withProductAny.length >= 2) {
    return {
      variantsWithProduct: withProductAny.length,
      distinctProducts: new Set(withProductAny.map((v) => v.product)).size,
      baseLabel: null,
      hasAbstractCommonBase: false,
      baseMemberUnconfirmed: false,
    };
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * Fuente 2 — grafo (`extends`/`implements`/`satisfies`, `memberSignatures`,
 * `instantiates`). Inerte en producción para esta ancla HOY (ver docstring
 * del módulo) — probada con grafos sintéticos, conservada por si una ola
 * futura cablea `repo.graph` también para hallazgos intra-function.
 * ──────────────────────────────────────────────────────────────────────── */
const BASE_EDGE_KINDS = new Set(["extends", "implements", "satisfies"]);

interface GraphIdx {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  /** Ola 11a (P3) — reverso de `edgesFrom`: aristas por NODO DESTINO. Sólo
   *  lo usa `externalBypassDiscriminator` (más abajo), que necesita mirar
   *  QUIÉN llama a `Si.m` (un `calls` ENTRANTE), no qué llama `Si.m` sale. */
  readonly edgesTo: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  /** baseId -> tipos que le apuntan por `extends`/`implements`/`satisfies` — construido UNA vez, no por finding. */
  readonly subtypesByBase: ReadonlyMap<string, readonly string[]>;
}

const GRAPH_INDEX_CACHE = new WeakMap<CodeGraph, GraphIdx>();

function graphIndexFor(graph: CodeGraph): GraphIdx {
  const cached = GRAPH_INDEX_CACHE.get(graph);
  if (cached) return cached;
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  const edgesTo = new Map<string, CodeGraphEdge[]>();
  const subtypesByBase = new Map<string, string[]>();
  for (const e of confidentEdges(graph)) {
    const list = edgesFrom.get(e.from);
    if (list) list.push(e);
    else edgesFrom.set(e.from, [e]);
    const listTo = edgesTo.get(e.to);
    if (listTo) listTo.push(e);
    else edgesTo.set(e.to, [e]);
    if (BASE_EDGE_KINDS.has(e.kind)) {
      const subs = subtypesByBase.get(e.to);
      if (subs) subs.push(e.from);
      else subtypesByBase.set(e.to, [e.from]);
    }
  }
  const idx: GraphIdx = { nodeById, edgesFrom, edgesTo, subtypesByBase };
  GRAPH_INDEX_CACHE.set(graph, idx);
  return idx;
}

function asGraphIndex(idx: GraphIdx): GraphIndex {
  return { nodeById: (id) => idx.nodeById.get(id) ?? null, edgesFrom: (id) => idx.edgesFrom.get(id) ?? [] };
}

function memberNodeId(idx: GraphIdx, ownerId: string, name: string): string | null {
  for (const e of idx.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = idx.nodeById.get(e.to);
    if (target?.kind === "symbol" && target.family === "function-like" && target.symbolPath[target.symbolPath.length - 1] === name) return target.id;
  }
  return null;
}

/** Primer producto (símbolo destino, último segmento de `symbolPath`) de las `instantiates` salientes de `memberId`, si las hay. */
function firstProductOf(idx: GraphIdx, memberId: string): string | null {
  for (const e of idx.edgesFrom.get(memberId) ?? []) {
    if (e.kind !== "instantiates") continue;
    const target = idx.nodeById.get(e.to);
    return target ? (target.symbolPath[target.symbolPath.length - 1] ?? e.to) : e.to;
  }
  return null;
}

function hasAnyInstantiates(idx: GraphIdx, memberId: string): boolean {
  return (idx.edgesFrom.get(memberId) ?? []).some((e) => e.kind === "instantiates");
}

function computeGraphFamily(graph: CodeGraph, ownerId: string, memberName: string, memberArity: number | null): FamilyEvidence | null {
  const idx = graphIndexFor(graph);
  const gi = asGraphIndex(idx);
  const bases = (idx.edgesFrom.get(ownerId) ?? []).filter((e) => BASE_EDGE_KINDS.has(e.kind)).map((e) => e.to);

  for (const baseId of bases) {
    const siblingIds = idx.subtypesByBase.get(baseId) ?? [];
    if (siblingIds.length < 2) continue;

    const withProduct: string[] = [];
    for (const sId of siblingIds) {
      const sig = memberSignatures(gi, sId).find((m) => m.name === memberName && m.arity === memberArity);
      if (!sig) continue;
      const mId = memberNodeId(idx, sId, memberName);
      const product = mId ? firstProductOf(idx, mId) : null;
      if (product) withProduct.push(product);
    }
    if (withProduct.length < 2) continue;

    const baseMemberId = memberNodeId(idx, baseId, memberName);
    const baseConstructs = baseMemberId ? hasAnyInstantiates(idx, baseMemberId) : false;
    const baseNode = idx.nodeById.get(baseId);
    return {
      variantsWithProduct: withProduct.length,
      distinctProducts: new Set(withProduct).size,
      baseLabel: baseNode ? (baseNode.symbolPath[baseNode.symbolPath.length - 1] ?? baseId) : baseId,
      hasAbstractCommonBase: !baseConstructs,
      baseMemberUnconfirmed: baseMemberId === null,
    };
  }
  return null;
}

/**
 * OLA X (B6) — de dónde salió la confirmación "construye ≥2 tipos
 * distintos", con la fuente y la evidencia propias de cada ancla: para
 * `conditional-chain` es el propio detector (`variant === "instantiates"`,
 * que ya garantiza el mínimo); para `repeated-switch` es el conteo local
 * (`distinctConstructedTypes`) sobre el cuerpo del método que envuelve el
 * switch — ver `computeInstantiatesEvidence`.
 *
 * OLA AI (AI6) — TERCERA FUENTE, `conditional-chain-arbol`: el MISMO conteo
 * local que ya usa `repeated-switch`, aplicado al cuerpo vivo de la función
 * anclada cuando la bandera del detector NO alcanzó. Ver
 * `computeInstantiatesEvidence`, abajo, para el defecto que arregla.
 */
type InstantiatesEvidence =
  | { readonly source: "conditional-chain" }
  | { readonly source: "repeated-switch"; readonly distinctTypes: number }
  | { readonly source: "conditional-chain-arbol"; readonly distinctTypes: number }
  | { readonly source: "conditional-chain-grafo"; readonly distinctTypes: number };

/* ────────────────────────────────────────────────────────────────────────
 * El problema — `family` (OLA 10) y `instantiatesEvidence` (OLA X, B6) son
 * las dos fuentes que agrega este archivo sobre el `Finding` ancla crudo;
 * discriminadores (`threeOrMoreBranches`/`cleanTypeDispatch`) sin cambios.
 * ──────────────────────────────────────────────────────────────────────── */
interface ChainInstantiatesProblem {
  variant: string | undefined;
  functionName: string;
  chainLength: number;
  /** `null` cuando no se pudo emparejar el `Finding` con un `RepoFunctionUnit`. */
  hasNullCheckBranch: boolean | null;
  /** Id de nodo de grafo del TIPO contenedor (para `computeGraphFamily`), si se pudo derivar. `null` si no hay ≥2 segmentos de `symbolPath` (función suelta, no método). */
  ownerId: string | null;
  memberArity: number | null;
  /** Ya computada en `build()` (necesita `ctx.fileAt`) — ver docstring del módulo, "es la que corre de verdad". */
  astFamily: FamilyEvidence | null;
  /** OLA X (B6) — `null` ⇒ el `required` (`isInstantiatesVariant`, más abajo) falla: ni el propio detector confirmó "instantiates" NI el conteo local sobre `repeated-switch` encontró ≥2 tipos distintos. */
  instantiatesEvidence: InstantiatesEvidence | null;
}

function findMatchingFunction(ctx: HypothesisContext, finding: Finding): RepoFunctionUnit | null {
  const loc = finding.locations[0];
  return (
    ctx.repo.functions.find((f) => f.file === loc.file && f.startLine === loc.startLine && f.endLine === loc.endLine) ?? null
  );
}

function findFunctionInFile(file: FileUnit, loc: Finding["locations"][number]): FunctionUnit | null {
  return file.functions.find((f) => f.startLine === loc.startLine && f.endLine === loc.endLine) ?? null;
}

/**
 * OLA X (B6) — variantes por CONTENCIÓN de las dos funciones de arriba, sólo
 * para el ancla `repeated-switch` (ver "SEGUNDA ANCLA" en el docstring del
 * módulo): el `Finding` ancla apunta al nodo del switch, no a un método con
 * el mismo rango exacto.
 */
function findEnclosingRepoFunction(ctx: HypothesisContext, finding: Finding): RepoFunctionUnit | null {
  const loc = finding.locations[0];
  return smallestContaining(
    ctx.repo.functions.filter((f) => f.file === loc.file),
    loc,
  );
}

function findEnclosingFunctionInFile(file: FileUnit, loc: Finding["locations"][number]): FunctionUnit | null {
  return smallestContaining(file.functions, loc);
}

/**
 * OLA X (B6) — la confirmación "construye ≥2 tipos distintos" para cada
 * ancla, ver `InstantiatesEvidence`. Para `conditional-chain` es el propio
 * detector; para `repeated-switch` hace falta el CUERPO vivo del método que
 * envuelve el switch (`matchInFile`, ver arriba) — sin árbol vivo no hay
 * texto que escanear, y esta ancla nunca confirma nada por grafo (mismo
 * límite que la ancla original, declarado arriba: el camino real es AST).
 */
function computeInstantiatesEvidence(finding: Finding, matchInFile: FunctionUnit | null, graph: CodeGraph | null): InstantiatesEvidence | null {
  if (finding.kind === "repeated-switch") {
    if (!matchInFile) return null;
    const distinct = distinctConstructedTypes(matchInFile.node.text);
    return distinct.size >= 2 ? { source: "repeated-switch", distinctTypes: distinct.size } : null;
  }
  // `conditional-chain`: el propio detector sólo emite `variant:
  // "instantiates"` cuando TODAS las ramas construyen tipos distintos — el
  // mínimo (≥2) ya está garantizado por esa exigencia, sin recontar acá.
  if (finding.variant === "instantiates") return { source: "conditional-chain" };
  // OLA AI (AI6) — LA TERCERA VÍA. Corre SÓLO cuando la bandera de arriba ya
  // dijo que no, y sólo puede DEVOLVER evidencia donde antes había `null`:
  // ninguna hipótesis que hoy existe puede desaparecer por esto. Ver el
  // docstring de `chainArbolEvidence`, abajo.
  return chainArbolEvidence(matchInFile) ?? chainGrafoEvidence(matchInFile, graph);
}

/**
 * OLA AI, FRENTE AI6 — LA BANDERA DE AGUAS ARRIBA QUE DOS LENGUAJES NO
 * PUEDEN LEVANTAR NUNCA, Y LA VÍA PROPIA QUE LA RODEA.
 *
 * *** EL DEFECTO, LEÍDO EN EL CÓDIGO ANTES DE ESCRIBIR UNA LÍNEA ***
 * `isInstantiatesVariant` es el ÚNICO `required` de este camino y, para el
 * ancla `conditional-chain`, NO RE-DERIVA NADA: lee `finding.variant ===
 * "instantiates"`, una bandera que decide aguas arriba
 * `code-analyzer.ts#ladderInstantiatesTypes`, cuyo cuerpo exige dos cosas:
 *   1. `constructed.size === arms.length` — TODAS las ramas construyen, y un
 *      tipo distinto cada una; y
 *   2. su reconocedor de construcción es
 *      `\bnew\s+([A-Z]\w*)|\b([A-Z][\w:]*)\.new\b` — SÓLO `new X`
 *      (Java/C#/JS/TS) y `X.new` (Ruby).
 * **Go y Python no tienen ninguna de las dos formas**: Go construye con
 * `&T{…}` o `NewT(…)`, Python con `T(…)`. Para esos dos lenguajes
 * `ladderInstantiatesTypes` devuelve `false` SIEMPRE, el detector sólo puede
 * emitir `variant: "ladder"` (ver `detect/intra-function/conditional-chain.ts`,
 * que además devuelve `null` —ni siquiera hay hallazgo— cuando construye y ya
 * es fábrica), y **este `required` no se puede satisfacer POR CONSTRUCCIÓN**.
 * Es la misma clase de defecto que la Ola AH encontró en
 * `extract-method.ts#variosPasosSeparados`: la compuerta pide algo que la
 * gramática del caso hace imposible.
 *
 * MEDIDO, sobre la traza real de los 21 repos (informe AI6 §4): de los
 * hallazgos `conditional-chain` que llegan a este camino, el rol que el
 * detector escribe es `"cadena larga de condicionales"` (= `variant:
 * "ladder"`) en prácticamente todos — en los 7 repos del volcado pre-arreglo,
 * 331 de 332, incluyendo **63 de 63 en Go (hugo) y 2 de 2 en Python
 * (click)**, donde la bandera es inalcanzable.
 *
 * *** LO QUE SE PONE EN SU LUGAR, Y POR QUÉ NO ES UN CRITERIO NUEVO ***
 * La MISMA pregunta, contestada con el MISMO código que este archivo ya usa
 * desde la Ola X (B6) para el ancla `repeated-switch`:
 * `distinctConstructedTypes` sobre el cuerpo vivo de la función anclada. No
 * hay una segunda definición de "construye ≥2 tipos distintos" que pueda
 * desalinearse con la primera. Para `conditional-chain` el `Finding` ancla ES
 * el propio método (`buildConditionalChainFinding` escribe `{startLine:
 * fn.startLine, endLine: fn.endLine}`), así que el cuerpo que se escanea es
 * exactamente el de la función que tiene la escalera.
 *
 * *** LAS CUATRO CONDICIONES (scratchpad-ai6/CRITERIO.md, escritas ANTES) ***
 * 1. FUERZA — lo que Factory Method resuelve no es "una escalera larga" (eso
 *    es Strategy/State) sino UNA DECISIÓN SOBRE QUÉ TIPO CONSTRUIR embebida
 *    en la lógica. La evidencia positiva de esa fuerza es ≥2 tipos DISTINTOS
 *    construidos en posición de `return` dentro del propio cuerpo.
 * 2. ESCALA — `≥2 tipos distintos`, el MISMO piso que el archivo ya declara
 *    para la misma pregunta en la otra ancla. Con un solo tipo la escalera
 *    decide *si* construir, no *cuál*, y eso no es este patrón. La escala de
 *    la escalera ya la puso el detector-ancla (`chainLength >= threshold`) y
 *    no se vuelve a exigir acá.
 * 3. RESOLUCIÓN VERIFICADA — si la función YA ES una fábrica
 *    (`metrics.isFactoryLike`), el propio detector-ancla declara que "la
 *    escalera YA ES el método de creación, moverla sería puro churn": este
 *    camino se calla ahí. Es el mismo corte que la bandera vieja traía
 *    incorporado (`fn.chainInstantiates && !fn.isFactoryLike`) y que había
 *    que reponer al rodearla.
 * 4. EL HECHO QUE LA DECIDE, VERIFICADO ANTES DE ESCRIBIR — el cuerpo vivo:
 *    `ctx.fileAt(loc.file)` + `findFunctionInFile` (igualdad EXACTA de
 *    `(startLine, endLine)`). Verificado sobre la traza real: `withFile =
 *    true` en **332 de 332** entradas de `conditional-chain` de los 7 repos
 *    del volcado pre-arreglo (guava 90, newtonsoft-json 94, hugo 63,
 *    eslint 55, rubocop 22, nest 6, click 2). **Sin árbol vivo devuelve
 *    `null`** — nunca "no pude mirar, apruebo"
 *    (`no-permissive-required.test.ts`).
 *
 * *** LÍMITE DECLARADO ANTES DE MEDIR ***
 * `distinctConstructedTypes` reusa `RETURN_CONSTRUCTS` (las 4 formas con
 * palabra clave: `new X(`, `X.new`, `NewX(`, `&X{`) y NO el refuerzo
 * `RETURN_BARE_CALL`+`knownClasses` de `detectProduct`. O sea: **Go queda
 * cubierto** (`NewX(` y `&X{` están entre las 4) y **Python NO**. Es el mismo
 * hueco que este módulo ya declara para `repeated-switch`, no uno nuevo, y
 * está dicho acá antes de conocer un solo número de precisión.
 */
function chainArbolEvidence(matchInFile: FunctionUnit | null): InstantiatesEvidence | null {
  if (!matchInFile) return null;
  // (3) RESOLUCIÓN VERIFICADA: la escalera ya ES el método de creación.
  if (matchInFile.metrics.isFactoryLike) return null;
  const distinct = distinctConstructedTypes(matchInFile.node.text);
  return distinct.size >= 2 ? { source: "conditional-chain-arbol", distinctTypes: distinct.size } : null;
}

/**
 * OLA AI, FRENTE AI6 — LA CUARTA VÍA: EL HECHO DEL GRAFO, Y LA PREMISA FALSA
 * QUE LO TENÍA TAPADO.
 *
 * *** LA PREMISA FALSA, VERIFICADA CONTRA EL ÁRBOL ***
 * Este módulo declara, en tres lugares (el docstring de
 * `externalBypassDiscriminator`, el de `refresh` y el del propio módulo), que
 * **`build()` de esta ancla intra-function SIEMPRE recibe `graph: null`** y
 * que por eso ninguna evidencia por grafo se puede usar acá. **Eso dejó de
 * ser cierto:** `hypotheses/run.ts#rebuildHypothesesWithGraph` llama
 * `builder.build(finding, input.repo.graph, ctx)` con el grafo REAL del repo
 * y **el resultado de ESA llamada es el que se publica**
 * (`finding.hypotheses = built`). Medido sobre la traza real de este frente:
 * `withGraph = true` en el **100 %** de las entradas de este camino — guava
 * 122/122, newtonsoft-json 132/132, hugo 110/110, ShareX 95/95, sqlalchemy
 * 38/38. **No se cambió ni un docstring ajeno: se dejó de creerle a éste.**
 *
 * *** POR QUÉ EL GRAFO ES MEJOR HECHO QUE EL TEXTO PARA ESTA PREGUNTA ***
 * La arista `instantiates` **es, por contrato, "la señal que ancla Factory
 * Method"** (`graph/edges/instanciacion.ts`, primera línea de su docstring),
 * y se deriva por SONDA CENTINELA por lenguaje, no por regex. Cubre
 * exactamente lo que el reconocedor de aguas arriba no puede:
 *   · **Python** — `Foo(...)` cruzado contra `file.sets.classNodes`: el
 *     subconjunto que la tercera vía (texto) declaró, antes de medir, que NO
 *     cubría;
 *   · **Go** — `composite_literal` (`&T{}`) por sonda, sin regex;
 *   · **cualquier lenguaje** — `new x` en minúscula (medido en
 *     `lodash/test/test.js`: `new bound(...)`), invisible para
 *     `ladderInstantiatesTypes`, que exige mayúscula inicial.
 * Y **no** cuenta `Foo.create`/`Foo.build`: decisión declarada de ese módulo
 * por léxico de dominio, que se hereda tal cual. **Este archivo no inventa un
 * reconocedor de fábricas estáticas.**
 *
 * *** LAS CUATRO CONDICIONES (scratchpad-ai6/CRITERIO.md, escritas ANTES) ***
 * 1. FUERZA — la misma: la escalera decide QUÉ TIPO construir; acá el hecho
 *    es la arista tipada, no un texto.
 * 2. ESCALA — **≥2 tipos DISTINTOS** instanciados por el nodo de la función
 *    anclada; el mismo piso que las otras dos vías del archivo.
 * 3. RESOLUCIÓN VERIFICADA — el mismo corte `isFactoryLike`, y esta vía corre
 *    **última**: sólo cuando la bandera vieja Y la vía por árbol ya dijeron
 *    que no. Sólo puede SUMAR.
 * 4. EL HECHO, VERIFICADO ANTES DE ESCRIBIR — el nodo de la función se ubica
 *    con `symbolNodeId(file, symbolPath)`, el MISMO constructor de id que
 *    este archivo ya usa para `ownerId`; las aristas se leen por
 *    `graphIndexFor`, que filtra por `confidentEdges` (no ambiguas), el
 *    criterio conservador que este archivo ya aplica en todos sus otros usos
 *    del grafo. **Sin grafo, o sin nodo ubicado, devuelve `null`** — nunca
 *    "no pude mirar, apruebo".
 *
 * *** LÍMITE DECLARADO ANTES DE MEDIR ***
 * `confidentEdges` descarta las aristas `ambiguous`: si el resolutor no supo
 * fijar el destino de una instanciación, esa construcción no se cuenta.
 * Conservador a propósito, y no se toca para que suba un número.
 */
function chainGrafoEvidence(matchInFile: FunctionUnit | null, graph: CodeGraph | null): InstantiatesEvidence | null {
  if (!matchInFile || !graph) return null;
  if (matchInFile.metrics.isFactoryLike) return null;
  if (matchInFile.symbolPath.length === 0) return null;
  const nodeId = symbolNodeId(matchInFile.file, matchInFile.symbolPath);
  const idx = graphIndexFor(graph);
  if (!idx.nodeById.has(nodeId)) return null; // el nodo no se ubicó: no se afirma nada.
  const tipos = new Set<string>();
  for (const e of idx.edgesFrom.get(nodeId) ?? []) if (e.kind === "instantiates") tipos.add(e.to);
  return tipos.size >= 2 ? { source: "conditional-chain-grafo", distinctTypes: tipos.size } : null;
}

function toChainProblem(finding: Finding, ctx: HypothesisContext, graph: CodeGraph | null): ChainInstantiatesProblem {
  const loc = finding.locations[0];
  const fromRepeatedSwitch = finding.kind === "repeated-switch";
  const matchRepo = fromRepeatedSwitch ? findEnclosingRepoFunction(ctx, finding) : findMatchingFunction(ctx, finding);
  const file = ctx.fileAt(loc.file);
  const matchInFile = file ? (fromRepeatedSwitch ? findEnclosingFunctionInFile(file, loc) : findFunctionInFile(file, loc)) : null;

  const memberName = loc.symbol ?? matchInFile?.name ?? matchRepo?.name ?? "(anónima)";
  const memberArity = matchInFile ? matchInFile.metrics.parameters : (matchRepo?.metrics.parameters ?? null);
  const ownerClassName = matchInFile?.metrics.className ?? matchRepo?.metrics.className ?? null;
  // Ola 11a (P3): `matchRepo` (sin árbol, `RepoFunctionUnit`) TAMBIÉN trae
  // `symbolPath` (`Omit<FunctionUnit, "node">` — el único campo que le
  // falta es el árbol) — antes esto sólo miraba `matchInFile`, así que
  // `ownerId` quedaba SIEMPRE `null` en `refresh()` (`ctx.fileAt` ahí
  // siempre devuelve `null`, ver `hypotheses/run.ts#refreshHypotheses`).
  // `matchInFile` sigue teniendo prioridad (mismo resultado que antes de
  // esta ola cuando SÍ hay árbol vivo) — el fallback sólo se alcanza cuando
  // no lo hay, que es EXACTAMENTE el caso que `externalBypassDiscriminator`
  // necesita resolver.
  const ownerUnit = matchInFile ?? matchRepo;
  const ownerId = ownerUnit && ownerUnit.symbolPath.length >= 2 ? symbolNodeId(ownerUnit.file, ownerUnit.symbolPath.slice(0, -1)) : null;

  const astFamily =
    file && matchInFile && ownerClassName ? computeAstFamily(file, file.sets, ownerClassName, memberName, memberArity) : null;

  return {
    variant: finding.variant,
    functionName: memberName,
    chainLength: finding.trigger[0].value,
    hasNullCheckBranch: matchRepo ? matchRepo.metrics.chainHasNullCheck : null,
    ownerId,
    memberArity,
    astFamily,
    instantiatesEvidence: computeInstantiatesEvidence(finding, matchInFile, graph),
  };
}

/**
 * REQUERIDO: el candidato tiene que tener CONFIRMADO que construye ≥2 tipos
 * distintos — por `conditional-chain` (sub-forma "instantiates": el propio
 * detector exige que TODAS las ramas construyan tipos distintos) o, OLA X
 * (B6), por `repeated-switch` (el cuerpo del método que envuelve el switch
 * construye ≥2 tipos distintos entre sus `case`s — ver
 * `computeInstantiatesEvidence`/`distinctConstructedTypes`, sin exigir que
 * TODAS las ramas construyan). Sin este check, una escalera/switch genérico
 * que no construye tipos pasaría por Factory Method.
 */
const isInstantiatesVariant: Check<ChainInstantiatesProblem, CodeGraph | null> = {
  id: "is-instantiates-variant",
  describe:
    'Confirmado que el candidato construye ≥2 tipos DISTINTOS — sub-forma "instantiates" de `conditional-chain`; o, cuando esa bandera no alcanzó, conteo local sobre el cuerpo vivo de la propia función anclada, siempre que no sea ya una fábrica (OLA AI/AI6, ver `chainArbolEvidence`); o, para `repeated-switch`, el mismo conteo sobre el cuerpo de la función que contiene el switch.',
  run(problem) {
    const ev = problem.instantiatesEvidence;
    if (!ev) {
      return {
        holds: false,
        evidence: `Sub-forma "${problem.variant ?? "(sin variant)"}" — no se confirmó que el candidato construya ≥2 tipos distintos; Factory Method no aplica acá.`,
      };
    }
    if (ev.source === "conditional-chain") {
      return {
        holds: true,
        evidence: `Sub-forma "instantiates" confirmada (cadena de ${problem.chainLength} ramas, cada una construye un tipo distinto).`,
      };
    }
    if (ev.source === "conditional-chain-grafo") {
      // OLA AI (AI6) — ver `chainGrafoEvidence`.
      return {
        holds: true,
        evidence:
          `La bandera del detector no alcanzó (sub-forma "${problem.variant ?? "(sin variant)"}") y el texto del cuerpo tampoco, pero ` +
          `el GRAFO tiene ${ev.distinctTypes} aristas \`instantiates\` no ambiguas desde "${problem.functionName}" —la función que tiene la ` +
          `cadena de ${problem.chainLength} ramas— hacia tipos DISTINTOS, y la función no es ella misma una fábrica: la escalera decide QUÉ TIPO construir.`,
      };
    }
    if (ev.source === "conditional-chain-arbol") {
      // OLA AI (AI6) — ver `chainArbolEvidence`.
      return {
        holds: true,
        evidence:
          `La bandera del detector no alcanzó (sub-forma "${problem.variant ?? "(sin variant)"}"), pero el cuerpo vivo de ` +
          `"${problem.functionName}" —la función que tiene la cadena de ${problem.chainLength} ramas— construye ${ev.distinctTypes} tipos ` +
          `DISTINTOS en posición de \`return\`, y la función no es ella misma una fábrica: la escalera decide QUÉ TIPO construir.`,
      };
    }
    return {
      holds: true,
      evidence: `El switch repetido "${problem.functionName}" contiene, entre sus \`case\`s, construcciones de ${ev.distinctTypes} tipos distintos (\`new\`/equivalente) — selección de tipo, no una escalera de condiciones genérica.`,
    };
  },
};

const threeOrMoreBranches: Check<ChainInstantiatesProblem, CodeGraph | null> = {
  id: "three-or-more-branches",
  describe: `≥${THREE_OR_MORE_BRANCHES} ramas (más allá del mínimo estructural de 2 que ya garantiza "instantiates") — familia de tipos más rica.`,
  run(problem) {
    const holds = problem.chainLength >= THREE_OR_MORE_BRANCHES;
    return { holds, evidence: `${problem.chainLength} ramas en la cadena.` };
  },
};

const cleanTypeDispatch: Check<ChainInstantiatesProblem, CodeGraph | null> = {
  id: "clean-type-dispatch",
  describe: "La cadena no mezcla una rama de chequeo contra nulo/ausente junto con la construcción de tipos (dispatch de tipo puro).",
  run(problem) {
    if (problem.hasNullCheckBranch === null) {
      return {
        holds: false,
        evidence: "No se pudo emparejar con la función analizada (archivo+líneas) para leer `chainHasNullCheck`; no confirmado.",
      };
    }
    const holds = !problem.hasNullCheckBranch;
    return {
      holds,
      evidence: holds
        ? "Ninguna rama de la cadena compara contra nulo/ausente: dispatch de tipo puro."
        : "Al menos una rama de la cadena compara contra nulo/ausente — posible guard defensivo mezclado con la selección de tipo.",
    };
  },
};

/**
 * Ola 11a (P3) — EL PUENTEO, expresado como DISCRIMINADOR (ver el docstring
 * del módulo, sección "`aplicado-eludido` NO se produce..."). `holds: true`
 * ⇒ algún cliente, DISTINTO de la base y de los propios hermanos, llama por
 * `calls` directamente a un `Si.m` de la familia — evidencia de puenteo
 * real, mostrada en `checks`/`discriminators` sin tocar `state`.
 *
 * Sólo evaluable con `graph` real: `build()` (este ancla, intra-function)
 * SIEMPRE recibe `graph: null` (ver docstring del módulo) — acá se declara
 * "no evaluable", nunca se finge `false`. El camino real es `refresh()`
 * (más abajo), con el grafo repo-completo de `crossAnalyze`.
 */
const externalBypassDiscriminator: Check<ChainInstantiatesProblem, CodeGraph | null> = {
  id: "cliente-externo-saltea-base",
  describe:
    "Un cliente EXTERNO llama por 'calls' directamente a un Si.m de la familia, salteando B.m — evidencia de puenteo, sólo verificable con el grafo repo-completo (ver refresh()).",
  run(problem, graph) {
    if (!graph || !problem.ownerId) {
      return {
        holds: false,
        evidence:
          "sin grafo repo-completo todavía (build() de este ancla intra-function siempre recibe graph: null, ver docstring del módulo) o sin owner resuelto: este check sólo puede confirmar algo desde refresh(), con el grafo real que arma crossAnalyze.",
      };
    }
    const idx = graphIndexFor(graph);
    const gi = asGraphIndex(idx);
    const bases = (idx.edgesFrom.get(problem.ownerId) ?? []).filter((e) => BASE_EDGE_KINDS.has(e.kind)).map((e) => e.to);

    for (const baseId of bases) {
      const siblingIds = idx.subtypesByBase.get(baseId) ?? [];
      if (siblingIds.length < 2) continue;

      const memberIds: string[] = [];
      for (const sId of siblingIds) {
        const sig = memberSignatures(gi, sId).find((m) => m.name === problem.functionName && m.arity === problem.memberArity);
        if (!sig) continue;
        const mId = memberNodeId(idx, sId, problem.functionName);
        if (mId) memberIds.push(mId);
      }
      if (memberIds.length < 2) continue; // sin ≥2 hermanos localizables no hay "familia" de la que hablar de puenteo.

      const baseMemberId = memberNodeId(idx, baseId, problem.functionName);
      for (const mId of memberIds) {
        for (const e of idx.edgesTo.get(mId) ?? []) {
          if (e.kind !== "calls") continue;
          if (baseMemberId && e.from === baseMemberId) continue; // dispatch legítimo A TRAVÉS de la base — no es puenteo.
          if (memberIds.includes(e.from)) continue; // un hermano llamando a otro hermano — no es "cliente externo" (simplificación declarada, no adivinada).
          return {
            holds: true,
            evidence: `un cliente ("${e.from}") llama por 'calls' directamente a "${problem.functionName}" en un miembro de la familia (base "${baseId}"), sin pasar por el método base — puenteo real, confirmado con la arista 'calls' del grafo repo-completo.`,
          };
        }
      }
    }
    return {
      holds: false,
      evidence: "ninguna arista 'calls' hacia un miembro Si.m de esta familia viene de fuera de la base o de otro hermano — sin evidencia de puenteo.",
    };
  },
};

/**
 * EL EXCLUDER — Ola 10: reemplaza el fusionado léxico (`named-as-factory` OR
 * `chain-is-whole-method`) por una escalera de TRES niveles que sí distingue
 * las tres formas (ver docstring del módulo):
 *   1. `redeclaredWithProduct` (estructural, reemplaza `named-as-factory`):
 *      ¿≥2 tipos redeclaran el miembro, cada uno construyendo un producto
 *      DISTINTO? (grafo si lo hay — inerte hoy, ver arriba — si no, AST).
 *   2. `baseCheck` (sólo si (1) encontró una base común): ¿esa base es
 *      abstracta (no construye nada ella misma)? Confirmado ⇒ COMPLETA.
 *   3. `chainIsWholeMethod` (heredado, sin cambios, siempre `false` hoy —
 *      LÍMITE MEDIDO 2).
 * `state`: base abstracta confirmada ⇒ `ya-aplicado` (nunca sugiere,
 * requisito 1). Si no, (1) sin base O (3) ⇒ `parcial`. Ninguno ⇒ `ausente`.
 */
function appliedState(problem: ChainInstantiatesProblem, graph: CodeGraph | null): AppliedStateResult {
  const graphFamily = graph && problem.ownerId ? computeGraphFamily(graph, problem.ownerId, problem.functionName, problem.memberArity) : null;
  const family = graphFamily ?? problem.astFamily;

  const redeclared = family !== null && family.variantsWithProduct >= 2 && family.distinctProducts >= 2;
  const redeclaredCheck: PatternHypothesisCheck = {
    label:
      'El miembro contenedor construye un producto y ese mismo (nombre, aridad) se redeclara, con producto DISTINTO, en ≥2 tipos — reemplazo estructural de "nombre de fábrica".',
    passed: redeclared,
    why: redeclared
      ? `${family!.variantsWithProduct} tipo(s) redeclaran "${problem.functionName}" con producto propio (${family!.distinctProducts} distinto(s) entre ellos).`
      : "No se encontraron ≥2 tipos que redeclaren este miembro con productos distintos, ni por grafo (instantiates/memberSignatures — inerte hoy para esta ancla, ver docstring) ni por AST del archivo vivo.",
    role: "applied",
  };

  // LÍMITE MEDIDO 2, sin cambios desde la Ola 6-9: no evaluable hoy.
  const chainIsWholeMethod = false;
  const wholeMethodCheck: PatternHypothesisCheck = {
    label: "El cuerpo del método es, en los hechos, solo la cadena (0-1 statements fuera de ella) — estructural, no depende del nombre.",
    passed: chainIsWholeMethod,
    why:
      "No evaluable con los datos disponibles hoy: requiere contar, en el AST vivo, los statements hermanos del cuerpo que " +
      "NO sean el nodo de la cadena — ni `HypothesisContext` ni `RepoFunctionUnit` exponen ese conteo. Brecha declarada, " +
      "no un `false` silencioso.",
    role: "applied",
  };

  const hasAbstractBase = redeclared && family !== null && family.baseLabel !== null && family.hasAbstractCommonBase;
  const checks: PatternHypothesisCheck[] = [redeclaredCheck];
  if (redeclared && family !== null && family.baseLabel !== null) {
    checks.push({
      label: `Los tipos que redeclaran el miembro comparten una base común ("${family.baseLabel}") que NO construye ningún producto propio (abstracta) — la forma COMPLETA de Factory Method.`,
      passed: hasAbstractBase,
      why: hasAbstractBase
        ? `Base "${family.baseLabel}" común confirmada${family.baseMemberUnconfirmed ? " (su propio miembro no se pudo ubicar — probablemente abstracto/sin cuerpo, hueco de extracción declarado, tratado como abstracto por defecto)" : ", y su propio miembro no construye nada"}. Ver el discriminador "cliente-externo-saltea-base" para evidencia (sólo confirmable desde refresh(), con grafo real) de si algún cliente EXTERNO llama directamente a un subtipo salteando la base — 'aplicado-eludido' se decidió, esta ola, expresar como discriminador informativo, no como cambio de state (ver docstring del módulo).`
        : `Base "${family.baseLabel}" común, pero su propio miembro TAMBIÉN construye un producto — no es abstracta; esto no es la forma COMPLETA.`,
      role: "applied",
    });
  }
  checks.push(wholeMethodCheck);

  const state: PatternState = hasAbstractBase ? "ya-aplicado" : redeclared || chainIsWholeMethod ? "parcial" : "ausente";
  return { state, checks };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * OLA AE (frente AE8) — TERCERA ANCLA: `homonymous-divergent-construction`
 *
 * TODO LO QUE SIGUE ES CÓDIGO NUEVO DETRÁS DE
 * `if (problem.kind === "homonymous-divergent-construction")`. **No toca ni un
 * `required`, ni un discriminador, ni una rama de `appliedState`, ni un umbral
 * del camino viejo.** El array `anchors` SUMA; las dos anclas de antes siguen
 * exactamente donde estaban, con sus números publicados en el informe AE8 §1 y
 * sin tocar.
 *
 * POR QUÉ HIZO FALTA, CON EL NÚMERO: medido por AE8 sobre volcados propios de
 * las dos poblaciones (13 bibliotecas + 8 aplicaciones), **977 hallazgos de las
 * dos anclas viejas producen 7 hipótesis de Factory Method: 970 mueren en
 * `isInstantiatesVariant`, el 99,3 %.** La causa está aguas arriba
 * (`code-analyzer.ts#ladderInstantiatesTypes`, el PIDO heredado de W1/A2 que
 * sigue sin dueño) y este archivo no puede tocarla — así que entra por otro
 * lado, con un ancla que nombra la FUERZA en vez de un síntoma sintáctico.
 *
 * LA FUERZA: *varios tipos emparentados escriben, cada uno por su cuenta, el
 * MISMO procedimiento, y lo ÚNICO que varía entre ellos es QUÉ TIPO CONCRETO
 * CONSTRUYEN* — ver el docstring de
 * `detect/inter-file/homonymous-divergent-construction.ts`.
 *
 * POR QUÉ LAS CONSULTAS SON CRUDAS Y NO PASAN POR `graphIndexFor`: ese índice
 * usa `confidentEdges`, que descarta por contrato (`CONTRATO-F9.md` §4.5) toda
 * arista `provenance: "ambiguous"`, y este ancla vive sobre ellas — censo
 * propio de AE8 sobre los 21 volcados de grafo: de las `calls`, **134.029
 * ambiguas contra 80.307 resueltas**; de las `satisfies`, **15.664 ambiguas +
 * 7.034 inferidas y CERO resueltas**. Es el mismo camino, y por el mismo
 * motivo, que `facade.ts#outgoingCallCount` recorre desde la Ola V y que AD4
 * tuvo que volver a abrir: *la existencia de la llamada es un hecho del CÓDIGO
 * y sólo su DESTINO es lo que el resolutor no supo fijar*. **Las consultas
 * crudas de abajo las usa SÓLO el camino de esta ancla.**
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Aristas "es-un" que hacen familia para esta ancla — las MISMAS cuatro que
 *  declara el detector (`needsAnyEdge`). No se reusa `BASE_EDGE_KINDS` (arriba,
 *  del camino viejo) porque aquélla no incluye `mixes-in`, y cambiarla movería
 *  el camino viejo. */
const AE8_FAMILY_EDGE_KINDS: ReadonlySet<string> = new Set(["extends", "implements", "mixes-in", "satisfies"]);

/** Piso de procedimiento propio: el mismo `pasosPorCopia` (3) que el detector
 *  declara y que `hypotheses/template-method.ts` hereda como `MIN_SEQUENCE_LEN`
 *  para la misma pregunta ("¿este cuerpo tiene secuencia de llamadas?"). */
const AE8_MIN_STEPS_PER_COPY = 3;
/** Piso de procedimiento COMPARTIDO: el mismo `pasosComunes` (2) del detector. */
const AE8_MIN_COMMON_STEPS = 2;

interface RedeclaredConstructionProblem {
  readonly memberName: string;
  /** Declaraciones hermanas que el ancla marcó, resueltas contra el grafo. */
  readonly copies: number;
  /** `null` ⇒ no había grafo con qué mirar: ningún `required` aprueba por eso. */
  readonly distinctProducts: number | null;
  readonly creationDiverges: boolean | null;
  readonly minStepsPerCopy: number | null;
  readonly commonSteps: number | null;
  /** ¿alguna copia DELEGA en un miembro de creación dedicado que la familia ya tiene? */
  readonly delegatesToExistingHook: boolean | null;
  /** ¿algún ancestro declara ya, él mismo, un miembro de creación dedicado? */
  readonly ancestorHasCreationMember: boolean | null;
  /** ¿algún ancestro declara ya el MISMO miembro homónimo? — el peldaño `parcial`. */
  readonly ancestorDeclaresMember: boolean | null;
  /** Etiqueta del ancestro que reúne al grupo, para la evidencia. */
  readonly ancestorLabel: string | null;
  /** ¿las copias viven en >= 2 archivos distintos? */
  readonly crossesFiles: boolean;
  /** Cuántas RUTAS DE SÍMBOLO distintas tienen los dueños de las copias (Ola AM, AM4).
   *  `null` ⇒ no había grafo con qué mirar: ningún `required` aprueba por eso. */
  readonly distinctOwnerPaths: number | null;
  /** ¿los productos construidos comparten a su vez un ancestro (familia de productos)? */
  readonly productsShareAncestor: boolean | null;
}

/** Índice CRUDO (con las ambiguas) — ver el bloque de arriba. Sólo lo usa esta ancla. */
interface RawIdx {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly ownerOf: ReadonlyMap<string, string>;
  readonly membersOf: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  readonly basesOf: ReadonlyMap<string, readonly string[]>;
  readonly productsOf: ReadonlyMap<string, ReadonlySet<string>>;
  readonly stepsOf: ReadonlyMap<string, ReadonlySet<string>>;
}

const AE8_RAW_CACHE = new WeakMap<CodeGraph, RawIdx>();

function rawIndexFor(graph: CodeGraph): RawIdx {
  const cached = AE8_RAW_CACHE.get(graph);
  if (cached) return cached;
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (n.kind === "symbol" && !nodeById.has(n.id)) nodeById.set(n.id, n);
  const ownerOf = new Map<string, string>();
  const membersOf = new Map<string, Map<string, string[]>>();
  const basesOf = new Map<string, string[]>();
  const productsOf = new Map<string, Set<string>>();
  const stepsOf = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (e.kind === "contains") {
      const member = nodeById.get(e.to);
      if (!member || member.family !== "function-like" || !nodeById.has(e.from)) continue;
      const name = member.symbolPath[member.symbolPath.length - 1];
      if (!name) continue;
      ownerOf.set(e.to, e.from);
      let byName = membersOf.get(e.from);
      if (!byName) {
        byName = new Map();
        membersOf.set(e.from, byName);
      }
      const list = byName.get(name);
      if (list) list.push(e.to);
      else byName.set(name, [e.to]);
    } else if (AE8_FAMILY_EDGE_KINDS.has(e.kind)) {
      const list = basesOf.get(e.from);
      if (list) list.push(e.to);
      else basesOf.set(e.from, [e.to]);
    } else if (e.kind === "instantiates") {
      const set = productsOf.get(e.from);
      if (set) set.add(e.to);
      else productsOf.set(e.from, new Set([e.to]));
    } else if (e.kind === "calls") {
      const set = stepsOf.get(e.from);
      if (set) set.add(e.to);
      else stepsOf.set(e.from, new Set([e.to]));
    }
  }
  const idx: RawIdx = { nodeById, ownerOf, membersOf, basesOf, productsOf, stepsOf };
  AE8_RAW_CACHE.set(graph, idx);
  return idx;
}

/** El miembro de creación DEDICADO ya existente en un tipo: construye algo y no
 *  tiene procedimiento propio (< `AE8_MIN_STEPS_PER_COPY` llamadas). */
function dedicatedCreationMembers(idx: RawIdx, ownerId: string, exceptName: string): readonly string[] {
  const out: string[] = [];
  for (const [name, ids] of idx.membersOf.get(ownerId) ?? []) {
    if (name === exceptName) continue;
    for (const id of ids) {
      if ((idx.productsOf.get(id)?.size ?? 0) === 0) continue;
      if ((idx.stepsOf.get(id)?.size ?? 0) >= AE8_MIN_STEPS_PER_COPY) continue;
      out.push(id);
    }
  }
  return out;
}

function toRedeclaredProblem(finding: Finding, graph: CodeGraph | null): RedeclaredConstructionProblem {
  const memberName = finding.variant ?? finding.locations[0]?.symbol ?? "(sin nombre)";
  const declLocs = finding.locations.filter((l) => (l.role ?? "").startsWith(ROLE_REDECLARES));
  const ancestorLocs = finding.locations.filter((l) => (l.role ?? "").startsWith(ROLE_ANCESTOR));
  const crossesFiles = new Set(declLocs.map((l) => l.file)).size >= 2;
  const base: RedeclaredConstructionProblem = {
    memberName,
    copies: declLocs.length,
    distinctProducts: null,
    creationDiverges: null,
    minStepsPerCopy: null,
    commonSteps: null,
    delegatesToExistingHook: null,
    ancestorHasCreationMember: null,
    ancestorDeclaresMember: null,
    ancestorLabel: ancestorLocs[0]?.symbol ?? null,
    crossesFiles,
    productsShareAncestor: null,
    distinctOwnerPaths: null,
  };
  if (!graph) return base;

  const idx = rawIndexFor(graph);
  const declIds: string[] = [];
  for (const loc of declLocs) {
    for (const [id, node] of idx.nodeById) {
      if (node.family !== "function-like" || node.file !== loc.file || node.startLine !== loc.startLine) continue;
      if (node.symbolPath[node.symbolPath.length - 1] !== memberName) continue;
      declIds.push(id);
      break;
    }
  }
  if (declIds.length < 2) return base;

  const productSets = declIds.map((id) => idx.productsOf.get(id) ?? new Set<string>());
  const allProducts = new Set<string>();
  for (const set of productSets) for (const p of set) allProducts.add(p);
  const signatures = new Set(productSets.map((s) => [...s].sort().join(" ")));
  const stepSets = declIds.map((id) => idx.stepsOf.get(id) ?? new Set<string>());
  let common: Set<string> | null = null;
  for (const set of stepSets) {
    if (common === null) common = new Set(set);
    else for (const s of [...common]) if (!set.has(s)) common.delete(s);
  }

  const owners = declIds.map((id) => idx.ownerOf.get(id)).filter((o): o is string => o !== undefined);
  // OLA AM (frente AM4) — cuántas RUTAS DE SÍMBOLO distintas hay entre los dueños.
  // `owners` son ids de NODO, y dos copias del mismo tipo en dos árboles espejo
  // tienen ids distintos (el id lleva el archivo): contar ids no responde
  // "¿cuántos TIPOS hay?". La ruta de símbolo sí. Ver `dosTiposHermanos`.
  const ownerPaths = new Set(owners.map((o) => idx.nodeById.get(o)?.symbolPath.join(".") ?? o));
  const bases = new Set<string>();
  for (const o of owners) for (const b of idx.basesOf.get(o) ?? []) bases.add(b);
  // LOS GANCHOS CANDIDATOS: miembros de creación DEDICADOS (construyen y no
  // tienen procedimiento propio) de los propios hermanos Y de sus ancestros.
  //
  // DEFECTO MEDIDO Y CORREGIDO, no un `false` de conveniencia: la primera
  // versión hacía fallar el `required` con SÓLO comprobar que el ancestro
  // declarara ALGÚN miembro de creación dedicado, sin exigir que las copias
  // pasaran por él. Medido sobre el corpus: en guava, el ancestro
  // `AbstractNavigableMap` declara `navigableKeySet` y `descendingMap` —dos
  // miembros chicos que construyen algo y no tienen nada que ver con `subMap`—
  // **y con eso 7 de los 8 hallazgos del ancla se quedaban SIN hipótesis**. La
  // pregunta correcta, y la que la intención del check siempre dijo, es si el
  // punto de creación de ESTA operación ya existe, y eso sólo se puede afirmar
  // cuando las copias DELEGAN en él. Un gancho que nadie usa no resuelve nada.
  const hookIds = new Set<string>();
  for (const o of owners) for (const h of dedicatedCreationMembers(idx, o, memberName)) hookIds.add(h);
  let ancestorHasCreationMember = false;
  let ancestorDeclaresMember = false;
  for (const b of bases) {
    if ((idx.membersOf.get(b)?.get(memberName)?.length ?? 0) > 0) ancestorDeclaresMember = true;
    const ancestorHooks = dedicatedCreationMembers(idx, b, memberName);
    if (ancestorHooks.length > 0) ancestorHasCreationMember = true;
    for (const h of ancestorHooks) hookIds.add(h);
  }
  const ancestorLabel =
    base.ancestorLabel ?? [...bases].map((b) => idx.nodeById.get(b)?.symbolPath.at(-1) ?? b).sort()[0] ?? null;

  // ¿Los productos comparten a su vez un ancestro? Es la firma clásica de
  // Factory Method (una familia de productos detrás de una familia de
  // creadores), y por eso es DISCRIMINADOR y no `required`: un producto sin
  // familia declarada sigue siendo una elección de tipo soldada.
  const productAncestors = new Map<string, number>();
  for (const p of allProducts) for (const b of idx.basesOf.get(p) ?? []) productAncestors.set(b, (productAncestors.get(b) ?? 0) + 1);

  return {
    ...base,
    copies: declIds.length,
    distinctProducts: allProducts.size,
    creationDiverges: signatures.size >= 2,
    minStepsPerCopy: Math.min(...stepSets.map((s) => s.size)),
    commonSteps: common ? common.size : 0,
    delegatesToExistingHook: hookIds.size > 0 && stepSets.some((s) => [...s].some((step) => hookIds.has(step))),
    ancestorHasCreationMember,
    ancestorDeclaresMember,
    ancestorLabel,
    productsShareAncestor: [...productAncestors.values()].some((n) => n >= 2),
    distinctOwnerPaths: ownerPaths.size,
  };
}

/**
 * OLA AM (frente AM4) — REQUERIDO 0: *"hay MÁS DE UN TIPO hermano"*.
 *
 * QUÉ INTENCIÓN VERIFICA. La condición (2) del ancla
 * (`detect/inter-file/homonymous-divergent-construction.ts`) pide que
 * `>= hermanos` TIPOS declaren un miembro con el mismo nombre, pero los cuenta
 * por DECLARACIÓN: `copies` es `declLocs.length`. Cuando las N declaraciones
 * cuelgan de dueños cuya RUTA DE SÍMBOLO es la misma, el grafo no acredita N
 * tipos hermanos — acredita UNA ruta de tipo vista N veces (copias espejo del
 * árbol de fuentes, `partial class`, código generado). Y ahí la mitigación del
 * patrón no tiene nada que resolver: aislar la creación en un punto redefinible
 * del ancestro presupone DOS subtipos entre los que diferir la decisión, y no
 * los hay.
 *
 * QUÉ RECONOCE: familias con al menos dos rutas de tipo distintas entre los
 * dueños de las declaraciones.
 * QUÉ NO RECONOCE: un grupo cuyas N declaraciones tienen todas el mismo dueño
 * por ruta de símbolo.
 *
 * CASO TESTIGO, medido sobre el banco: `guava
 * android/guava/src/com/google/common/util/concurrent/AbstractFutureState.java:115`
 * y `guava/src/.../AbstractFutureState.java:118` son el MISMO
 * `AbstractFutureState.blockingGet` en las dos copias espejo del árbol de guava.
 *
 * LIMITACIÓN DECLARADA, no escondida: la ruta de símbolo no lleva paquete ni
 * namespace en todos los lenguajes, así que dos tipos GENUINAMENTE distintos
 * con el mismo nombre en paquetes distintos también quedan afuera. Medido sobre
 * el banco de esta celda pasa en UN caso —`gitea modules/indexer/code/bleve` y
 * `.../elasticsearch`, dos `Indexer` distintos— y ese caso ya estaba juzgado
 * `falso`, así que la medición NO puede separar ahí "correcto por la razón
 * correcta" de "correcto por suerte". Queda escrito.
 *
 * NINGÚN NÚMERO NUEVO: el piso es 2, el mismo `>= 2` que el propio
 * `eachSiblingPicksItsProduct` ya exige a `copies`, aplicado a la unidad que la
 * condición (2) del ancla nombra (TIPOS, no declaraciones).
 */
const dosTiposHermanos: Check<RedeclaredConstructionProblem, CodeGraph | null> = {
  id: "dos-tipos-hermanos",
  describe:
    "Los dueños de las declaraciones homónimas son al menos DOS rutas de símbolo distintas — con una sola ruta no hay dos subtipos entre los que diferir la creación.",
  run(problem) {
    if (problem.distinctOwnerPaths === null) {
      return {
        holds: false,
        evidence: "sin grafo repo-completo no hay forma de leer la ruta de símbolo de los dueños de cada declaración; este check queda en falso y la hipótesis no se emite.",
      };
    }
    const holds = problem.distinctOwnerPaths >= 2;
    return {
      holds,
      evidence: holds
        ? `las ${problem.copies} declaraciones de "${problem.memberName}" cuelgan de ${problem.distinctOwnerPaths} rutas de tipo distintas.`
        : `las ${problem.copies} declaraciones de "${problem.memberName}" cuelgan de UNA sola ruta de tipo: no son hermanos, es la misma declaración vista ${problem.copies} veces (copia espejo del árbol, \`partial class\` o código generado).`,
    };
  },
};

/**
 * REQUERIDO 1 — *"lo que varía entre los hermanos ES la creación"*. Vuelve a
 * preguntarlo contra el grafo CRUDO, símbolo por símbolo: >= 2 declaraciones
 * con `instantiates` propia, >= 2 productos distintos entre ellas, y los
 * conjuntos construidos NO todos iguales. Es la condición que separa Factory
 * Method de Template Method (donde lo que varía es un PASO) y de Pull Up Method
 * (donde no varía nada). Sin grafo con qué mirar ⇒ `holds: false`, nunca
 * aprobar por no poder evaluar.
 */
const eachSiblingPicksItsProduct: Check<RedeclaredConstructionProblem, CodeGraph | null> = {
  id: "cada-hermano-elige-su-producto",
  describe:
    "Cada hermano que redeclara el miembro construye un tipo concreto ÉL MISMO, hay ≥2 tipos distintos entre ellos y los conjuntos construidos no son todos iguales — la variación entre hermanos ES la creación.",
  run(problem) {
    if (problem.distinctProducts === null || problem.creationDiverges === null) {
      return {
        holds: false,
        evidence:
          "sin grafo repo-completo no hay forma de leer qué construye cada hermano (aristas 'instantiates'); este check queda en falso y la hipótesis no se emite.",
      };
    }
    const holds = problem.copies >= 2 && problem.distinctProducts >= 2 && problem.creationDiverges;
    return {
      holds,
      evidence: holds
        ? `${problem.copies} hermanos redeclaran "${problem.memberName}" y construyen entre ellos ${problem.distinctProducts} tipos distintos, con conjuntos que difieren entre sí.`
        : `${problem.copies} hermanos, ${problem.distinctProducts} tipo(s) construido(s) distinto(s)${problem.creationDiverges ? "" : " y todos construyen exactamente lo mismo"}: la creación no varía, así que la mitigación sería subir el método entero (Pull Up Method), no un punto de creación redefinible.`,
    };
  },
};

/**
 * REQUERIDO 2 — *"hay un procedimiento duplicado que la mitigación sube al
 * ancestro"*. ES LA CONDICIÓN DE ESCALA: si cada copia fuera sólo la
 * construcción, no habría nada que subir Y ese miembro YA SERÍA, él mismo, el
 * punto de creación redefinible que el patrón pide — proponerle Factory Method
 * sería proponérselo a un Factory Method. Es exactamente el modo de falla que
 * la Ola AC midió sobre State (7 máquinas de estados reales, 6 con ramas de una
 * línea).
 */
const duplicatedProcedureToHoist: Check<RedeclaredConstructionProblem, CodeGraph | null> = {
  id: "procedimiento-duplicado-que-subir",
  describe: `Cada copia ejecuta ≥${AE8_MIN_STEPS_PER_COPY} pasos propios y ≥${AE8_MIN_COMMON_STEPS} de ellos son los MISMOS en todas — hay procedimiento duplicado que subir, no sólo una construcción.`,
  run(problem) {
    if (problem.minStepsPerCopy === null || problem.commonSteps === null) {
      return {
        holds: false,
        evidence: "sin grafo repo-completo no hay aristas 'calls' con las que medir el procedimiento de cada copia; este check queda en falso.",
      };
    }
    const holds = problem.minStepsPerCopy >= AE8_MIN_STEPS_PER_COPY && problem.commonSteps >= AE8_MIN_COMMON_STEPS;
    return {
      holds,
      evidence: holds
        ? `la copia más chica ejecuta ${problem.minStepsPerCopy} pasos y las ${problem.copies} comparten ${problem.commonSteps}: hay un procedimiento común que hoy vive escrito ${problem.copies} veces.`
        : `la copia más chica ejecuta ${problem.minStepsPerCopy} paso(s) y sólo ${problem.commonSteps} son comunes a todas — sin procedimiento duplicado no hay nada que subir al ancestro, y un miembro que sólo construye YA ES un punto de creación redefinible.`,
    };
  },
};

/**
 * REQUERIDO 3 — RESOLUCIÓN VERIFICADA: *"si el punto de creación redefinible ya
 * existiera Y ESTAS COPIAS PASARAN POR ÉL, la propuesta correcta sería 'usá el
 * que hay', que es OTRA refactorización"*. Los ganchos candidatos son los
 * miembros de creación DEDICADOS (construyen y no tienen procedimiento propio)
 * tanto de los hermanos como de sus ancestros.
 *
 * POR QUÉ EXIGE LA DELEGACIÓN Y NO LA MERA EXISTENCIA — medido, no supuesto:
 * la primera versión fallaba con sólo comprobar que el ancestro declarara ALGÚN
 * miembro de creación dedicado. En guava, `AbstractNavigableMap` declara
 * `navigableKeySet` y `descendingMap` (dos miembros chicos que construyen algo
 * y no tienen nada que ver con `subMap`), **y con eso 7 de los 8 hallazgos del
 * ancla se quedaban sin hipótesis**. Un gancho que estas copias NO usan no
 * resuelve nada: la creación sigue soldada adentro de cada una.
 */
const noExistingCreationPoint: Check<RedeclaredConstructionProblem, CodeGraph | null> = {
  id: "sin-punto-de-creacion-redefinible",
  describe:
    "Ninguna de las copias delega su construcción en un miembro de creación dedicado que la familia (hermanos o ancestros) ya tenga — el punto de creación que el patrón pide no está en uso todavía.",
  run(problem) {
    if (problem.delegatesToExistingHook === null) {
      return {
        holds: false,
        evidence: "sin grafo repo-completo no hay forma de mirar si la familia ya tiene un miembro de creación dedicado; este check queda en falso.",
      };
    }
    const holds = !problem.delegatesToExistingHook;
    return {
      holds,
      evidence: holds
        ? `ninguna de las ${problem.copies} copias delega su construcción en un miembro de creación dedicado de la familia${problem.ancestorHasCreationMember ? ` (el ancestro "${problem.ancestorLabel ?? "(sin nombre)"}" declara alguno, pero estas copias no pasan por él: la creación sigue soldada adentro de cada una)` : ""}.`
        : "alguna de las copias ya delega en un miembro de creación dedicado de la familia: el punto de creación existe y está en uso, así que la propuesta correcta es usarlo, no crearlo.",
    };
  },
};

const threeOrMoreSiblings: Check<RedeclaredConstructionProblem, CodeGraph | null> = {
  id: "tres-o-mas-hermanos",
  describe: "≥3 hermanos repiten el procedimiento (más allá del mínimo estructural de 2) — más trabajo que el punto de creación único ahorra.",
  run(problem) {
    const holds = problem.copies >= THREE_OR_MORE_BRANCHES;
    return { holds, evidence: `${problem.copies} hermanos redeclaran "${problem.memberName}".` };
  },
};

const repetitionCrossesFiles: Check<RedeclaredConstructionProblem, CodeGraph | null> = {
  id: "la-repeticion-cruza-el-archivo",
  describe:
    "Las copias viven en ≥2 archivos distintos — subir el procedimiento al ancestro es la mitigación más barata; dentro de un solo archivo un ayudante privado ya lo resolvería.",
  run(problem) {
    return {
      holds: problem.crossesFiles,
      evidence: problem.crossesFiles
        ? "las copias están repartidas en más de un archivo: no hay un ayudante privado que las unifique sin tocar la familia."
        : "todas las copias viven en el mismo archivo: una función privada de ese archivo las unifica sin tocar la jerarquía.",
    };
  },
};

const productsFormAFamily: Check<RedeclaredConstructionProblem, CodeGraph | null> = {
  id: "los-productos-tambien-son-familia",
  describe: "Los tipos construidos comparten a su vez un ancestro — la firma clásica de Factory Method: una familia de productos detrás de una familia de creadores.",
  run(problem) {
    if (problem.productsShareAncestor === null) {
      return { holds: false, evidence: "sin grafo repo-completo no hay aristas de herencia con las que mirar si los productos son familia." };
    }
    return {
      holds: problem.productsShareAncestor,
      evidence: problem.productsShareAncestor
        ? "al menos dos de los tipos construidos declaran un ancestro común: hay una familia de productos detrás."
        : "los tipos construidos no declaran un ancestro común en este repo — la elección sigue soldada, pero sin familia de productos declarada.",
    };
  },
};

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO, y lo que NO puede producir, dicho con
 * todas las letras (mismo criterio con el que AC3 y AD4 lo dijeron de las
 * suyas):
 *
 *   - `parcial` — el ancestro YA declara el mismo miembro homónimo: existe un
 *     único lugar arriba donde el procedimiento podría vivir, y los hermanos lo
 *     redefinen entero igual. El patrón está a medias: hay jerarquía y hay
 *     operación común, lo que falta es aislar la creación.
 *   - `ausente` — ni siquiera eso: el ancestro no declara nada del homónimo.
 *   - `ya-aplicado` — **INALCANZABLE POR CONSTRUCCIÓN, y no me acredita nada.**
 *     La forma canónica del patrón aplicado es "el ancestro tiene el
 *     procedimiento UNA vez y los hermanos sólo redefinen el gancho"; el ancla
 *     exige que >= 2 hermanos DECLAREN el procedimiento (condición 2) y que ese
 *     procedimiento tenga pasos propios (condición 4). Son incompatibles. Lo
 *     que SÍ es mérito medible es que el DETECTOR se calle cuando el punto de
 *     creación ya existe (su condición 5, y el `required`
 *     `sin-punto-de-creacion-redefinible` de acá).
 *   - `aplicado-eludido` — no se produce por este camino, misma decisión de
 *     contrato que el camino viejo declara arriba: `refresh()` tiene prohibido
 *     mover `state`.
 */
function redeclaredAppliedState(problem: RedeclaredConstructionProblem): AppliedStateResult {
  const partial = problem.ancestorDeclaresMember === true;
  const checks: PatternHypothesisCheck[] = [
    {
      label: `El ancestro${problem.ancestorLabel ? ` ("${problem.ancestorLabel}")` : ""} ya declara él mismo el miembro "${problem.memberName}" — hay un único lugar arriba donde el procedimiento podría vivir.`,
      passed: partial,
      why: partial
        ? `El ancestro declara "${problem.memberName}" y los ${problem.copies} hermanos lo redefinen ENTERO igual: la jerarquía y la operación común ya existen, lo que falta es aislar la creación en un punto redefinible propio.`
        : `Ningún ancestro de estos ${problem.copies} hermanos declara "${problem.memberName}": no hay hoy ningún lugar arriba donde el procedimiento viva una sola vez.`,
      role: "applied",
    },
    {
      label: "Los hermanos delegan la construcción en un miembro de creación redefinible (la forma COMPLETA de Factory Method).",
      passed: false,
      why:
        "INALCANZABLE POR CONSTRUCCIÓN desde este ancla, y se dice en vez de acreditarse: el ancla exige que ≥2 hermanos DECLAREN el procedimiento con pasos propios, " +
        "y 'ya aplicado' significa exactamente lo contrario (el procedimiento vive UNA vez arriba y los hermanos sólo redefinen el gancho). " +
        "Lo que sí se verifica, y es de otra naturaleza, es que el detector se CALLA cuando ese punto de creación ya existe — ver el check requerido 'sin-punto-de-creacion-redefinible'.",
      role: "applied",
    },
  ];
  return { state: partial ? "parcial" : "ausente", checks };
}

const SPEC_REDECLARED: HypothesisSpec<RedeclaredConstructionProblem, CodeGraph | null> = {
  pattern: "Factory Method",
  ceiling: "alta", // mismo techo que el camino viejo de este archivo; no se re-derivó contra el corpus
  needs: [], // funciona igual con o sin clases — la familia la aporta el grafo
  // OLA AM (frente AM4): `dosTiposHermanos` se SUMA a la escalera — ver su docstring.
  required: [dosTiposHermanos, eachSiblingPicksItsProduct, duplicatedProcedureToHoist, noExistingCreationPoint],
  discriminators: [threeOrMoreSiblings, repetitionCrossesFiles, productsFormAFamily],
  appliedState: (problem) => redeclaredAppliedState(problem),
  toConfirm: [
    "El ancla verifica el mismo CONJUNTO de símbolos invocados, NO la misma secuencia ni el mismo texto (las aristas `calls` del grafo colapsan las ocurrencias y no llevan posición, y los cuerpos viven en archivos distintos): ¿los hermanos hacen de verdad el MISMO procedimiento, o comparten un vocabulario?",
    "¿El miembro que se repite se puede redefinir en este lenguaje? Un miembro estático (C#/Java) NO se hereda ni se redefine: ahí la mitigación es un punto de creación compartido, no un gancho en el ancestro.",
    "¿Los tipos construidos comparten de verdad un contrato común, o son productos sin relación entre sí?",
  ],
  source: "https://refactoring.guru/es/design-patterns/factory-method",
};

const SPEC: HypothesisSpec<ChainInstantiatesProblem, CodeGraph | null> = {
  pattern: "Factory Method",
  ceiling: "alta", // provisional (K2) — igual que el spike (4/4 escenarios), sin re-derivar contra el corpus externo todavía
  needs: [], // funciona igual con o sin clases — ver "FORMA EN LENGUAJES SIN CLASES" en el docstring del módulo
  required: [isInstantiatesVariant],
  discriminators: [threeOrMoreBranches, cleanTypeDispatch, externalBypassDiscriminator],
  appliedState,
  toConfirm: [
    "¿La cadena está mezclada con otra lógica, o ya vive aislada en su propio método de creación?",
    "¿La familia de tipos construidos comparte de verdad una interfaz común?",
    "El check estructural 'chain-is-whole-method' no se pudo evaluar (ver checks) — revisar a mano si el cuerpo del método hace algo más que la cadena.",
    "Si el estado es 'ya-aplicado': el discriminador 'cliente-externo-saltea-base' (evaluable sólo desde refresh(), con grafo real) marca si algún cliente externo puentea la base — revisar a mano si `passed: true` ahí.",
  ],
  source: "https://refactoring.guru/es/design-patterns/factory-method",
};

/* ────────────────────────────────────────────────────────────────────────
 * OLA AI, FRENTE AI6 — LA TRAZA DEL EMBUDO. Mismo mecanismo, misma forma y
 * mismo default que `strategy.ts#startStrategyTrace` (Ola AH) y que
 * `engine.ts#startArbitrationTrace`: ningún `process.env` en el camino de
 * análisis, se prende llamando `startAi6Trace()` desde un script de medición
 * y se apaga sola al leerla. `null` (el default de producción) ⇒ costo cero:
 * ni una rama de más por hallazgo, ni un check de más corrido.
 *
 * QUÉ CONTESTA, y por qué el volcado de producción no puede contestarlo: el
 * volcado sólo publica lo que SOBREVIVE — `engine.ts#build` devuelve `null`
 * en cuanto UN `required` no se sostiene, y con él se pierde CUÁL no se
 * sostuvo. La pregunta de esta ola ("¿hay un `required` que, para un
 * subconjunto identificable de su entrada, no se pueda satisfacer POR
 * CONSTRUCCIÓN?") no es respondible sin el resultado de CADA `required`
 * también en los hallazgos que no emiten. Con la traza prendida se re-corren
 * los `required` y `appliedState` de esta hipótesis (son puros: leen
 * `problem`/`graph`/`ctx` y no escriben nada) para registrar el resultado
 * por check y el estado que la hipótesis HABRÍA tenido.
 * ──────────────────────────────────────────────────────────────────────── */

export interface Ai6TraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly language: string | null;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  /** `locations[0].role` — el detector escribe ahí la sub-forma (p.ej. `(tipado)`/`(literal)`). */
  readonly role: string;
  /** Cuál de los caminos del archivo corrió (un archivo puede tener specs distintos por ancla). */
  readonly camino: string;
  readonly withGraph: boolean;
  /** ¿había árbol vivo? — el eje que separa "no se pudo confirmar" de "se confirmó que no". */
  readonly withFile: boolean;
  readonly checks: readonly { readonly id: string; readonly holds: boolean; readonly why: string }[];
  /** El primero de `required` que NO se sostiene; `null` si todos se sostienen. Con `spec === null` (muerte ANTES del motor) lleva el motivo, prefijado `pre-spec:`. */
  readonly diesAt: string | null;
  /** El estado que `appliedState` decide — se registra TAMBIÉN cuando un `required` mata la hipótesis, porque es el dato que dice qué se está perdiendo. */
  readonly appliedState: string;
  readonly emitted: boolean;
}

let ai6Trace: Ai6TraceEntry[] | null = null;

export function startAi6Trace(): void {
  ai6Trace = [];
}

export function takeAi6Trace(): readonly Ai6TraceEntry[] {
  const t = ai6Trace ?? [];
  ai6Trace = null;
  return t;
}

export function ai6TraceEnabled(): boolean {
  return ai6Trace !== null;
}

function ai6Record<P, G>(
  camino: string,
  spec: HypothesisSpec<P, G> | null,
  problem: Finding,
  p: P,
  g: G,
  ctx: HypothesisContext,
  graphPresent: boolean,
  emitted: boolean,
  motivo?: string,
): void {
  if (!ai6Trace) return;
  const loc = problem.locations[0];
  const checks = spec
    ? spec.required.map((c) => {
        const r = c.run(p, g);
        return { id: c.id, holds: r.holds, why: r.evidence };
      })
    : [];
  ai6Trace.push({
    findingId: problem.id,
    kind: problem.kind,
    language: problem.language,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    symbol: loc?.symbol ?? "",
    role: loc?.role ?? "",
    camino,
    withGraph: graphPresent,
    withFile: ctx.file !== null,
    checks,
    diesAt: spec ? (checks.find((c) => !c.holds)?.id ?? null) : `pre-spec:${motivo ?? "?"}`,
    // `appliedState` sólo se evalúa cuando TODOS los `required` se sostienen —
    // que es exactamente cuando producción también lo evalúa. Evaluarlo
    // siempre (la forma de `strategy.ts#recordStrategyTrace`) multiplicaba por
    // ~2 el costo de guava: `command.ts#appliedState` recorre el grafo del
    // repo y el ancla `duplication` tiene 1.089 hallazgos en ese repo, de los
    // que 1.067 mueren en el primer `required`. Medido: 4,7 min → 8,3 min.
    appliedState: spec ? (checks.every((c) => c.holds) ? spec.appliedState(p, g).state : "(no evaluado: murió en un required)") : "(sin spec)",
    emitted,
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "factory-method",
  pattern: "Factory Method",
  layer: "patron",
  // OLA AE (AE8): SUMA la tercera ancla. Las dos viejas quedan EXACTAMENTE
  // donde estaban — esta ola es aditiva y su número está publicado (informe
  // AE8 §1: 7 hipótesis sobre 977 hallazgos ancla, 970 muertas en
  // `isInstantiatesVariant`).
  anchors: ["conditional-chain", "repeated-switch", "homonymous-divergent-construction"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    // OLA AE (AE8) — CAMINO DE ENTRADA PROPIO DE LA TERCERA ANCLA. Sale antes
    // de tocar nada del camino viejo.
    if (problem.kind === "homonymous-divergent-construction") {
      const redeclared = toRedeclaredProblem(problem, graph);
      const outcome = build(SPEC_REDECLARED, ctx.capabilities, redeclared, graph);
      if (ai6TraceEnabled()) ai6Record("homonymous-divergent-construction", SPEC_REDECLARED, problem, redeclared, graph, ctx, graph !== null, outcome !== null);
      if (!outcome) return null;
      return toPatternHypothesis(SPEC_REDECLARED, outcome, {
        anchorFindingId: problem.id,
        places: problem.locations,
        cost:
          "Un miembro de creación redefinible en el ancestro (o, en un lenguaje sin herencia de implementación, una función/campo constructor " +
          "que cada variante provee) más el procedimiento común subido una sola vez — costo de una redefinición corta por cada tipo futuro, " +
          "en vez de una copia entera del procedimiento.",
      });
    }
    const chainProblem = toChainProblem(problem, ctx, graph);
    const outcome = build(SPEC, ctx.capabilities, chainProblem, graph);
    if (ai6TraceEnabled()) ai6Record("chain/switch-instantiates", SPEC, problem, chainProblem, graph, ctx, graph !== null, outcome !== null);
    if (!outcome) return null;
    return toPatternHypothesis(SPEC, outcome, {
      anchorFindingId: problem.id,
      places: problem.locations,
      cost:
        "Un método de creación override-able (jerarquía) o, en Ruby/Python/JS, una tabla de despacho (Hash/dict); en Go " +
        "(sin clases), una función constructora dedicada (`NewX`) o un mapa de funciones constructoras — costo de una " +
        "clase/entrada nueva por cada tipo futuro.",
    });
  },
  /**
   * Ola 11a (P3) — CONTRATO-11a.md (ver docstring del módulo, sección
   * "`aplicado-eludido` NO se produce..."). Recalcula SÓLO discriminadores
   * (`refreshDiscriminators`, nunca `state`/`checks`) contra el grafo real
   * de `crossAnalyze` — el único punto donde `externalBypassDiscriminator`
   * puede confirmar algo (`build()` siempre ve `graph: null` acá). Sin
   * grafo real todavía, no hay nada que mejorar — mismo criterio de corte
   * temprano que `strategy.ts#refresh`.
   */
  refresh(existing, problem, graph, ctx) {
    if (!graph) return null;
    // OLA AE (AE8): el ancla nueva es `inter-file` y `hypotheses/run.ts
    // #refreshHypotheses` NUNCA la alcanza (esa pasada corre sólo sobre
    // `Finding`s que ya recibieron `build()` con árbol vivo dentro de
    // `analyzeFile`). El corte es defensivo y explícito: `toChainProblem` lee
    // `finding.trigger[0].value` como longitud de cadena, que para este ancla
    // no significa nada, y `SPEC` no es su spec.
    if (problem.kind === "homonymous-divergent-construction") return null;
    const chainProblem = toChainProblem(problem, ctx, graph);
    return refreshDiscriminators(SPEC, existing, chainProblem, graph);
  },
};
