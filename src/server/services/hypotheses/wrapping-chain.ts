/**
 * `findWrappingChains` — Ola 10, CONTRATO-F10.md §0.4/§1, "LA TERNA DE
 * ENVOLTURA". Compartido por diseño: 11 de los 17 patrones (Decorator,
 * Proxy, Composite, Chain of Responsibility, State, Strategy, Facade,
 * Command, Observer, Iterator, Null Object) son variaciones de la MISMA
 * forma de grafo — una clase que implementa una interfaz Y guarda/reenvía a
 * otra que implementa la misma interfaz — y hoy cada una la re-detectaría a
 * mano si no aterrizara acá una sola vez.
 *
 * LA TERNA, verbatim de CONTRATO-F10.md §0.4 (verificada contra el
 * vocabulario de `graph/types.ts` vivo, no inventada):
 *
 *   X --implements|satisfies--> I  ∧  Y --implements|satisfies--> I  ∧
 *   ¬(X --extends--> Y)  ∧
 *   ∃ m: name(m_X) == name(m_Y) ∧ arity(m_X) == arity(m_Y)  (vía `memberSignatures`)  ∧
 *   sym:X.m --calls(role incluye receiver-member)--> sym:Y.m
 *
 * El `¬extends` NO es decoración: sin él, `super.operation()` — misma forma
 * EXACTA, mismo role `receiver-member`, mismo nombre, misma aridad — se
 * contaría como envoltura. Con la arista `extends` disponible, se separa
 * (ver el test "excluye super.operation()").
 *
 * QUÉ NO HACE: no decide `ya-aplicado` ni ningún `PatternState` — ESO es
 * trabajo de cada `<patron>.ts` (¿la interfaz tiene la forma de ESTE patrón
 * en particular? ¿el discriminante importa?). Este módulo sólo responde la
 * pregunta de FORMA: "¿existe una cadena de envoltura acá, y con qué
 * evidencia exacta?" — genérico, sin vocabulario de dominio (regla 4).
 *
 * RIESGO DECLARADO, no resuelto acá (CONTRATO-F10.md §3, nota 2): `satisfies`
 * en C# son 2.961 aristas (15,6% del grafo de newtonsoft-json), con un
 * umbral (`≥2 miembros`) nunca verificado sobre ese repo (PENDIENTES §A9).
 * Por eso cada `WrappingChainMatch` declara `viaSatisfies` — `true` si
 * CUALQUIERA de las dos implementaciones se resolvió por `satisfies` en vez
 * de `implements` — para que el `why` de cada hipótesis consumidora pueda
 * citar el riesgo en vez de mentir por omisión, hasta que A9 cierre.
 *
 * Excluye aristas `ambiguous` por defecto (`confidentEdges`, CONTRATO-F9.md
 * §4.5 — mismo criterio que los 17 detectores `inter-file` ya aplican desde
 * P1/Ola 9): "sabemos que hay relación, no cuál" no es evidencia suficiente
 * para afirmar una cadena de envoltura.
 *
 * *** MEDIDO SOBRE EL CORPUS (Ola 10, `scripts/measure-wrapping-chain-smoke.mts`):
 * CERO matches en los 8 repos. *** No es un bug de esta función — probada
 * correcta contra grafos sintéticos (`wrapping-chain.test.ts`, incluida la
 * exclusión de `super.operation()`) — es un hecho medido, más arriba en la
 * cadena: `classifyRole` (`graph/references.ts:437-446`) SÍ calcula el rol
 * `receiver-member` para un `this.wrapped.operation()`, pero NINGUNA arista
 * del grafo de guava (0 de 3.451 `calls`, 0 de 55.040 `references`) lo trae
 * puesto — verificado por instrumentación directa, no asumido. El rol se
 * pierde en algún punto entre `classifyRole` y la arista final
 * (`graph/resolve.ts`/`graph/build.ts`, ninguno de los dos archivos de esta
 * tarea). Hasta que eso se investigue y cierre, esta función es correcta
 * pero INERTE en producción — cualquier hipótesis que dependa de ella para
 * `ya-aplicado`/`aplicado-eludido` va a ver siempre `[]`, y su `why` debería
 * decirlo así, no fingir que "no se encontró" es lo mismo que "no se pudo
 * buscar". Candidato fuerte para abrir como ítem nuevo en el registro de
 * pendientes antes de que un agente de patrón dependa de esto para señal.
 */
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { edgeHasRole, memberSignatures, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";

export interface WrappingChainMatch {
  /** El nodo de la interfaz/protocolo común (`I` en la terna). */
  readonly interfaceId: string;
  /** El que REENVÍA (`X` — su miembro llama al de `wrappedId`). */
  readonly wrapperId: string;
  /** El envuelto (`Y` — su miembro recibe la llamada). */
  readonly wrappedId: string;
  /** El miembro común que evidencia la envoltura (mismo nombre+aridad en ambos). */
  readonly memberName: string;
  readonly memberArity: number | null;
  /** Id del nodo símbolo `wrapperId.<memberName>`. */
  readonly wrapperMemberId: string;
  /** Id del nodo símbolo `wrappedId.<memberName>`. */
  readonly wrappedMemberId: string;
  /**
   * `true` si `wrapperId` y/o `wrappedId` se resolvieron a `I` vía
   * `satisfies` (estructural) en vez de `implements` (declarado) — ver el
   * riesgo A9 en el docstring del módulo. `false` ⇒ las dos vías son
   * `implements`, sin ese riesgo.
   */
  readonly viaSatisfies: boolean;
}

const INTERFACE_EDGE_KINDS = new Set(["implements", "satisfies"]);

/** `nodeById`/`edgesFrom` construidos UNA vez sobre `confidentEdges(graph)` — O(nodos+aristas), nunca recalculado por match. */
interface Index {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
}

function buildIndex(graph: CodeGraph): Index {
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);

  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  for (const e of confidentEdges(graph)) {
    const list = edgesFrom.get(e.from);
    if (list) list.push(e);
    else edgesFrom.set(e.from, [e]);
  }
  return { nodeById, edgesFrom };
}

