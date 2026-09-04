/**
 * OLA AW - AW5. Volcado PARSE-ONLY de firmas de funcion por archivo, para
 * poder iterar reglas de agrupamiento de `data-clump` sin re-parsear.
 *
 * Usa `resolveLiveFileUnit` (mismo camino de produccion que una hipotesis
 * usa para mirar AST) sobre la copia congelada src0. Sin grafo, sin clones,
 * sin hipotesis: solo el arbol de cada archivo.
 *
 * Uso: npx tsx scripts/aw5-firmas.mts <dir> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";
const S0 = "../scratchpad-aw5/src0";
const { collectFiles, resolveLiveFileUnit } = (await import(`${S0}/server/services/code-analyzer.js`)) as any;

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) { console.error("uso: <dir> <nombre> <salida.json>"); process.exit(1); }

const TYPE_CHILD_TYPES = new Set(["type", "type_annotation"]);
const NAME_FIELDS = ["name", "pattern", "left"] as const;
const PARAM_LIKE = /identifier|parameter|pattern/;
const SELF_WORDS = new Set(["this", "self"]);
const CALL_TOKENS = new Set(["call", "invocation"]);
const CALLEE_FIELDS = ["method", "name", "function"] as const;
const ACCESS_NAME_FIELDS = ["property", "attribute", "field", "name", "method"] as const;

function paramName(node: any): string | null {
  if (node.type === "identifier") return node.text.trim() || null;
  for (const field of NAME_FIELDS) {
    const named = node.childForFieldName(field);
    if (!named) continue;
    const r = paramName(named);
    if (r) return r;
  }
  const kids: any[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && c.isNamed && !TYPE_CHILD_TYPES.has(c.type)) kids.push(c);
  }
  return kids.length === 1 ? paramName(kids[0]) : null;
}

/** Igual que `data-clump.ts#paramNames` pero devolviendo tambien la lista CRUDA
 *  (con receptor) y una marca de por que fallo, para poder medir. */
function paramNames(fnNode: any): { names: string[] | null; raw: string[] } {
  const params = fnNode.childForFieldName("parameters") ?? fnNode.childForFieldName("parameter_list");
  if (!params) return { names: null, raw: [] };
  const names: string[] = [];
  const raw: string[] = [];
  let position = 0;
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i);
    if (!child || !PARAM_LIKE.test(child.type)) continue;
    const name = paramName(child);
    if (name === null) return { names: null, raw };
    raw.push(name);
    const isReceiver = position === 0 && SELF_WORDS.has(name);
    if (!isReceiver) names.push(name);
    position++;
  }
  return { names: names.length > 0 ? names : null, raw };
}

function isCallShaped(node: any): boolean {
  return node.type.split("_").some((t: string) => CALL_TOKENS.has(t));
}
function calleeNameOf(call: any): string | null {
  for (const field of CALLEE_FIELDS) {
    const child = call.childForFieldName(field);
    if (!child) continue;
    if (child.type === "identifier") return child.text.trim() || null;
    for (const af of ACCESS_NAME_FIELDS) {
      const inner = child.childForFieldName(af);
      if (inner) return inner.text.trim() || null;
    }
    return null;
  }
  return null;
}
function callArgs(call: any): string[] {
  const args = call.childForFieldName("arguments") ?? call.childForFieldName("argument_list");
  if (!args) return [];
  const out: string[] = [];
  for (let i = 0; i < args.childCount; i++) {
    const a = args.child(i);
    if (a && a.isNamed) out.push(a.text.trim().slice(0, 60));
  }
  return out;
}
function walk(node: any, visit: (n: any) => void) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    visit(n);
    for (let i = n.childCount - 1; i >= 0; i--) { const c = n.child(i); if (c) stack.push(c); }
  }
}

const files = await collectFiles(dir);
const rows: any[] = [];
let archivos = 0;
for (const f of files as any[]) {
  let live: any = null;
  try { live = await resolveLiveFileUnit(dir, f.path); } catch { continue; }
  if (!live) continue;
  archivos++;
  const u = live.unit;
  const fns: any[] = [];
  try {
    for (const fn of u.functions) {
      const { names, raw } = paramNames(fn.node);
      // llamadas del cuerpo: callee + argumentos (para reglas de despacho/delegacion)
      const calls: any[] = [];
      let firstStmtCallee: string | null = null;
      walk(fn.node, (n) => {
        if (!n.isNamed || !isCallShaped(n)) return;
        const cal = calleeNameOf(n);
        calls.push({ c: cal, t: n.type, a: callArgs(n), l: n.startPosition.row + 1 });
      });
      // la PRIMERA llamada por linea (aprox. "primera sentencia")
      calls.sort((a, b) => a.l - b.l);
      firstStmtCallee = calls.length ? calls[0].c : null;
      fns.push({
        n: fn.name, sp: fn.symbolPath, s: fn.startLine, e: fn.endLine,
        p: names, raw, nt: fn.node.type,
        calls: calls.slice(0, 40), fc: firstStmtCallee,
      });
    }
    if (fns.length) rows.push({ file: u.path, lang: u.language, lines: u.lines, fns });
  } catch (e) { console.error("ERR", f.path, String(e).slice(0, 120)); }
  finally { live.release?.(); }
}
writeFileSync(out, JSON.stringify({ repo: nombre, dir, archivos, rows }));
console.log(`${nombre}: ${archivos} archivos, ${rows.length} con funciones`);
