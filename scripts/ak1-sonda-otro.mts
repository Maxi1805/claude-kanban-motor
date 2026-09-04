/** OLA AK, AK1 — sonda: para cada discriminante de forma "otro"/null, imprime el texto REAL del sitio y el receptor del método. Auditoría, no producción. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode, FileUnit } from "../src/server/services/detect/types.js";
function receiverNameOf(fnNode: AstNode): string | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  let decl: AstNode = receiver;
  for (let i = 0; i < receiver.childCount; i++) { const ch = receiver.child(i) as AstNode | null; if (ch?.isNamed) { decl = ch; break; } }
  return (decl.childForFieldName("name") as AstNode | null)?.text?.trim() || null;
}
const [, , listPath, outPath] = process.argv;
const casos: any[] = JSON.parse(readFileSync(listPath!, "utf8"));
const cache = new Map<string, FileUnit | null>();
const res: any[] = [];
for (const c of casos) {
  const key = `${c.dir}||${c.file}`;
  let unit = cache.get(key);
  if (unit === undefined) { const live = await resolveLiveFileUnit(c.dir, c.file); unit = live ? (live.unit as FileUnit) : null; cache.set(key, unit); }
  if (!unit) { res.push({ ...c, err: "sin unit" }); continue; }
  const conts = unit.functions.filter((f) => f.startLine <= c.line && c.line <= f.endLine).sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine));
  const recvs = conts.map((f) => receiverNameOf(f.node as AstNode)).filter((r): r is string => Boolean(r));
  const src = readFileSync(`${c.dir}/${c.file}`, "utf8").split("\n");
  res.push({ ...c, recvs, fn: conts[0]?.name ?? null, linea: (src[c.line - 1] ?? "").trim().slice(0, 140) });
}
writeFileSync(outPath!, JSON.stringify(res, null, 0));
console.log(`${outPath}: ${res.length}`);