/** GraphIndex mínimo que `memberSignatures` necesita, sobre el `Index` local de arriba (sin `edgesTo`: no hace falta acá). */
function asGraphIndex(index: Index): { nodeById: (id: string) => CodeGraphNode | null; edgesFrom: (id: string) => readonly CodeGraphEdge[] } {
  return {
    nodeById: (id) => index.nodeById.get(id) ?? null,
    edgesFrom: (id) => index.edgesFrom.get(id) ?? [],
  };
}

/** Id de nodo del miembro `name` de `ownerId`, leído de la MISMA arista `contains` que `memberSignatures` ya recorrió — nunca reconstruido a mano (evita el Bug de asumir que `symbolPath` se concatena igual en los 9 lenguajes). */
function memberNodeId(index: Index, ownerId: string, name: string): string | null {
  for (const e of index.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = index.nodeById.get(e.to);
    if (target?.kind === "symbol" && target.family === "function-like" && target.symbolPath[target.symbolPath.length - 1] === name) {
      return target.id;
    }
  }
  return null;
}

/** `true` si existe una arista `extends` confidente `fromId -> toId`. */
function extendsEdge(index: Index, fromId: string, toId: string): boolean {
  return (index.edgesFrom.get(fromId) ?? []).some((e) => e.kind === "extends" && e.to === toId);
}

/** `true` si existe una arista `calls` confidente `fromId -> toId` con role `receiver-member`. */
function callsReceiverMember(index: Index, fromId: string, toId: string): boolean {
  return (index.edgesFrom.get(fromId) ?? []).some((e) => e.kind === "calls" && e.to === toId && edgeHasRole(e, "receiver-member"));
}

