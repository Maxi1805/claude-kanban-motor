/**
 * AO5 — SONDA 3, SÓLO LECTURA: el ANCLAJE de `null-object.ts#conditionGuard`.
 *
 * `conditionGuard` está ANCLADO al principio del texto de la condición
 * (`^([\w.@$]+)\s*(?:===?|==)\s*(?:nil|null|None|undefined)\b`, y las otras
 * cinco formas igual). Consecuencia por CONSTRUCCIÓN: un chequeo de ausencia
 * que no es el PRIMER operando de su condición no se puede reconocer nunca —
 * `if (opts.force && opts.target == null)` es invisible, `if (opts.target ==
 * null && opts.force)` no.
 *
 * Esta sonda CUENTA ese subconjunto. No cambia producción: compara, sobre las
 * MISMAS condiciones y con la MISMA función `conditionGuard` (copiada byte a
 * byte del módulo), cuántas reconoce hoy y cuántas reconocería si se le
 * preguntara también a cada OPERANDO de la condición.
 *
 * Uso: npx tsx scripts/ao5-sonda-guardas.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode } from "../src/server/services/detect/types.js";

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: npx tsx scripts/ao5-sonda-guardas.mts <dir> <salida.json>"); process.exit(1); }

/** COPIA BYTE A BYTE de `hypotheses/null-object.ts#conditionGuard` (líneas 1569-1586). */
function conditionGuard(rawText: string): { name: string; strict: boolean } | null {
  const trimmed = rawText.trim().replace(/^\((.*)\)$/, "$1").trim();
  let m = /^([\w.@$]+)\s*(?:===?|==)\s*(?:nil|null|None|undefined)\b/.exec(trimmed);
  if (m) return { name: m[1]!, strict: true };
  m = /^([\w.@$]+)\.nil\?/.exec(trimmed);
  if (m) return { name: m[1]!, strict: true };
  m = /^([\w.@$]+)\s+is\s+None\b/.exec(trimmed);
  if (m) return { name: m[1]!, strict: true };
  m = /^!\s*([\w.@$]+)\s*$/.exec(trimmed);
  if (m) return { name: m[1]!, strict: false };
  m = /^([\w.@$]+)\s+is\s+null\b/.exec(trimmed);
  if (m) return { name: m[1]!, strict: true };
  m = /^not\s+([\w.@$]+)\s*$/.exec(trimmed);
  if (m) return { name: m[1]!, strict: false };
  return null;
}

const LOGICO = /^(&&|\|\||and|or|!|not)$/;
function esLogico(n: AstNode): boolean {
  const op = n.childForFieldName("operator") as AstNode | null;
  return op !== null && LOGICO.test(op.text.trim());
}
function hijosNombrados(n: AstNode): AstNode[] {
  const o: AstNode[] = [];
  for (let i = 0; i < n.childCount; i++) { const c = n.child(i) as AstNode | null; if (c?.isNamed) o.push(c); }
  return o;
}
/** Operandos de una condición compuesta, hasta profundidad 4. */
function operandos(n: AstNode, prof: number, out: AstNode[]): void {
  if (prof <= 0) return;
  if (esLogico(n)) { for (const c of hijosNombrados(n)) operandos(c, prof - 1, out); return; }
  out.push(n);
}

const files = await collectFiles(dir);
let condiciones = 0, hoy = 0, conOperandos = 0;
const nuevosNombres = new Map<string, number>();
const ejemplos: { file: string; line: number; texto: string; nombre: string }[] = [];

for (const sf of files) {
  const live = await resolveLiveFileUnit(dir, sf.path);
  if (!live) continue;
  try {
    const visit = (n: AstNode): void => {
      const cond = n.childForFieldName("condition") as AstNode | null;
      if (cond) {
        condiciones++;
        const g0 = conditionGuard(cond.text);
        if (g0) hoy++;
        else {
          const ops: AstNode[] = [];
          operandos(cond, 4, ops);
          let hit: { name: string; strict: boolean } | null = null;
          for (const o of ops) { const g = conditionGuard(o.text); if (g) { hit = g; break; } }
          if (hit) {
            conOperandos++;
            nuevosNombres.set(hit.name, (nuevosNombres.get(hit.name) ?? 0) + 1);
            if (ejemplos.length < 40) ejemplos.push({ file: sf.path, line: n.startPosition.row + 1, texto: cond.text.slice(0, 110).replace(/\s+/g, " "), nombre: hit.name });
          }
        }
      }
      for (let i = 0; i < n.childCount; i++) { const c = n.child(i) as AstNode | null; if (c) visit(c); }
    };
    visit(live.unit.root);
  } finally { live.release(); }
}

const calificados = [...nuevosNombres.entries()].filter(([k]) => k.includes(".") || k.startsWith("@"));
writeFileSync(out, JSON.stringify({
  dir, archivos: files.length, condiciones,
  guardasHoy: hoy,
  guardasQueSoloSeVenPorOPERANDO: conOperandos,
  nombresNuevos: nuevosNombres.size,
  nombresNuevosCalificados: calificados.length,
  ejemplos,
}, null, 1));
console.log(`${out}: cond=${condiciones} hoy=${hoy} porOperando=+${conOperandos} nombresNuevos=${nuevosNombres.size} calificados=${calificados.length}`);
