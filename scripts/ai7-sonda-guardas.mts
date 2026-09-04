/**
 * AI7 — SONDA DE POBLACIÓN DE `conditionGuard`: cuántas guardas de ausencia
 * RECONOCE HOY el reconocedor de `null-object.ts` y cuántas reconocía ANTES de
 * las dos ramas nuevas (`x is null` de C# y `not x` de Python), sobre los
 * archivos REALES en los que la ruta de dispersión de Null Object muere.
 *
 * Es una COTA SUPERIOR de occurrences nuevas: cuenta el reconocimiento crudo y
 * no aplica las dos exclusiones que `scanFile` sí aplica aguas abajo
 * (`guardReassignsToConstruction`, `consequenceFailsFast`), que no están
 * exportadas. El número FIRME es el de la corrida del analizador real.
 * Sólo lectura, no toca producción.
 */
import { readFileSync } from "node:fs";

import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode } from "../src/server/services/detect/types.js";

function viejo(raw: string): string | null {
  const t = raw.trim().replace(/^\((.*)\)$/, "$1").trim();
  let m = /^([\w.@$]+)\s*(?:===?|==)\s*(?:nil|null|None|undefined)\b/.exec(t);
  if (m) return m[1]!;
  m = /^([\w.@$]+)\.nil\?/.exec(t);
  if (m) return m[1]!;
  m = /^([\w.@$]+)\s+is\s+None\b/.exec(t);
  if (m) return m[1]!;
  m = /^!\s*([\w.@$]+)\s*$/.exec(t);
  if (m) return m[1]!;
  return null;
}
function nuevoSolo(raw: string): string | null {
  const t = raw.trim().replace(/^\((.*)\)$/, "$1").trim();
  let m = /^([\w.@$]+)\s+is\s+null\b/.exec(t);
  if (m) return m[1]!;
  m = /^not\s+([\w.@$]+)\s*$/.exec(t);
  if (m) return m[1]!;
  return null;
}

function walk(n: AstNode, f: (n: AstNode) => void): void {
  f(n);
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i) as AstNode | null;
    if (c) walk(c, f);
  }
}

const [, , listaJson] = process.argv;
const lista = JSON.parse(readFileSync(listaJson!, "utf8")) as { dir: string; file: string; repo: string; pob: string }[];
const acc = new Map<string, { v: number; n: number; archivos: number; conNuevas: number }>();
for (const { dir, file, repo, pob } of lista) {
  let live;
  try {
    live = await resolveLiveFileUnit(dir, file);
  } catch {
    live = null;
  }
  if (!live) continue;
  let v = 0;
  let n = 0;
  walk(live.unit.root, (node) => {
    const cond = node.childForFieldName("condition") as AstNode | null;
    if (!cond) return;
    if (viejo(cond.text)) v++;
    else if (nuevoSolo(cond.text)) n++;
  });
  const k = `${pob}|${repo}|${live.unit.language}`;
  const e = acc.get(k) ?? { v: 0, n: 0, archivos: 0, conNuevas: 0 };
  e.v += v;
  e.n += n;
  e.archivos++;
  if (n > 0) e.conNuevas++;
  acc.set(k, e);
}
console.log("pob|repo|lenguaje\tarchivos\tguardas VIEJAS\tguardas NUEVAS\tarchivos con nuevas");
let tv = 0;
let tn = 0;
for (const [k, e] of [...acc.entries()].sort()) {
  console.log(`${k}\t${e.archivos}\t${e.v}\t${e.n}\t${e.conNuevas}`);
  tv += e.v;
  tn += e.n;
}
console.log(`TOTAL\t\t${tv}\t${tn}`);
