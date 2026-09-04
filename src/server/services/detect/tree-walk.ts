/**
 * Recorrido pre-order compartido, sobre `ProbeNode` (la forma estructural que
 * comparten la sonda y un árbol real — ver `AstNode` en `types.ts`).
 *
 * Extraído de una implementación IDÉNTICA que `empty-catch.ts` y
 * `repeated-switch.ts` traían cada uno por su cuenta (mismo cuerpo, mismo
 * comentario justificando el cast) — reportado como duplicación menor en
 * revisión adversarial (ver el resultado final de la tarea). Cualquier
 * detector `intra-function`/`intra-file` que necesite recorrer su nodo
 * entero usa este helper en vez de escribir el suyo.
 */
import type { ProbeNode } from "../code-grammar.js";

export function walkTree(node: ProbeNode, visit: (n: ProbeNode) => void): void {
  visit(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walkTree(child, visit);
  }
}
