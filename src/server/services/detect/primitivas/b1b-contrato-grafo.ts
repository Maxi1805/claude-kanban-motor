/**
 * `signatureImposedByContract` — la respuesta a la PRIMERA pregunta nueva de
 * B1-CONTRATO.md ("¿la firma la impone un contrato?") para `unused-variable`
 * y `argument-mutation` (Ola N, frente B1b). Primitiva compartida entre los
 * dos, prefijo `b1b-` (CONTEXTO.md §5.1: archivo nuevo, un frente).
 *
 * QUÉ RESPONDE: dado un `FunctionUnit` con nombre, ¿la firma de ESTA función
 * (sus parámetros, en cantidad y posición) la fija algo fuera de la propia
 * función — una interfaz/clase base que exige un miembro con el mismo
 * nombre+aridad, o un sitio en OTRO lugar del repo que guarda esta función
 * como valor (delegado/callback registrado)? Si sí, un parámetro sin leer no
 * "sobra" (no es un `unused-variable`) y una mutación puede ser el propósito
 * documentado del contrato, no un descuido — ver CONTEXTO.md, familia
 * CONTRATO.
 *
 * DOS MECANISMOS, los dos vía `CodeGraphEdge`, nunca vocabulario de dominio:
 *
 *   (A) CONTENEDOR CON `implements`/`extends`/`satisfies` HACIA UN MIEMBRO
 *       QUE COINCIDE. El símbolo que contiene a `fn` (su clase) tiene una
 *       arista saliente de uno de esos tres tipos hacia otro símbolo (una
 *       interfaz o clase base) cuyos MIEMBROS (`memberSignatures`,
 *       `graph/types.ts`) incluyen uno con el MISMO nombre y — cuando los dos
 *       lados resuelven aridad — la MISMA aridad que `fn`. `extends` entra en
 *       la lista, no sólo `implements`: CONFIRMADO de punta a punta contra
 *       `analyzeRepo` real (evidencia exploratoria, ya no en disco — ver la
 *       nota al final del docstring; queda permanente como el caso "extends
 *       (no sólo implements)..." de `b1b-contrato-grafo.test.ts`) que C# con
 *       un ÚNICO candidato tras `:` (`class Inner : IWriter`, ni base class
 *       ni segunda interfaz) lo clasifica `herencia.ts` como `extends` — el
 *       propio lenguaje no distingue base de interfaz cuando hay uno solo
 *       (ver `graph/edges/interfaz-declarada.ts`, "AMBIGÜEDAD DECLARADA —
 *       C#") — así que negarse a mirar `extends` dejaría afuera el caso de
 *       interfaz único más común de C#.
 *
 *   (B) `fn` ES DESTINO DE UNA ARISTA `carries` ENTRANTE — está guardada como
 *       VALOR en otro lugar (un delegado registrado, un customizer pasado a
 *       otra función: `carries-derive.ts`, Forma 1/5). Si algo más sostiene
 *       una referencia a esta función para invocarla más tarde, la firma no
 *       es negociable por este sitio: el llamador indirecto espera EXACTO lo
 *       que ve.
 *
 * ── EL PROBLEMA QUE HAY QUE RESOLVER PRIMERO: LAS ANCLAS *NO* COINCIDEN ────
 *
 * `CONTRATO-UNIFICACION.md` (U1) promete que `symbolNodeId(fn.file,
 * fn.symbolPath)` es "exactamente `serializeAnchor` menos el sufijo `@n`...
 * un hallazgo del grafo y un hallazgo de un detector anclan al mismo lugar
 * SIN TRADUCTOR". MEDIDO, ANTES DE ESCRIBIR ESTE ARCHIVO, corriendo un
 * detector-sonda con `needsGraph: true` de punta a punta contra `analyzeRepo`
 * real sobre un fixture C# con namespace + clase anidada (evidencia
 * exploratoria, ya no en disco — la misma afirmación queda permanente como
 * el caso "REGRESIÓN" de `b1b-contrato-grafo.test.ts`, que reproduce el
 * mismo desacople con un grafo de fixture): eso es FALSO en cuanto
 * `fn` vive detrás de MÁS DE UN NIVEL de contenedor con nombre — un
 * namespace (C#/TS) o una clase anidada dos niveles. `facts/units.ts`
 * (`buildFileUnit`) arma `FunctionUnit.symbolPath` como `[fn.className,
 * name]` — SÓLO el contenedor INMEDIATO, nunca la cadena completa, porque
 * `FunctionMetrics.className` es, por diseño (`detect/types.ts`), un ÚNICO
 * string, no un camino. `graph/symbols.ts#extractSymbols`, en cambio, arma
 * el `container` recorriendo TODO el `scopeStack` de contenedores con
 * nombre — namespace INCLUIDO (su propio docstring, línea ~66-91, ya
 * documenta esta divergencia con `code-grammar.ts`/`references.ts` como un
 * gap CONOCIDO, "reported, not patched... fixable in one place by whoever
 * owns that file"). Resultado medido con un fixture C# de
 * `namespace Demo { interface IWriter {...} class Outer { class Inner :
 * IWriter { public void Write(...) {...} } } }`: `FunctionUnit.symbolPath`
 * de `Write` es `["Inner", "Write"]`; el nodo REAL del grafo es
 * `sym:demo.cs#Demo.Outer.Inner.Write`. `symbolNodeId(file, fn.symbolPath)`
 * da `sym:demo.cs#Inner.Write` — UN STRING DISTINTO, así que
 * `index.nodeById(...)` nunca lo encuentra. Para C# (que SIEMPRE envuelve su
 * código en `namespace`) esto habría dejado el mecanismo (A) inerte para
 * TODO el lenguaje sin ningún error visible — exactamente el tipo de
 * silencio que la ola prohíbe.
 *
 * NO SE ARREGLA ACÁ ARRIBA (`code-analyzer.ts` es de U1 y nadie más;
 * `facts/units.ts` no tiene dueño en esta ola pero cambiar la FORMA de
 * `FunctionUnit.symbolPath` en producción tiene onda expansiva sobre
 * cualquier otro consumidor — anclas de hallazgos, snapshots de otros
 * detectores — con doce frentes editando el mismo árbol AHORA MISMO. El
 * arreglo correcto (namespace como contenedor en `code-grammar.ts`, o
 * `FunctionMetrics.className` como camino) es de una ola futura, con el
 * árbol quieto. Acá se RESUELVE POR SUFIJO en vez de por id exacto: dado que
 * `fn.symbolPath` SIEMPRE es el sufijo correcto (el contenedor inmediato +
 * el propio nombre, eso `facts/units.ts` sí lo tiene bien), basta con
 * encontrar, en `graph.nodes`, el ÚNICO símbolo de ESE archivo cuyo
 * `symbolPath` TERMINA con esa misma secuencia. Ambiguo (dos símbolos del
 * mismo archivo con el mismo sufijo — dos namespaces con una clase homónima,
 * por ejemplo) ⇒ no resuelve, nunca adivina (misma disciplina que
 * `edgeIsAmbiguous` en el resto del grafo).
 *
 * ── EL SEGUNDO LÍMITE, TAMBIÉN MEDIDO: (B) NO VE UN MÉTODO REFERENCIADO
 *    DESNUDO DESDE DENTRO DE SU PROPIA CLASE ──────────────────────────────
 *
 * El caso textual del encargo (`contract.OnSerializingCallbacks.Add
 * (ThrowUnableToSerializeError)`, newtonsoft-json) es un MÉTODO PRIVADO
 * referenciado por nombre desnudo, sin calificar, dentro del cuerpo de su
 * propia clase. MEDIDO, con un fixture C# equivalente corrido de punta a
 * punta contra `analyzeRepo` real (evidencia exploratoria, ya no en disco):
 * NO produce ninguna arista `carries`. La causa, leída en
 * `graph/resolve.ts#classMemberStage` (etapa `class-member`,
 * "REFINAMIENTO MEDIDO... Ola 9"): un nombre desnudo que resuelve a un
 * MIEMBRO de clase se rechaza SIEMPRE que no sea `isCallee` (una invocación),
 * en los 9 lenguajes — la única excepción es Ruby con auto-despacho a `self`,
 * que TAMBIÉN exige `isCallee`. Un nombre de método leído como VALOR (no
 * invocado) nunca sobrevive esa etapa, así que nunca llega a
 * `carries-derive.ts`. Es una decisión YA MEDIDA y YA JUSTIFICADA de una ola
 * anterior (evita hubs falsos de `each`/nombres comunes), no un bug — pero
 * la CONSECUENCIA para (B) es real: el mecanismo `carries` de este archivo
 * SÓLO ve una función SUELTA (no miembro de clase) referenciada por nombre
 * — CONFIRMADO que sí funciona ahí con el mismo método (fixture JS
 * equivalente de `customDefaultsMerge`/lodash: SÍ produce `carries`; queda
 * permanente como el caso "función SUELTA... referenciada como valor" de
 * `b1b-contrato-grafo.test.ts` y, de punta a punta contra el detector real,
 * en `unused-variable.test.ts`). Un delegado registrado con un MÉTODO (no
 * una función suelta) queda fuera de (B); si ese mismo método además
 * cumple (A) (implementa/extiende algo con un miembro de igual
 * nombre+aridad), sigue protegido por esa vía.
 *
 * NOTA DE PROCESO: los tres hallazgos de arriba (el `extends` de C#, el
 * desacople de anclas, y el límite de `class-member` sobre `carries`) se
 * midieron con detectores-sonda corridos de punta a punta contra
 * `analyzeRepo` real, sobre fixtures armados para esta tarea — exploración
 * temporal, no parte del entregable, ya borrada del árbol. Cada uno de los
 * tres queda reproducible de forma PERMANENTE como un test real (citado
 * arriba, junto a cada hallazgo) en vez de como un script suelto.
 */
