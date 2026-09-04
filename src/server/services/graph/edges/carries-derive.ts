/**
 * `carries` — FORMA 1 y FORMA 5 de CONTRATO-F9.md §3.3: "nombre de función en
 * posición de valor" y "referencia a método como valor". Derivado del grafo
 * YA ARMADO, sin AST — mismo mecanismo que `satisfies-derive.ts` (índice
 * O(nodos), un recorrido O(aristas), nunca comparación par a par).
 *
 * QUÉ ES: una arista `references` (kind === "references", nunca "calls" —
 * el propio `build.ts` ya partió callee/no-callee ANTES de esta función, así
 * que todo lo que llega acá es, por construcción, `isCallee === false`) cuyo
 * destino resuelto es un símbolo `function-like` es, por definición, un
 * nombre de función usado en posición de VALOR: la cascada de 9 etapas ya
 * demostró que el identificador resuelve a esa declaración, sea el sitio de
 * uso un nombre desnudo (forma 1) o un acceso `obj.metodo` (forma 5, rol
 * `receiver-member` — CONTRATO-F9.md §3.3 punto 5). Las dos formas producen
 * la MISMA arista `carries` (portador → función), así que no hace falta
 * separarlas acá: `EDGE_ROLE_RECEIVER_MEMBER` en `edge.roles`, cuando está
 * presente, ya deja esa distinción disponible para quien la necesite sin
 * duplicar el mecanismo.
 *
 * `from` de la arista `references` YA ES el símbolo contenedor del sitio de
 * uso (`resolve.ts`: `from: symbolNodeId(candidate.from.file,
 * candidate.from.ref.scope)`) — ese contenedor ES el portador: "el símbolo
 * dentro del cual este invocable quedó mencionado como valor". Cuando el
 * sitio de uso es el inicializador de un campo/variable, el contenedor es
 * ESE campo/variable (si `graph/symbols.ts` lo capturó como nodo `other`) o
 * el método/clase que lo envuelve (si no) — de cualquier modo, un portador
 * real, nunca inventado.
 *
 * Las ambiguas (`provenance: "ambiguous"`, CONTRATO-F9.md §4) se excluyen
 * por la misma regla de seguridad que todo el resto del grafo
 * (`edgeIsAmbiguous`, `graph/types.ts`): "sabemos que hay relación, no cuál"
 * no debe multiplicarse en una SEGUNDA capa de incertidumbre encima de la
 * de `carries`/`invokes-indirect`, que ya es su propia forma de declarar
 * incertidumbre (CONTRATO-F9.md §3.1).
 */
import { edgeIsAmbiguous, type CodeGraphEdge, type CodeGraphNode } from "../types.js";

export function deriveCarriesEdges(nodes: readonly CodeGraphNode[], referenceEdges: readonly CodeGraphEdge[]): readonly CodeGraphEdge[] {
  const functionLikeIds = new Set<string>();
  for (const n of nodes) {
    if (n.kind === "symbol" && n.family === "function-like") functionLikeIds.add(n.id);
  }
  if (functionLikeIds.size === 0) return [];

  const merged = new Map<string, CodeGraphEdge>();
  for (const e of referenceEdges) {
    if (e.kind !== "references") continue;
    if (edgeIsAmbiguous(e)) continue;
    if (!functionLikeIds.has(e.to)) continue;
    if (e.from === e.to) continue; // una función que se referencia a sí misma en su propio cuerpo no es un portador de sí misma.
    const key = `${e.from}|${e.to}`;
    const existing = merged.get(key);
    if (existing) merged.set(key, { ...existing, weight: existing.weight + e.weight });
    else merged.set(key, { from: e.from, to: e.to, kind: "carries", provenance: "inferred", weight: e.weight });
  }
  return [...merged.values()];
}
