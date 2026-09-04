/**
 * OLA AK, FRENTE AK1 — sonda de CAPTURA LOCAL (auditoría, no producción).
 *
 * Para cada discriminante DESNUDO de Go, mira la función que contiene el
 * switch/cadena y clasifica CÓMO se declara ese nombre dentro de ella:
 * captura de una llamada al receptor (`x := R.getter()`), copia de un campo
 * del receptor (`x := R.campo`), otra inicialización, parámetro, o nada.
 * Sirve para medir la población detrás de la TERCERA forma de "campo propio"
 * (`localFromOwnGetter`), que hoy es imposible para Go por DOS razones
 * independientes (el regex exige `=` y Go declara con `:=`; y
 * `declaresMemberNamed` exige un nodo class-like que contenga al switch).
 *
 * Uso: npx tsx scripts/ak1-sonda-captura.mts <lista.json> <salida.json>
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
function esc(t: string): string { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

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
  const conts = unit.functions
    .filter((f) => f.startLine <= c.line && c.line <= f.endLine)
    .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine));
  const narrow = conts[0];
  if (!narrow) { res.push({ ...c, clase: "SIN-FUNCION" }); continue; }
  const recvs = conts.map((f) => receiverNameOf(f.node as AstNode)).filter((r): r is string => Boolean(r));
  const txt = (narrow.node as AstNode).text;
  const n = esc(c.fieldName);
  // Todas las declaraciones/asignaciones del nombre dentro de la función, con lo que hay a la derecha.
  const decl = new RegExp(`(?:^|[^.\\w])${n}\\s*(?::=|=)(?!=)\\s*([^\\n]{0,80})`, "im");
  const declMulti = new RegExp(`(?:^|[^.\\w])(?:[\\w,\\s]*\\b${n}\\b[\\w,\\s]*)\\s*(?::=|=)(?!=)\\s*([^\\n]{0,80})`, "im");
  const m = decl.exec(txt) ?? declMulti.exec(txt);
  const rhs = m?.[1]?.trim() ?? null;
  // ¿el RHS empieza con `R.` de alguno de los receptores del stack?
  let via: string | null = null;
  if (rhs) {
    for (const r of recvs) {
      const re = new RegExp(`^${esc(r)}\\.([A-Za-z_]\\w*)\\s*(\\()?`);
      const mm = re.exec(rhs);
      if (mm) { via = mm[2] ? "receptor-llamada" : "receptor-campo"; break; }
    }
  }
  // ¿es parámetro de la función más angosta?
  const params = (narrow.node as AstNode).childForFieldName("parameters") as AstNode | null;
  let esParam = false;
  if (params) {
    const needle = c.fieldName.toLowerCase();
    for (let i = 0; i < params.childCount; i++) {
      const p = params.child(i) as AstNode | null;
      if (!p || !p.isNamed) continue;
      const byField = p.childForFieldName("name") as AstNode | null;
      if (byField && byField.text.trim().toLowerCase() === needle) { esParam = true; break; }
      if (!byField && p.text.trim().toLowerCase().split(/\s+/)[0] === needle) { esParam = true; break; }
    }
  }
  res.push({ ...c, fn: narrow.name, fnType: (narrow.node as AstNode).type, recvs, esParam, rhs, via });
}
writeFileSync(outPath!, JSON.stringify(res, null, 0));
console.log(`${outPath}: ${res.length} casos`);
