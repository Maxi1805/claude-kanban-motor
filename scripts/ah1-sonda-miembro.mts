/**
 * OLA AH, FRENTE AH1 — sonda de UN archivo (sin `analyzeRepo`): reproduce
 * `strategy.ts#declaresMemberNamed` sobre la clase que contiene una línea
 * dada y dice QUÉ nodo hoja hace que el nombre "resuelva a miembro".
 *
 * Uso: npx tsx scripts/ah1-sonda-miembro.mts <dir> <archivo> <linea> <nombre>
 */
import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode } from "../src/server/services/detect/types.js";

const [, , dir, rel, lineRaw, name] = process.argv;
if (!dir || !rel || !lineRaw || !name) {
  console.error("Uso: npx tsx scripts/ah1-sonda-miembro.mts <dir> <archivo> <linea> <nombre>");
  process.exit(1);
}
const line = Number(lineRaw);
const live = await resolveLiveFileUnit(dir, rel);
if (!live) { console.error("no se pudo resolver el archivo"); process.exit(2); }
const unit = live.unit;
const sets = unit.sets;

// La cadena: el nodo más angosto que empieza en `line`.
let chain: AstNode | null = null;
const findChain = (n: AstNode): void => {
  if (n.isNamed && n.startPosition.row + 1 === line) {
    if (!chain || n.endPosition.row - n.startPosition.row < chain.endPosition.row - chain.startPosition.row) chain = n;
  }
  for (let i = 0; i < n.childCount; i++) { const c = n.child(i) as AstNode | null; if (c) findChain(c); }
};
findChain(unit.root);
if (!chain) { console.log("no se encontró nodo en esa línea"); process.exit(0); }
const ch: AstNode = chain;
console.log(`lenguaje=${unit.language} nodo-cadena=${ch.type} ${ch.startPosition.row + 1}-${ch.endPosition.row + 1}`);

// Dueño class-like MÁS ANGOSTO que contiene la cadena (mismo criterio que declaresMemberNamed).
let owner: AstNode | null = null;
const walk = (n: AstNode): void => {
  if (n.isNamed && sets.classNodes.has(n.type) && n.startPosition.row <= ch.startPosition.row && ch.endPosition.row <= n.endPosition.row) {
    if (!owner || n.endPosition.row - n.startPosition.row < owner.endPosition.row - owner.startPosition.row) owner = n;
  }
  for (let i = 0; i < n.childCount; i++) { const c = n.child(i) as AstNode | null; if (c) walk(c); }
};
walk(unit.root);
if (!owner) { console.log("sin dueño class-like"); process.exit(0); }
const own: AstNode = owner;
console.log(`dueño=${own.type} ${own.startPosition.row + 1}-${own.endPosition.row + 1}`);
console.log(`functionNodes: ${[...sets.functionNodes].sort().join(", ")}`);

const needle = name.toLowerCase();
const hits: string[] = [];
const hitsSinAnidadas: string[] = [];
const scan = (n: AstNode, path: string[], dentroDeAnidada: boolean): void => {
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i) as AstNode | null;
    if (!c) continue;
    if (c.isNamed && sets.functionNodes.has(c.type)) continue;
    // Identidad por POSICIÓN + tipo de nodo: `AstNode` (detect/types.ts) no
    // declara `id` (es de la implementación de tree-sitter, no del contrato
    // que este proyecto tipa), y `strategy.ts#declaresMemberNamed` compara
    // exactamente así. Misma pregunta, misma respuesta, y compila.
    const mismoNodo = (a: AstNode | null, b: AstNode): boolean =>
      a !== null && a.type === b.type && a.startPosition.row === b.startPosition.row && a.startPosition.column === b.startPosition.column;
    const esTipo = mismoNodo(n.childForFieldName("type") as AstNode | null, c);
    const anidada = dentroDeAnidada || esTipo || (c.isNamed && sets.classNodes.has(c.type));
    if (c.childCount === 0 && c.text.trim().toLowerCase() === needle) {
      const campo = ["name", "pattern", "left"].find((f) => mismoNodo(n.childForFieldName(f) as AstNode | null, c)) ?? null;
      const linea = `línea ${c.startPosition.row + 1} · tipo=${c.type} · campo-del-padre=${campo ?? "(ninguno)"} · ruta=${[...path, c.type].join(" > ")}`;
      hits.push(linea);
      if (!anidada) hitsSinAnidadas.push(linea);
      continue;
    }
    scan(c, [...path, c.type], anidada);
  }
};
scan(own, [own.type], false);
console.log(`HOY (descendiendo a class-like anidadas): ${hits.length}`);
for (const h of hits.slice(0, 8)) console.log("  " + h);
console.log(`CON LOS DOS ARREGLOS (sin class-like anidada + sin el campo type): ${hitsSinAnidadas.length}`);
for (const h of hitsSinAnidadas.slice(0, 8)) console.log("  " + h);