import type { AstNode, FunctionUnit } from "../types.js";
import { edgeIsAmbiguous, memberSignatures, type CodeGraph, type CodeGraphNode, type EdgeKind, type GraphIndex } from "../../graph/types.js";

/** Los tres tipos de arista que declaran "un miembro de OTRO lado exige esta firma" — ver mecanismo (A) arriba. */
const CONTRACT_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set(["implements", "extends", "satisfies"]);

/**
 * Cantidad de parámetros DECLARADOS de `node` — réplica BIT A BIT de
 * `graph/symbols.ts#computeArity` (mismo campo `parameters`/`parameter_list`,
 * mismo criterio "hijo nombrado, no comentario"), para que comparar contra
 * `MemberSignature.arity` (que sale de `computeArity`) compare lo mismo con
 * lo mismo. Deliberadamente NO reutiliza `collectParameters`/
 * `collectParameterNames` de `unused-variable.ts`/`argument-mutation.ts`:
 * esos dos filtran distinto entre sí (uno resuelve nombres, el otro excluye
 * `out`/`ref` de C#) — cualquiera de los dos introduciría una asimetría
 * distinta contra la aridad que el grafo YA calculó.
 */
function declaredArity(node: AstNode): number | null {
  const params = (node.childForFieldName("parameters") ?? node.childForFieldName("parameter_list")) as AstNode | null;
  if (!params) return null;
  let count = 0;
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i) as AstNode | null;
    if (child && child.isNamed && child.type !== "comment") count++;
  }
  return count;
}

