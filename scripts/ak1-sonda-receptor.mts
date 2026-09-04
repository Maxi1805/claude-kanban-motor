/**
 * OLA AK, FRENTE AK1 — sonda de RECEPTOR (auditoría, no producción).
 *
 * Para cada caso `R.campo` de la lista, reproduce lo que `state.ts` hace hoy
 * (`enclosingFunctionUnit` -> `childForFieldName("receiver")`) y ADEMÁS
 * enumera TODAS las funciones que contienen la línea, de la más angosta a la
 * más ancha, con el receptor que cada una declara. Eso separa "el calificador
 * no es el receptor" (rechazo correcto) de "la función más angosta es un
 * literal y el receptor está una función más afuera" (compuerta imposible).
 *
 * Uso: npx tsx scripts/ak1-sonda-receptor.mts <lista.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode, FileUnit } from "../src/server/services/detect/types.js";

function receiverNameOf(fnNode: AstNode): string | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  let decl: AstNode = receiver;
  for (let i = 0; i < receiver.childCount; i++) {
    const child = receiver.child(i) as AstNode | null;
    if (child?.isNamed) { decl = child; break; }
  }
  const name = (decl.childForFieldName("name") as AstNode | null)?.text?.trim() ?? null;
  return name ? name : null;
}

const [, , listPath, outPath] = process.argv;
const casos: any[] = JSON.parse(readFileSync(listPath!, "utf8"));
const cache = new Map<string, FileUnit | null>();
const res: any[] = [];
for (const c of casos) {
  const key = `${c.dir}||${c.file}`;
  let unit = cache.get(key);
  if (unit === undefined) {
    const live = await resolveLiveFileUnit(c.dir, c.file);
    unit = live ? (live.unit as FileUnit) : null;
    cache.set(key, unit);
  }
  if (!unit) { res.push({ ...c, err: "sin unit" }); continue; }
  const qualifier = String(c.fieldName).split(".")[0]!;
  // Todas las funciones que contienen la línea, de la más angosta a la más ancha.
  const conteniendo = unit.functions
    .filter((f) => f.startLine <= c.line && c.line <= f.endLine)
    .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))
    .map((f) => ({ name: f.name, startLine: f.startLine, endLine: f.endLine, type: (f.node as AstNode).type, recv: receiverNameOf(f.node as AstNode) }));
  res.push({ ...c, qualifier, conteniendo });
}
writeFileSync(outPath!, JSON.stringify(res, null, 0));
console.log(`${outPath}: ${res.length} casos`);
