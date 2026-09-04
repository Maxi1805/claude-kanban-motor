/**
 * SONDA AN1-a3 (Ola AN) — LA POBLACIÓN DE LA DIRECCIÓN (a), CON LA FUERZA Y LA
 * ESCALA PUESTAS ANTES DE MEDIR (`scratchpad-an1/CRITERIO.md`).
 *
 * La sonda anterior (`an1-sonda-a.mts`) contó "el mismo SUJETO decidido por >= 2
 * escaleras que suman >= 5 peldaños" y devolvió 462 casos en gitea, 447 de ellos
 * con sujeto `err`: `if err != nil` repetido, que es una GUARDA, no un despacho.
 * Esta sonda agrega la condición que separa una cosa de la otra y que es la
 * definición literal de la fuerza que Strategy resuelve:
 *
 *   FUERZA — la MISMA expresión se decide contra un ALFABETO de valores
 *            DISTINTOS. `err != nil` compara siempre contra el mismo valor:
 *            no hay alfabeto, no hay variantes que intercambiar.
 *   ESCALA — >= STRATEGY_MIN_BRANCHES (5) valores DISTINTOS, el número que
 *            `hypotheses/strategy.ts` ya usa, sin moverlo, y >= 2 escaleras
 *            SEPARADAS (si fuera una sola, `conditional-chain` ya la vería).
 *
 * NO TOCA PRODUCCIÓN. Uso:
 *   npx tsx scripts/an1-sonda-a3.mts <dirRepo> <dump.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import type { AstNode, FileUnit, FunctionUnit } from "../src/server/services/detect/types.js";

const [, , dir, dumpPath, outPath] = process.argv;
if (!dir || !dumpPath || !outPath) {
  console.error("uso: npx tsx scripts/an1-sonda-a3.mts <dirRepo> <dump.json> <salida.json>");
  process.exit(1);
}

const STRATEGY_MIN_BRANCHES = 5;
const N2 = new Set(["long-function", "complexity", "primitive-obsession"]);
const ANCLAS = new Set(["conditional-chain", "repeated-switch", "type-switch"]);
const COMPARISON_OPERATOR = /^(.*?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.*)$/s;

interface DumpFinding { id: string; kind: string; title: string; where: string[]; symbols: string[] }
const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as { findings: DumpFinding[] };

const conAncla = new Set<string>();
const n2Sitios = new Map<string, { file: string; symbol: string; kinds: Set<string> }>();
for (const f of dump.findings) {
  for (let i = 0; i < f.where.length; i++) {
    const w = f.where[i]!;
    const file = w.slice(0, w.lastIndexOf(":"));
    const symbol = f.symbols[i] ?? "";
    const k = `${file}|${symbol}`;
    if (ANCLAS.has(f.kind)) conAncla.add(k);
    if (N2.has(f.kind) && symbol) {
      const e = n2Sitios.get(k) ?? { file, symbol, kinds: new Set<string>() };
      e.kinds.add(f.kind);
      n2Sitios.set(k, e);
    }
  }
}
const porArchivo = new Map<string, { symbol: string; kinds: string[] }[]>();
let sitiosSinAncla = 0;
for (const [k, v] of n2Sitios) {
  if (conAncla.has(k)) continue;
  sitiosSinAncla++;
  const l = porArchivo.get(v.file) ?? [];
  l.push({ symbol: v.symbol, kinds: [...v.kinds].sort() });
  porArchivo.set(v.file, l);
}

function unwrap(node: AstNode): AstNode {
  if (node.childForFieldName("condition")) return node;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child?.isNamed && child.childForFieldName("condition")) return child;
  }
  return node;
}
const norm = (s: string): string => s.replace(/[()]/g, "").trim().toLowerCase();

/* Los MISMOS tres regex/listas que `hypotheses/strategy.ts` ya usa para juzgar
 * la ACCIÓN de una rama — copiados byte a byte, no reinventados, para que
 * "rama con comportamiento" signifique acá exactamente lo mismo que allá. */
const CALL_WORD = /(^|_)(call|invocation)(_|$)/;
const CALLEE_FIELDS = ["method", "function", "name"] as const;
const ACTION_FIELDS = ["consequence", "body"] as const;
const MAJORITY_RATIO = 0.5;

function branchAction(node: AstNode): AstNode | null {
  for (const f of ACTION_FIELDS) {
    const child = node.childForFieldName(f) as AstNode | null;
    if (child) return child;
  }
  return null;
}
function walk(node: AstNode, fn: (n: AstNode) => void): void {
  fn(node);
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c) walk(c, fn);
  }
}
function branchInvokesCall(action: AstNode): boolean {
  let found = false;
  walk(action, (n) => { if (!found && n.isNamed && CALL_WORD.test(n.type)) found = true; });
  return found;
}
function branchPrimaryCallee(action: AstNode): string | null {
  let best: AstNode | null = null;
  walk(action, (n) => {
    if (!n.isNamed || !CALL_WORD.test(n.type)) return;
    if (!best || n.text.length > (best as AstNode).text.length) best = n;
  });
  if (!best) return null;
  const node = best as AstNode;
  for (const f of CALLEE_FIELDS) {
    const child = node.childForFieldName(f) as AstNode | null;
    if (child) return child.text.trim();
  }
  return node.text.trim();
}