/**
 * `graph.nodes` indexados por `(file, último segmento de symbolPath)` — la
 * base de la resolución por SUFIJO (ver el docstring del módulo, "LAS
 * ANCLAS NO COINCIDEN"). `WeakMap` clavado en el propio `CodeGraph`: se
 * construye UNA vez por corrida (mismo espíritu que `graphIndex()` en
 * `detect/run.ts`) y se libera solo cuando el grafo de esa corrida ya no
 * tiene referencias vivas — ningún frente necesita limpiarlo a mano.
 */
const lastSegmentIndexCache = new WeakMap<CodeGraph, ReadonlyMap<string, readonly CodeGraphNode[]>>();

function lastSegmentKey(file: string, lastSegment: string): string {
  return `${file} ${lastSegment}`;
}

function buildLastSegmentIndex(graph: CodeGraph): ReadonlyMap<string, readonly CodeGraphNode[]> {
  const map = new Map<string, CodeGraphNode[]>();
  for (const node of graph.nodes) {
    if (node.kind !== "symbol" || node.symbolPath.length === 0) continue;
    const key = lastSegmentKey(node.file, node.symbolPath[node.symbolPath.length - 1]!);
    const bucket = map.get(key);
    if (bucket) bucket.push(node);
    else map.set(key, [node]);
  }
  return map;
}

