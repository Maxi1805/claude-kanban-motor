/**
 * R7 — sonda de forma: para archivos representativos de 6 gramáticas, imprime
 * los TIPOS DE NODO de los hijos DIRECTOS del body de cada nodo class-like,
 * excluyendo function-like/class-like anidados. Sirve para nombrar, con
 * evidencia y no a ojo, el vocabulario de "declaración de campo" por
 * lenguaje que scripts/r7-campos-tipo.mts va a usar.
 *
 * Uso: npx tsx scripts/r7-probe-field-nodetypes.mts <dir> <relPath>
 */
import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode } from "../src/server/services/detect/types.js";

const [, , dir, rel] = process.argv;
if (!dir || !rel) {
  console.error("uso: r7-probe-field-nodetypes.mts <dir> <relPath>");
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
    const body = (node.childForFieldName("body") as AstNode | null) ?? null;
    const nameNode = node.childForFieldName("name") as AstNode | null;
    console.log(`\nCLASS-LIKE ${node.type} name=${nameNode?.text ?? "?"} @${node.startPosition.row + 1}`);
    if (body) {
      for (let i = 0; i < body.childCount; i++) {
        const child = body.child(i) as AstNode | null;
        if (!child || !child.isNamed) continue;
        if (sets.functionNodes.has(child.type)) continue;
        if (sets.classNodes.has(child.type)) continue;
        console.log(`  campo-candidato tipo=${child.type} texto="${child.text.slice(0, 80).replace(/\n/g, "\\n")}"`);
      }
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child) walk(child);
  }
}
walk(root);
live.release();
