/**
 * SONDA DEL FRENTE S1 (Ola S) — para cada nodo class-like de un archivo, qué
 * `nodeType` verbatim tiene la declaración y, si expone un campo `type`, qué
 * `nodeType` tiene ESE hijo. Sirve para decidir con evidencia (no a ojo) si la
 * gramática pone la FORMA del tipo en el nodo declarante o en un hijo.
 *
 * Uso: npx tsx scripts/s1-probe-forma-tipo.mts <dir> <relPath>
 */
import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode } from "../src/server/services/detect/types.js";

const [, , dir, rel] = process.argv;
if (!dir || !rel) {
  console.error("uso: s1-probe-forma-tipo.mts <dir> <relPath>");
  process.exit(1);
}

const live = await resolveLiveFileUnit(dir, rel);
if (!live) {
  console.error("no se pudo parsear");
  process.exit(1);
}
const { root, sets, language } = live.unit;
console.log(`lenguaje=${language}`);

function walk(node: AstNode): void {
  if (sets.classNodes.has(node.type)) {
    const nameNode = node.childForFieldName("name") as AstNode | null;
    const typeField = node.childForFieldName("type") as AstNode | null;
    const bodyField = node.childForFieldName("body") as AstNode | null;
    console.log(
      `class-like nodeType=${node.type} name=${nameNode?.text ?? "?"} campoType=${typeField?.type ?? "-"} campoBody=${bodyField?.type ?? "-"} @${node.startPosition.row + 1}`,
    );
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child) walk(child);
  }
}
walk(root);
live.release();