/** Peldaños de una escalera de `if`: (sujeto, valor comparado) por peldaño. Sólo cuenta los que tienen operador de comparación — sin operador no hay alfabeto que leer. */
function ifLadderRungs(root: AstNode): { subject: string; value: string; line: number; invoca: boolean; callee: string | null }[] {
  const out: { subject: string; value: string; line: number; invoca: boolean; callee: string | null }[] = [];
  let current: AstNode | null = root;
  while (current && current.childForFieldName("condition")) {
    const cond = current.childForFieldName("condition") as AstNode;
    const m = COMPARISON_OPERATOR.exec(cond.text.replace(/[()]/g, "").trim());
    const accion = branchAction(current);
    if (m) out.push({ subject: norm(m[1] ?? ""), value: norm(m[3] ?? ""), line: current.startPosition.row + 1, invoca: accion ? branchInvokesCall(accion) : false, callee: accion ? branchPrimaryCallee(accion) : null });
    const alt = current.childForFieldName("alternative") as AstNode | null;
    const siguiente = alt ? unwrap(alt) : null;
    current = siguiente && siguiente.childForFieldName("condition") ? siguiente : null;
  }
  return out;
}

interface Escalera { linea: number; rungs: { subject: string; value: string; line: number; invoca: boolean; callee: string | null }[] }

const resultados: {
  file: string; symbol: string; kinds: string[]; startLine: number; endLine: number;
  sujetos: { sujeto: string; escaleras: number; valores: string[]; lineas: number[]; peldanos: number; conInvocacion: number; callees: string[]; pasaComportamiento: boolean; porQueNo: string }[];
}[] = [];

let archivosVivos = 0, archivosMuertos = 0, funcionesHalladas = 0, funcionesNoHalladas = 0;

for (const [file, sitios] of porArchivo) {
  let live: { unit: FileUnit; release(): void } | null = null;
  try { live = await resolveLiveFileUnit(dir, file); } catch { live = null; }
  if (!live) { archivosMuertos++; continue; }
  archivosVivos++;
  const unit = live.unit;
  for (const s of sitios) {
    const fn: FunctionUnit | undefined = unit.functions.find((f) => (f.name ?? "") === s.symbol);
    if (!fn) { funcionesNoHalladas++; continue; }
    funcionesHalladas++;
    const sets = fn.sets;
    const escaleras: Escalera[] = [];
    const visto = new Set<number>();
    const visit = (node: AstNode): void => {
      if (node.isNamed && sets.chainNodes.has(node.type) && node.childForFieldName("condition")) {
        const linea = node.startPosition.row + 1;
        // Un elsif anidado vuelve a aparecer como raíz parcial: sólo se toma la
        // PRIMERA raíz de cada cadena (las líneas de sus peldaños quedan marcadas).
        if (!visto.has(linea)) {
          const rungs = ifLadderRungs(node);
          for (const r of rungs) visto.add(r.line);
          if (rungs.length > 0) escaleras.push({ linea, rungs });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const c = node.child(i) as AstNode | null;
        if (c) visit(c);
      }
    };
    visit(fn.node);
    const porSujeto = new Map<string, { valores: Set<string>; lineas: Set<number>; peldanos: number; invoca: number; callees: string[] }>();
    for (const e of escaleras) {
      for (const r of e.rungs) {
        if (!r.subject) continue;
        const acc = porSujeto.get(r.subject) ?? { valores: new Set<string>(), lineas: new Set<number>(), peldanos: 0, invoca: 0, callees: [] };
        acc.valores.add(r.value);
        acc.lineas.add(e.linea);
        acc.peldanos++;
        if (r.invoca) acc.invoca++;
        if (r.callee) acc.callees.push(r.callee);
        porSujeto.set(r.subject, acc);
      }
    }
    const sujetos = [...porSujeto.entries()]
      .filter(([, v]) => v.lineas.size >= 2 && v.valores.size >= STRATEGY_MIN_BRANCHES)
      .map(([sujeto, v]) => {
        /* LA MISMA prueba de `ramas-invocan-comportamiento-distinto`, con los
         * MISMOS dos umbrales (`MAJORITY_RATIO`, `topCount >= 2`) — no un
         * criterio nuevo. */
        const literales = v.peldanos - v.invoca;
        let pasa = true;
        let porQueNo = "";
        if (literales / v.peldanos >= MAJORITY_RATIO) { pasa = false; porQueNo = `${literales}/${v.peldanos} ramas sin invocar nada (tabla de clasificación)`; }
        else if (v.callees.length < 2) { pasa = false; porQueNo = "menos de dos ramas con invocación identificable"; }
        else {
          const cuenta = new Map<string, number>();
          for (const c of v.callees) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
          const top = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]!;
          if (top[1] >= 2 && top[1] / v.callees.length >= MAJORITY_RATIO) { pasa = false; porQueNo = `${top[1]}/${v.callees.length} ramas invocan la MISMA operación ("${top[0]}")`; }
        }
        return { sujeto, escaleras: v.lineas.size, valores: [...v.valores].sort(), lineas: [...v.lineas].sort((a, b) => a - b), peldanos: v.peldanos, conInvocacion: v.invoca, callees: v.callees, pasaComportamiento: pasa, porQueNo };
      });
    if (sujetos.some((s) => s.pasaComportamiento)) resultados.push({ file, symbol: s.symbol, kinds: s.kinds, startLine: fn.startLine, endLine: fn.endLine, sujetos });
  }
  live.release();
}

writeFileSync(outPath, JSON.stringify({ dir, sitiosN2SinAncla: sitiosSinAncla, archivosVivos, archivosMuertos, funcionesHalladas, funcionesNoHalladas, casos: resultados.length, resultados }, null, 1));
console.log(`${dir}: sitios n2 SIN ancla ${sitiosSinAncla} · funciones ${funcionesHalladas} · CASOS que pasan FUERZA+ESCALA+COMPORTAMIENTO: ${resultados.length}`);