/**
 * OLA V (integrador) — CACHEADO POR IDENTIDAD DE `CodeGraph`, mismo idiom que
 * `builder.ts#GRAPH_INDEX_CACHE` y `facade.ts#VIEW_CACHE`.
 *
 * *Intención del caché:* **"la lista de cadenas de envoltura es una propiedad
 * DEL GRAFO, no del hallazgo que la pregunta; el mismo grafo tiene siempre la
 * misma respuesta."** No es una heurística: si la clave es la misma referencia
 * de grafo, el valor es idénticamente el que devolvería el recorrido.
 *
 * **Por qué hizo falta, medido y no supuesto.** Hasta la Ola V esta función
 * recibía `graph === null` desde el camino de hipótesis intra-file y no costaba
 * nada. El cableado del grafo a las hipótesis (Ola V, V1) la puso en el camino
 * caliente: la llaman `decorator.ts`, `proxy.ts` y `chain-of-responsibility.ts`
 * **una vez por hipótesis candidata**, y cada llamada rehace el índice O(N+E) y
 * el producto O(implementadores²) sobre el repo ENTERO. Perfil de CPU propio
 * sobre `corpus/hugo` (`node --cpu-prof`, `scripts/v-int-perfil.mts`,
 * 101 s de corrida): `buildIndex` **8,0 s**, `findWrappingChains` **5,8 s**,
 * `memberNodeId` **2,1 s** — **16 % del análisis entero del repo**, y el mayor
 * costo individual del árbol después de `web-tree-sitter`. La atribución que el
 * informe de V1 dejó escrita (`confident-edges.ts` como "la línea de mayor
 * apalancamiento") NO se sostuvo al medirla: memoizar `confidentEdges` bajó
 * hugo de 89,4 s a 86,0 s, dentro del ruido; el costo real es éste.
 */
const CHAINS_CACHE = new WeakMap<CodeGraph, readonly WrappingChainMatch[]>();

/**
 * Todas las cadenas de envoltura que la terna encuentra en `graph` — cero
 * juicio de patrón, sólo forma. `null`/grafo sin nodos ⇒ `[]`, nunca lanza
 * (mismo contrato que el resto de `hypotheses/*`: un grafo ausente es "no
 * aplicable", no un error).
 *
 * El resultado es de SÓLO LECTURA y así lo consumen los tres llamadores
 * (`.filter`/`.find`/`.some`, verificado): compartir la misma instancia entre
 * llamadas no puede afectar a ninguno.
 */
export function findWrappingChains(graph: CodeGraph | null): readonly WrappingChainMatch[] {
  if (!graph) return [];
  const cached = CHAINS_CACHE.get(graph);
  if (cached) return cached;
  const index = buildIndex(graph);
  const gi = asGraphIndex(index);

  // interfaceId -> [(implementerId, viaSatisfies)]
  const implementersByInterface = new Map<string, { id: string; viaSatisfies: boolean }[]>();
  for (const nodes of index.edgesFrom.values()) {
    for (const e of nodes) {
      if (!INTERFACE_EDGE_KINDS.has(e.kind)) continue;
      const list = implementersByInterface.get(e.to) ?? [];
      list.push({ id: e.from, viaSatisfies: e.kind === "satisfies" });
      implementersByInterface.set(e.to, list);
    }
  }

  const out: WrappingChainMatch[] = [];
  for (const [interfaceId, implementers] of implementersByInterface) {
    if (implementers.length < 2) continue;
    for (const x of implementers) {
      const xMembers = memberSignatures(gi, x.id);
      if (xMembers.length === 0) continue;
      for (const y of implementers) {
        if (x.id === y.id) continue;
        if (extendsEdge(index, x.id, y.id)) continue; // super.operation(): misma forma, no envoltura — ver docstring.
        const yMembers = memberSignatures(gi, y.id);
        for (const mx of xMembers) {
          const my = yMembers.find((m) => m.name === mx.name && m.arity === mx.arity);
          if (!my) continue;
          const wrapperMemberId = memberNodeId(index, x.id, mx.name);
          const wrappedMemberId = memberNodeId(index, y.id, my.name);
          if (!wrapperMemberId || !wrappedMemberId) continue;
          if (!callsReceiverMember(index, wrapperMemberId, wrappedMemberId)) continue;
          out.push({
            interfaceId,
            wrapperId: x.id,
            wrappedId: y.id,
            memberName: mx.name,
            memberArity: mx.arity,
            wrapperMemberId,
            wrappedMemberId,
            viaSatisfies: x.viaSatisfies || y.viaSatisfies,
          });
        }
      }
    }
  }
  CHAINS_CACHE.set(graph, out);
  return out;
}
