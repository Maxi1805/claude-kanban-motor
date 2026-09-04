/**
 * OLA AK, FRENTE AK1 — LA PRUEBA DE ADITIVIDAD, POR EL LADO DE LA GRAMÁTICA.
 * Auditoría, no producción.
 *
 * La SEXTA forma (`state.ts#isReceiverItself`) sólo puede confirmar algo cuando
 * `fnNode.childForFieldName("receiver")` devuelve un nodo. Esta sonda recorre
 * TODOS los archivos fuente de un repo, resuelve cada `FunctionUnit` y cuenta,
 * POR LENGUAJE y POR TIPO DE NODO, cuántas funciones exponen ese campo. Si en un
 * repo la cuenta es 0, la forma nueva no puede disparar ahí NI UNA VEZ, y el
 * delta de ese repo es 0 sin necesidad de una corrida pesada de `analyzeRepo`.
 *
 * Uso: npx tsx scripts/ak1-sonda-gramatica-receptor.mts <dir-repo> <salida.json>
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode } from "../src/server/services/detect/types.js";

const SKIP = new Set(["node_modules", ".git", "vendor", "dist", "build", "target", "__pycache__", ".venv", "venv"]);
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".py", ".rb", ".go", ".java", ".cs", ".php", ".kt", ".rs", ".c", ".cpp", ".h"]);

function walk(root: string, dir: string, out: string[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(root, p, out);
    else if (EXT.has(extname(e).toLowerCase())) out.push(relative(root, p));
  }
}

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: npx tsx scripts/ak1-sonda-gramatica-receptor.mts <dir-repo> <salida.json>"); process.exit(1); }

const files: string[] = [];
walk(dir, dir, files);

const porLenguaje: Record<string, { archivos: number; funciones: number; conReceiver: number; tiposConReceiver: Record<string, number> }> = {};
let archivosResueltos = 0;
const t0 = performance.now();
for (const rel of files) {
  const live = await resolveLiveFileUnit(dir, rel);
  if (!live) continue;
  archivosResueltos++;
  const unit = live.unit;
  const lang = unit.language;
  const b = (porLenguaje[lang] ??= { archivos: 0, funciones: 0, conReceiver: 0, tiposConReceiver: {} });
  b.archivos++;
  for (const fn of unit.functions) {
    b.funciones++;
    const node = fn.node as AstNode;
    if (node.childForFieldName("receiver")) {
      b.conReceiver++;
      b.tiposConReceiver[node.type] = (b.tiposConReceiver[node.type] ?? 0) + 1;
    }
  }
}
const wallMs = Math.round(performance.now() - t0);
writeFileSync(out, JSON.stringify({ dir, archivosVistos: files.length, archivosResueltos, wallMs, porLenguaje }, null, 1));
const resumen = Object.entries(porLenguaje).map(([l, b]) => `${l}:${b.conReceiver}/${b.funciones}`).join(" · ");
console.log(`${out}: ${archivosResueltos} archivos · ${wallMs}ms · ${resumen}`);