function lastSegmentIndexFor(graph: CodeGraph): ReadonlyMap<string, readonly CodeGraphNode[]> {
  const cached = lastSegmentIndexCache.get(graph);
  if (cached) return cached;
  const built = buildLastSegmentIndex(graph);
  lastSegmentIndexCache.set(graph, built);
  return built;
}

/**
 * El id del ÚNICO nodo `symbol` de `file` cuyo `symbolPath` TERMINA con
 * `suffix` — `null` si no hay ninguno o si hay más de uno (ambiguo, nunca se
 * adivina: misma disciplina que `edgeIsAmbiguous` en el resto del grafo). Ver
 * "LAS ANCLAS NO COINCIDEN" en el docstring del módulo para por qué esto
 * hace falta en vez de `symbolNodeId(file, suffix)` directo.
 */
function resolveBySuffix(graph: CodeGraph, file: string, suffix: readonly string[]): string | null {
  const last = suffix[suffix.length - 1];
  if (last === undefined) return null;
  const candidates = lastSegmentIndexFor(graph).get(lastSegmentKey(file, last)) ?? [];
  let found: string | null = null;
  for (const node of candidates) {
    if (node.symbolPath.length < suffix.length) continue;
    const tail = node.symbolPath.slice(node.symbolPath.length - suffix.length);
    if (tail.every((seg, i) => seg === suffix[i])) {
      if (found !== null && found !== node.id) return null; // dos símbolos con el mismo sufijo: ambiguo, no se adivina
      found = node.id;
    }
  }
  return found;
}

/** Mecanismo (B) — ver el docstring del módulo. `edgesTo` es opcional en `GraphIndex`; ausente ⇒ no se puede preguntar, se degrada a "no". */
function isCarriedElsewhere(fnId: string, index: GraphIndex): boolean {
  const incoming = index.edgesTo?.(fnId) ?? [];
  return incoming.some((e) => e.kind === "carries" && !edgeIsAmbiguous(e));
}

/** Mecanismo (A) — ver el docstring del módulo. */
function matchesContractMember(fn: FunctionUnit, containerId: string, index: GraphIndex): boolean {
  const name = fn.name;
  if (name === null) return false;
  const arity = declaredArity(fn.node);
  for (const edge of index.edgesFrom(containerId)) {
    if (edgeIsAmbiguous(edge) || !CONTRACT_EDGE_KINDS.has(edge.kind)) continue;
    for (const member of memberSignatures(index, edge.to)) {
      if (member.name !== name) continue;
      if (member.arity === null || arity === null || member.arity === arity) return true;
    }
  }
  return false;
}

/**
 * La pregunta completa: ¿un contrato externo (visible sólo por el grafo)
 * impone la firma de `fn`? Combina (A) y (B) — ver el docstring del módulo.
 * `fn.name === null` (función anónima) siempre da `false`: una lambda no
 * tiene nombre que un `memberSignatures`/`carries` pueda emparejar.
 *
 * PURA respecto de `RunContext`: recibe `graph`/`index` ya resueltos, no un
 * `ctx` — cada detector decide él mismo cómo degradar sin grafo (`ctx.graph
 * ?? null`), siguiendo el mismo patrón que CONTRATO-UNIFICACION.md §2 pide
 * para cualquier detector `intra-*` que opte por `needsGraph`.
 */
export function signatureImposedByContract(fn: FunctionUnit, graph: CodeGraph, index: GraphIndex): boolean {
  if (fn.name === null) return false;
  const className = fn.metrics.className;
  const fnSuffix = className ? [className, fn.name] : [fn.name];
  const fnId = resolveBySuffix(graph, fn.file, fnSuffix);
  if (fnId && isCarriedElsewhere(fnId, index)) return true;

  if (!className) return false;
  const containerId = resolveBySuffix(graph, fn.file, [className]);
  if (!containerId) return false;
  return matchesContractMember(fn, containerId, index);
}
